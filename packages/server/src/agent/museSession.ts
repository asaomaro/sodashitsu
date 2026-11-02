import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isForkSessionId, RpcError } from "@sodashitsu/protocol";
import type { ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { extraRoot } from "../conversation/ExtraAgentRecords.js";
import { windowsAgentExecutable } from "./windowsAgentLaunch.js";
function commandId() {
  const hex =
    Date.now().toString(16).padStart(12, "0") + randomUUID().replaceAll("-", "").slice(12);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Only read/fork are exposed: no turn submission, approval, subscriptions, or writer resume. */
export async function museSession(
  method: "session/read" | "session/fork",
  id: string,
  opts: {
    roots?: ExtraRoots | undefined;
    cwd?: string;
    signal?: AbortSignal;
    executable?: string;
    timeoutMs?: number;
  } = {},
): Promise<any> {
  if (!isForkSessionId(id)) throw new RpcError("invalid_params", "Museの会話IDが正しくありません");
  opts.signal?.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), "soda-muse-read-"));
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("SODA_") || key.startsWith("SODACTL_")) delete env[key];
    // read never loads a session or emits SessionResumed. Empty tools/provider avoids network work.
    if (method === "session/read") {
      env.XDG_CONFIG_HOME = join(dir, "config");
      await mkdir(join(env.XDG_CONFIG_HOME, "muse"), { recursive: true });
    }
    env.XDG_DATA_HOME = join(extraRoot("muse", opts.roots), "..", "..");
    env.MUSE_NO_AUTO_UPDATE = "1";
    env.MUSE_LOGIN = "0";
    const args = [
      "serve",
      ...(method === "session/read" ? ["--provider", "echo", "--preset", "empty"] : []),
      "--disable-shell",
      "--disable-write",
    ];
    const target =
      process.platform === "win32"
        ? await windowsAgentExecutable("muse", env)
        : { file: opts.executable ?? "muse", prefix: [] };
    return await new Promise((resolve, reject) => {
      const child = spawn(target.file, [...target.prefix, ...args], {
        cwd: opts.cwd ?? dir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      let buffer = "",
        done = false,
        total = 0,
        settled = false;
      let failure: Error | undefined,
        result: unknown,
        escalation: ReturnType<typeof setTimeout> | undefined;
      child.stdout.setEncoding("utf8");
      const kill = (signal: NodeJS.Signals) => {
        if (process.platform !== "win32" && child.pid) {
          try {
            process.kill(-child.pid, signal);
            return;
          } catch {}
        }
        child.kill(signal);
      };
      const finish = (error?: Error, value?: unknown) => {
        if (done) return;
        done = true;
        failure = error;
        result = value;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", abort);
        child.stdin.end();
        if (process.platform === "win32" && child.pid) {
          const killer = spawn(
            join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
            ["/PID", String(child.pid), "/T", "/F"],
            { stdio: "ignore", windowsHide: true },
          );
          killer.on("error", () => kill("SIGKILL"));
        } else kill("SIGTERM");
        escalation = setTimeout(() => kill("SIGKILL"), 200);
        escalation.unref();
      };
      child.on("close", () => {
        if (settled) return;
        settled = true;
        if (done && process.platform !== "win32") kill("SIGKILL");
        clearTimeout(timer);
        clearTimeout(escalation);
        opts.signal?.removeEventListener("abort", abort);
        if (!done) failure = new RpcError("not_found", "Museの会話APIが終了しました");
        failure ? reject(failure) : resolve(result);
      });
      const abort = () => finish(new RpcError("fork_failed", "Museの操作を中断しました"));
      const timer = setTimeout(
        () => finish(new RpcError("not_found", "Museの会話APIが応答しませんでした")),
        opts.timeoutMs ?? 10000,
      );
      opts.signal?.addEventListener("abort", abort, { once: true });
      if (opts.signal?.aborted) abort();
      const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
      child.on("error", () => finish(new RpcError("not_found", "muse コマンドを起動できません")));
      child.on("exit", () => finish(new RpcError("not_found", "Museの会話APIが終了しました")));
      child.stdin.on("error", () => finish(new RpcError("not_found", "Museとの接続が切れました")));
      child.stderr.resume();
      child.stdout.on("data", (chunk: string) => {
        if (done) return;
        total += Buffer.byteLength(chunk);
        if (total > 8 * 1024 * 1024)
          return finish(new RpcError("not_found", "Museの会話APIの読取上限を超えました"));
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          let row: any;
          try {
            row = JSON.parse(line);
          } catch {
            return finish(new RpcError("not_found", "Museの会話APIの形式が不正です"));
          }
          if (row.id === 1) {
            if (row.error)
              return finish(new RpcError("not_found", "Museの会話APIに対応していません"));
            send({ jsonrpc: "2.0", method: "initialized", params: {} });
            send({
              jsonrpc: "2.0",
              id: 2,
              method,
              params: {
                sessionId: id,
                ...(method === "session/fork"
                  ? { commandId: commandId(), excludeItems: true }
                  : { excludeItems: false }),
              },
            });
          } else if (row.id === 2) {
            if (method === "session/read" && row.result?.session?.sessionId !== id)
              return finish(new RpcError("not_found", "Museの会話IDが一致しません"));
            if (row.error)
              return finish(new RpcError("not_found", "Museの会話を取得・分岐できません"));
            finish(undefined, row.result);
          }
        }
      });
      if (!done)
        send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "sodashitsu", version: "1.0.0" },
            capabilities: { userInputDialogs: false },
          },
        });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function forkMuseSession(
  id: string,
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  const value = await museSession("session/fork", id, { cwd, signal });
  const next = value?.session?.sessionId;
  if (typeof next !== "string" || !isForkSessionId(next) || next === id)
    throw new RpcError("fork_failed", "Museの分岐先を確認できません");
  return next;
}
