import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcError } from "@sodashitsu/protocol";

const unavailable = () => new RpcError("unsupported_agent_kind", "Cursorの要約には任意のCursor SDKと、CURSOR_API_KEYまたはSDK専用ログインが必要です。通常のCursor CLIログインは自動流用しません。");
export interface CursorSummaryJob {
  model: string;
  effort?: string;
  sessionId?: string;
  prompt: string;
  check: () => void;
}
export class CursorSdkSummarySupervisor {
  private readonly children = new Set<ChildProcess>();
  private closed = false;
  private cleanupUnconfirmed = false;
  private readonly retireWatchers = new WeakMap<ChildProcess, () => void>();
  private readonly stopping = new WeakSet<ChildProcess>();
  constructor(private readonly options: {
    worker?: URL;
    deadlineMs?: number;
    accessIntervalMs?: number;
    // Test seam: production always uses the SDK's public default path resolver.
    authPath?: () => Promise<string>;
    tempRoot?: string;
    retirementMs?: number;
    /** Generated process tests only; production always retires the owned OS tree. */
    retireTree?: (child: ChildProcess) => void;
  } = {}) {}
  close() {
    this.closed = true;
    for (const child of this.children) this.stop(child);
  }
  private stop(child: ChildProcess) {
    if (!child.pid || this.stopping.has(child)) return;
    this.stopping.add(child);
    this.retireWatchers.get(child)?.();
    try { if (child.connected) child.send("cancel", () => undefined); } catch {}
    const force = setTimeout(() => {
      if (this.options.retireTree) { this.options.retireTree(child); return; }
      if (process.platform === "win32") {
        // A vanished parent PID is not a safe/reliable Windows tree owner.
        if (child.exitCode !== null || child.signalCode !== null) return;
        const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
          ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => child.kill());
      } else {
        try { process.kill(-child.pid!, "SIGKILL"); } catch { child.kill(); }
      }
    }, 500);
    force.unref();
    child.once("close", () => clearTimeout(force));
  }
  private assertAvailable() {
    if (this.cleanupUnconfirmed) throw new RpcError("agent_prompt_failed", "前のCursor SDKの終了を確認できないため、新しい要約を開始できません");
    if (this.closed) throw new RpcError("agent_prompt_failed", "サーバを停止しています");
  }
  async run(job: CursorSummaryJob): Promise<{ text: string; sessionId: null }> {
    job.check();
    this.assertAvailable();
    if (job.sessionId || job.effort) throw new RpcError("invalid_params", "Cursor SDKの要約は毎回独立して生成します。個別のeffort指定にはまだ対応していません。");
    if (!job.model) throw new RpcError("invalid_params", "Cursor SDKの要約に使うモデルを明示的に選択してください");
    if (job.model.length > 512 || !job.prompt || Buffer.byteLength(job.prompt) > 384 * 1024)
      throw new RpcError("invalid_params", "Cursorの要約入力の上限を超えました");
    let authPath: string;
    try {
      authPath = this.options.authPath ? await this.options.authPath() : (await import("@cursor/sdk")).getDefaultSdkAuthPath();
    } catch { throw unavailable(); }
    job.check();
    this.assertAvailable();
    const dir = await mkdtemp(join(this.options.tempRoot ?? tmpdir(), "soda-cursor-summary-"));
    let cleanupConfirmed = true;
    try {
      const home = join(dir, "home"), cwd = join(dir, "work"), store = join(dir, "store");
      await Promise.all([home, cwd, store].map(path => mkdir(path, { mode: 0o700 })));
      const env: NodeJS.ProcessEnv = {};
      for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "TZ"])
        if (process.env[key] !== undefined) env[key] = process.env[key];
      Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: join(home, "appdata"), LOCALAPPDATA: join(home, "localappdata"),
        XDG_CONFIG_HOME: join(home, "config"), XDG_DATA_HOME: join(home, "data"), XDG_CACHE_HOME: join(home, "cache"),
        TMPDIR: dir, TMP: dir, TEMP: dir });
      const apiKey = process.env.CURSOR_API_KEY;
      const input = JSON.stringify({ model: job.model, prompt: job.prompt, authPath, cwd, store,
        ...(apiKey ? { apiKey } : {}) });
      if (Buffer.byteLength(input) > 512 * 1024) throw new RpcError("invalid_params", "Cursorの要約入力の上限を超えました");
      job.check();
      this.assertAvailable();
      const result = await new Promise<{ text: string; sessionId: null }>((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(this.options.worker ?? new URL("./cursorSdkSummaryWorker.js", import.meta.url))],
          { cwd, env, stdio: ["pipe", "pipe", "ignore", "ipc"], detached: process.platform !== "win32", windowsHide: true });
        this.children.add(child);
        cleanupConfirmed = false;
        const chunks: Buffer[] = [];
        let bytes = 0, failure: unknown, settled = false, unconfirmed = false;
        let retirement: ReturnType<typeof setTimeout> | undefined;
        const finishUnconfirmed = () => {
          if (settled) return;
          settled = true; unconfirmed = true; this.cleanupUnconfirmed = true;
          clearTimeout(timer); clearInterval(access); clearTimeout(retirement);
          // Detaching owned handles bounds this operation; it does not prove
          // descendants died. Keep private state and refuse new SDK jobs.
          child.stdin?.destroy(); child.stdout?.destroy();
          try { if (child.connected) child.disconnect(); } catch {}
          process.stderr.write("soda: Cursor SDK close unconfirmed; private temporary state retained; new SDK summaries disabled\n");
          reject(new RpcError("agent_prompt_failed", "Cursor SDKの終了を確認できません。結果を破棄し、一時保存先を保持しました"));
        };
        const armRetirement = () => {
          retirement ??= setTimeout(finishUnconfirmed, this.options.retirementMs ?? 2000);
        };
        this.retireWatchers.set(child, armRetirement);
        const fail = (error: unknown) => { if (failure) return; failure = error; this.stop(child); };
        const timer = setTimeout(() => fail(new RpcError("agent_prompt_failed", "要約が時間内に完了しませんでした")), this.options.deadlineMs ?? 120000);
        const access = setInterval(() => {
          try { job.check(); if (this.closed) throw new Error("closed"); }
          catch { fail(new RpcError("agent_prompt_failed", "接続または会話が変更されました")); }
        }, this.options.accessIntervalMs ?? 250);
        child.stdin!.on("error", () => undefined);
        child.stdout!.on("data", (chunk: Buffer) => {
          if (failure) return;
          bytes += chunk.length;
          if (bytes > 512 * 1024) return fail(new RpcError("agent_prompt_failed", "要約の出力上限を超えました"));
          chunks.push(Buffer.from(chunk));
        });
        // Wait for physical close even after spawn error/invalid result, before cleanup or settlement.
        child.on("error", () => { failure ??= unavailable(); armRetirement(); });
        child.on("exit", () => {
          armRetirement();
          if (process.platform !== "win32" && child.pid) {
            // The worker has exited; a remaining owned group means descendants
            // still exist. Fail closed and retire that group, even after exitCode.
            let groupExists = false;
            try { process.kill(-child.pid, 0); groupExists = true; }
            catch(error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") finishUnconfirmed(); }
            if (groupExists) {
              failure ??= new RpcError("agent_prompt_failed", "Cursor SDKの子プロセスが残ったため結果を破棄しました");
              // Retire immediately: close may follow exit before the ordinary
              // 500ms cancellation grace and clear its timer.
              try {
                if (this.options.retireTree) this.options.retireTree(child);
                else process.kill(-child.pid, "SIGKILL");
              } catch { finishUnconfirmed(); }
            }
          }
        });
        child.on("close", code => {
          clearTimeout(timer); clearInterval(access); clearTimeout(retirement);
          this.retireWatchers.delete(child); this.children.delete(child);
          if (unconfirmed || settled) return;
          settled = true; cleanupConfirmed = true;
          if (failure) { reject(failure); return; }
          try {
            job.check();
            if (this.closed) throw new Error("closed");
            const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!value || typeof value !== "object") throw new Error("invalid");
            const v = value as Record<string, unknown>;
            if (v.ok === false && v.reason === "unavailable") { reject(unavailable()); return; }
            if (code !== 0 || v.ok !== true || typeof v.text !== "string" || !v.text.trim() || Buffer.byteLength(v.text) > 128 * 1024)
              throw new Error("failed");
            resolve({ text: v.text, sessionId: null });
          } catch { reject(new RpcError("agent_prompt_failed", "Cursor SDKの要約を生成できませんでした")); }
        });
        child.stdin!.end(input);
      });
      job.check();
      return result;
    } finally {
      if (cleanupConfirmed) await rm(dir, { recursive: true, force: true });
    }
  }
}
