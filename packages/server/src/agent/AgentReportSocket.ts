import { createServer, type Server } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import { platform } from "node:os";
import type { AgentIntegrationKind } from "@wtm/protocol";
import type { Logger } from "../log/Logger.js";

/**
 * 公式フック連携（20260923-agent-session-resume）の hook スクリプトからの report を受け取るローカル
 * IPC（design「4. ローカル report 経路」）。1接続1メッセージ（改行区切りJSON）。
 * `{"paneId": "...", "kind": "claude"|"codex", "sessionId": "..."}` を受け、既知の `kind` かどうかは
 * ここでは検査しない（呼び出し側の `onReport` が `SessionModel` の実在パネル・resume コマンド解決で
 * 未知の値を無害に弾く。report 経路は best-effort——不正・破損したメッセージは黙って捨てる）。
 */
export interface AgentReportSocket {
  readonly path: string;
  close(): Promise<void>;
}

export type AgentReportHandler = (paneId: string, kind: string, sessionId: string) => void;

const MAX_LINE_BYTES = 4096; // 1メッセージの上限（想定外に大きい入力を溜め込まない）

export async function startAgentReportSocket(path: string, onReport: AgentReportHandler, logger: Logger): Promise<AgentReportSocket> {
  const server = createServer((sock) => {
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_LINE_BYTES) {
        sock.destroy();
        return;
      }
    });
    sock.on("end", () => handleLine(buf, onReport, logger));
    sock.on("error", () => {
      // 接続元（hook スクリプト）が異常終了しても report 1件を諦めるだけ。
    });
  });
  server.on("error", (err) => {
    logger.warn("agent report socket error", { path, error: String(err) });
  });

  await listenUnixSocketReplacingStale(server, path);
  if (platform() !== "win32") {
    // 同一利用者限定にする（非機能要件「報告経路の安全性」。design D5）。Windows の named pipe の
    // 権限限定は別途（既知の制約。docs/verification.md の手動確認へ回す）。
    await chmod(path, 0o600).catch((err: unknown) => {
      logger.warn("failed to restrict agent report socket permissions", { path, error: String(err) });
    });
  }

  return {
    path,
    close(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * stale なソケットファイル（前回の不正終了の残骸）を検出して作り直す（design D12）。`handoff.sock`（20260926-live-handoff）も使う——
 * execve で入れ替わった新しい版から見ると、古い版の socket のファイルは残骸と同じ。
 */
export async function listenUnixSocketReplacingStale(server: Server, path: string): Promise<void> {
  try {
    await listenOnce(server, path);
  } catch (err) {
    if (platform() === "win32" || !isAddrInUse(err)) throw err;
    // `StateDirLock` が同じ state dir への二重起動を別途防いでいるので、残っているファイルは安全に削除できる。
    await unlink(path).catch(() => undefined);
    await listenOnce(server, path);
  }
}

function listenOnce(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function isAddrInUse(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "EADDRINUSE";
}

function handleLine(raw: string, onReport: AgentReportHandler, logger: Logger): void {
  const line = raw.trim();
  if (!line) return;
  let payload: unknown;
  try {
    payload = JSON.parse(line);
  } catch {
    logger.debug("agent report: invalid JSON, ignoring");
    return;
  }
  if (!isReportPayload(payload)) {
    logger.debug("agent report: unexpected shape, ignoring");
    return;
  }
  onReport(payload.paneId, payload.kind, payload.sessionId);
}

function isReportPayload(v: unknown): v is { paneId: string; kind: AgentIntegrationKind | string; sessionId: string } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.paneId === "string" && typeof o.kind === "string" && typeof o.sessionId === "string";
}
