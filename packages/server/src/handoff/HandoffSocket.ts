import { createServer, type Socket } from "node:net";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { listenUnixSocketReplacingStale } from "../agent/AgentReportSocket.js";
import type { Logger } from "../log/Logger.js";
import type { HandoffReply, HandoffStatus } from "./HandoffController.js";

/**
 * 引き継ぎの指示の受け口（20260926-live-handoff。design「`handoff.sock`」・decisions D3）。状態ディレクトリの Unix ドメイン socket で、
 * 待ち受けたら 0600（同じ利用者だけ）。1 接続 1 行の JSON: `{"op":"handoff"}` → `HandoffReply`／`{"op":"status"}` → `HandoffStatus`。
 * Windows では作らない（呼び出し側が判断する）。新しい TCP の待ち受けは作らない。
 */
export const HANDOFF_SOCKET_FILE_NAME = "handoff.sock";
const MAX_LINE_BYTES = 4096;

export function handoffSocketPathFor(stateDir: string): string {
  return join(stateDir, HANDOFF_SOCKET_FILE_NAME);
}

export interface HandoffRequestHandler {
  request(reply: (r: HandoffReply) => Promise<void>): Promise<void>;
  status(): HandoffStatus;
}

export interface HandoffSocket {
  readonly path: string;
  close(): Promise<void>;
}

function writeLine(sock: Socket, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sock.destroyed) {
      reject(new Error("connection closed"));
      return;
    }
    sock.write(`${JSON.stringify(value)}\n`, (err) => (err ? reject(err) : resolve()));
  });
}

export async function startHandoffSocket(
  path: string,
  handler: HandoffRequestHandler,
  logger: Logger,
): Promise<HandoffSocket> {
  const server = createServer((sock) => {
    let buf = "";
    let handled = false;
    sock.setEncoding("utf8");
    sock.on("error", () => undefined); // 相手（CLI）が途中で切っても、受け口は止めない
    sock.on("data", (chunk: string) => {
      if (handled) return;
      buf += chunk;
      const nl = buf.indexOf("\n");
      // 改行の前までの長さでも上限を見る（改行を含む大きな 1 つのかたまりでも読まない）。
      if (Buffer.byteLength(nl < 0 ? buf : buf.slice(0, nl)) > MAX_LINE_BYTES) {
        handled = true;
        sock.destroy();
        return;
      }
      if (nl < 0) return;
      handled = true;
      void handleLine(buf.slice(0, nl), sock, handler, logger);
    });
  });
  server.on("error", (err) => logger.warn("handoff socket error", { path, error: String(err) }));
  await listenUnixSocketReplacingStale(server, path);
  // listen から chmod までの間は umask の権限で見えるが、状態ディレクトリの中なので、そのディレクトリを読める人に限られる（AgentReportSocket と同じ）。
  try {
    await chmod(path, 0o600);
  } catch (err) {
    // 権限を絞れない受け口は置かない（同じ利用者に限る根拠が権限だけのため。decisions D3）。
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw err;
  }
  return {
    path,
    close(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function handleLine(
  line: string,
  sock: Socket,
  handler: HandoffRequestHandler,
  logger: Logger,
): Promise<void> {
  let op: unknown;
  try {
    op = (JSON.parse(line) as { op?: unknown } | null)?.op;
  } catch {
    op = undefined;
  }
  try {
    if (op === "status") {
      await writeLine(sock, handler.status());
    } else if (op === "handoff") {
      // 成功したら execve で戻らない（接続はプロセスの入れ替わりで閉じる）。
      await handler.request((r) => writeLine(sock, r));
    } else {
      await writeLine(sock, {
        ok: false,
        reason: "bad_request",
        message: 'expected {"op":"handoff"} or {"op":"status"}',
      });
    }
  } catch (err) {
    logger.warn("handoff socket: request failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sock.end();
  }
}
