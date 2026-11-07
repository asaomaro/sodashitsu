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
  private readonly stopping = new WeakSet<ChildProcess>();
  constructor(private readonly options: {
    worker?: URL;
    deadlineMs?: number;
    accessIntervalMs?: number;
    // Test seam: production always uses the SDK's public default path resolver.
    authPath?: () => Promise<string>;
    tempRoot?: string;
  } = {}) {}
  close() {
    this.closed = true;
    for (const child of this.children) this.stop(child);
  }
  private stop(child: ChildProcess) {
    if (!child.pid || this.stopping.has(child)) return;
    this.stopping.add(child);
    try { if (child.connected) child.send("cancel", () => undefined); } catch {}
    const force = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === "win32") {
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
  async run(job: CursorSummaryJob): Promise<{ text: string; sessionId: null }> {
    job.check();
    if (this.closed) throw new RpcError("agent_prompt_failed", "サーバを停止しています");
    if (job.sessionId || job.effort) throw new RpcError("invalid_params", "Cursor SDKの要約は毎回独立して生成します。個別のeffort指定にはまだ対応していません。");
    if (!job.model || job.model.length > 512 || !job.prompt || Buffer.byteLength(job.prompt) > 384 * 1024)
      throw new RpcError("invalid_params", "Cursorの要約入力の上限を超えました");
    let authPath: string;
    try {
      authPath = this.options.authPath ? await this.options.authPath() : (await import("@cursor/sdk")).getDefaultSdkAuthPath();
    } catch { throw unavailable(); }
    job.check();
    if (this.closed) throw new RpcError("agent_prompt_failed", "サーバを停止しています");
    const dir = await mkdtemp(join(this.options.tempRoot ?? tmpdir(), "soda-cursor-summary-"));
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
      if (this.closed) throw new RpcError("agent_prompt_failed", "サーバを停止しています");
      const result = await new Promise<{ text: string; sessionId: null }>((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(this.options.worker ?? new URL("./cursorSdkSummaryWorker.js", import.meta.url))],
          { cwd, env, stdio: ["pipe", "pipe", "ignore", "ipc"], detached: process.platform !== "win32", windowsHide: true });
        this.children.add(child);
        const chunks: Buffer[] = [];
        let bytes = 0, failure: unknown;
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
        child.on("error", () => { failure ??= unavailable(); });
        child.on("close", code => {
          clearTimeout(timer); clearInterval(access); this.children.delete(child);
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
      await rm(dir, { recursive: true, force: true });
    }
  }
}
