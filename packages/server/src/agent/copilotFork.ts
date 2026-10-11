import { fileURLToPath } from "node:url";
import { win32 } from "node:path";
import { spawn } from "node:child_process";
import { RpcError, isForkSessionId } from "@sodashitsu/protocol";

/** Copilot SDK の stdio transport と sessions.fork を使い、保存済み会話だけを分岐する。
 * 元セッションのresumeやpromptは送らない。CLI 更新も自動承認も行わない。 */
export async function forkCopilotSession(sessionId: string, cwd: string, signal: AbortSignal, executable = "copilot"): Promise<string> {
  if (!isForkSessionId(sessionId)) throw new RpcError("fork_failed", "invalid Copilot session id");
  if (signal.aborted) throw new RpcError("fork_failed", "fork cancelled");
  return new Promise((resolve, reject) => {
    const flags=["--headless", "--stdio", "--no-auto-update"];
    const windows=process.platform === "win32";
    const child = spawn(windows ? process.execPath : executable, windows ? [fileURLToPath(new URL("./windowsAgentLaunch.js",import.meta.url)),Buffer.from(JSON.stringify({executable,args:flags}),"utf8").toString("base64")] : flags, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: false });
    let buffer = Buffer.alloc(0);
    let done = false;
    let forked: string | undefined;
    const finish = (error?: Error, id?: string): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      child.stdin.end();
      if(windows && child.pid){const killer=spawn(win32.join(process.env["SystemRoot"]??"C:\\Windows","System32","taskkill.exe"),["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});killer.on("error",()=>child.kill());}
      else child.kill();
      if (error) reject(error); else resolve(id!);
    };
    const failure = (message: string): RpcError => new RpcError("fork_failed", message);
    const abort = (): void => finish(failure("Copilot fork cancelled"));
    const timer = setTimeout(() => finish(failure("Copilot の fork API が応答しませんでした。CLI を更新し、ログイン状態を確認してください")), 30_000);
    signal.addEventListener("abort", abort, { once: true });
    const send = (id: number, method: string, params: object): void => {
      const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };
    child.on("error", () => finish(failure("copilot コマンドを起動できませんでした")));
    child.on("exit", () => finish(failure("Copilot の fork API を起動できませんでした。対応する CLI に更新してください")));
    child.stdin.on("error", () => finish(failure("Copilot の fork API との接続が切れました")));
    // stderr は保存・表示しない（認証情報や会話を含む可能性がある）。
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      if (done) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 1024 * 1024) return finish(failure("Copilot fork API response is too large"));
      try {
        while (!done) {
          const end = buffer.indexOf("\r\n\r\n");
          if (end < 0) return;
          const match = /^Content-Length:\s*(\d+)\s*$/im.exec(buffer.subarray(0, end).toString());
          const length = match ? Number(match[1]) : NaN;
          if (!Number.isSafeInteger(length) || length < 1 || length > 1024 * 1024) return finish(failure("invalid Copilot RPC frame"));
          if (buffer.length < end + 4 + length) return;
          const msg = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString()) as { id?: number; error?: { code?: number }; result?: { sessionId?: string } };
          buffer = buffer.subarray(end + 4 + length);
          if (msg.id === 1) {
            if (msg.error && msg.error.code !== -32601) return finish(failure("Copilot fork API connection failed"));
            send(2, "sessions.fork", { sessionId });
          } else if (msg.id === 2) {
            const id = msg.result?.sessionId;
            if (msg.error || typeof id !== "string" || !isForkSessionId(id) || id === sessionId) return finish(failure("Copilot の会話を分岐できませんでした。sessions.fork 対応版と元の会話の記録を確認してください"));
            forked = id;
            // 分岐先だけを開き、作業フォルダを明示して記録する。ユーザーの指示は送らない。
            send(3, "session.resume", { sessionId: id, workingDirectory: cwd });
          } else if (msg.id === 3) {
            if (msg.error) return finish(failure(`Copilot の分岐先の作業フォルダを設定できませんでした（分岐した会話 ${forked} は残っています）`));
            finish(undefined, forked);
          }
        }
      } catch { finish(failure("invalid Copilot fork API response")); }
    });
    send(1, "connect", {});
  });
}
