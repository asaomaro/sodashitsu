import { createServer, type Server } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import { platform } from "node:os";
import type { Logger } from "../log/Logger.js";

/**
 * 公式フック連携（20260923-agent-session-resume）の hook スクリプトからの report を受け取るローカル
 * IPC（design「4. ローカル report 経路」）。1接続1メッセージ（改行区切りJSON）。
 * `{"paneId": "...", "kind": "claude"|"codex", "sessionId": "..."}` を受け、既知の `kind` かどうかは
 * ここでは検査しない（呼び出し側の `onReport` が `SessionModel` の実在パネル・resume コマンド解決で
 * 未知の値を無害に弾く。report 経路は best-effort——不正・破損したメッセージは黙って捨てる）。
 *
 * サブエージェントの表示（20261004-subagent-display）のため、`type` つきの電文も受ける（`type` の無い電文は今までどおり
 * セッション ID の報告）。スクリプトの切り詰めに頼らず、受け口でも同じ上限を掛ける（名乗りは検証されない）。
 */
export interface AgentReportSocket {
  readonly path: string;
  close(): Promise<void>;
}

/** 受け口が解釈した報告。`session` は `type` の無い電文（今までのセッション ID の報告）。 */
export type AgentReport = AgentReportBody & {
  /** 報告したエージェントのプロセスの pid（フックが足す。無ければ付かない）。pane の中のプログラムが好きに書ける値で、取り違えを防ぐための材料。 */
  agentPid?: number;
  /** 報告したエージェントの作業フォルダ（フックの入力の `cwd`）。常駐のプロセス（Codex の daemon）の報告を pane に結ぶのに使う。 */
  cwd?: string;
  /** 会話が始まった理由（フックの入力の `source`。`startup`・`resume`・`clear`・`compact`・`fork`）。 */
  source?: string;
};
type AgentReportBody =
  | { type: "session"; paneId: string; kind: string; sessionId: string }
  | { type: "subagent_pending"; paneId: string; kind: string; sessionId: string; description?: string; agentType?: string; background?: boolean; parentAgentId?: string; transcriptPath?: string }
  | { type: "subagent_start"; paneId: string; kind: string; sessionId: string; agentId: string; agentType?: string; transcriptPath?: string }
  | { type: "subagent_stop"; paneId: string; kind: string; sessionId: string; agentId: string }
  | {
      type: "agent_stop";
      paneId: string;
      kind: string;
      sessionId: string;
      running: { id: string; agentType?: string; description?: string }[];
      truncated: boolean;
    }
  | { type: "session_end"; paneId: string; kind: string; sessionId: string };

export type AgentReportHandler = (report: AgentReport) => void;

const MAX_LINE_CHARS = 32768; // 1メッセージの上限（想定外に大きい入力を溜め込まない。`running` 64 件が収まる大きさ）
const MAX_DESCRIPTION = 200;
const MAX_AGENT_TYPE = 64;
const MAX_ID = 128;
const MAX_RUNNING = 64;
const MAX_PATH = 1024;

export async function startAgentReportSocket(path: string, onReport: AgentReportHandler, logger: Logger): Promise<AgentReportSocket> {
  const server = createServer((sock) => {
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_LINE_CHARS) {
        sock.destroy();
        return;
      }
    });
    sock.on("end", () => handleLine(buf, onReport, logger));
    sock.on("error", () => {
      // 接続元（hook スクリプト）が異常終了しても report 1件を諦めるだけ。
    });
  });
  await listenUnixSocketReplacingStale(server, path);
  // 待ち受けを始めた後の誤りだけを記録する。最初の `listen` の `EADDRINUSE`（前の版・前回の不正終了の socket のファイルが残っている）は、
  // `listenUnixSocketReplacingStale` が消して作り直すので、先に付けておくと、作り直せたのに毎回警告が出る（`soda handoff` のたび）。
  server.on("error", (err) => {
    logger.warn("agent report socket error", { path, error: String(err) });
  });
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
  const report = parseReport(payload);
  if (!report) {
    logger.debug("agent report: unexpected shape, ignoring");
    return;
  }
  onReport(report);
}

/** 文字（コードポイント）単位で切る。空・文字列でないものは undefined。 */
function cut(v: unknown, max: number): string | undefined {
  if (typeof v !== "string" || v === "") return undefined;
  const chars = Array.from(v);
  return chars.length > max ? chars.slice(0, max).join("") : v;
}

/** 長さが 1〜`MAX_ID` 文字の ID だけを通す（超えるものは undefined）。 */
function idOf(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" && Array.from(v).length <= MAX_ID ? v : undefined;
}

/** 場所は切らない（切ると別の場所になる）。空・長すぎる・NUL を含むものは undefined。中身が安全かは、使う側（読む前）が確かめる。 */
function pathOf(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" && !v.includes("\0") && Array.from(v).length <= MAX_PATH ? v : undefined;
}

function parseReport(v: unknown): AgentReport | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.paneId !== "string" || typeof o.kind !== "string" || typeof o.sessionId !== "string") return undefined;
  const pid = o.agentPid;
  const agentPid = typeof pid === "number" && Number.isInteger(pid) && pid > 0 && pid <= 0x7fffffff ? pid : undefined;
  const cwd = pathOf(o.cwd);
  const source = typeof o.source === "string" && /^[a-z_]{1,16}$/.test(o.source) ? o.source : undefined;
  const base = {
    paneId: o.paneId,
    kind: o.kind,
    sessionId: o.sessionId,
    ...(agentPid !== undefined ? { agentPid } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
    ...(source !== undefined ? { source } : {}),
  };
  if (o.type === undefined) return { type: "session", ...base };
  switch (o.type) {
    case "subagent_pending": {
      const description = cut(o.description, MAX_DESCRIPTION);
      const agentType = cut(o.agentType, MAX_AGENT_TYPE);
      const parentAgentId = idOf(o.parentAgentId);
      const transcriptPath = pathOf(o.transcriptPath);
      return {
        type: "subagent_pending",
        ...base,
        ...(parentAgentId !== undefined ? { parentAgentId } : {}),
        ...(transcriptPath !== undefined ? { transcriptPath } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(agentType !== undefined ? { agentType } : {}),
        ...(typeof o.background === "boolean" ? { background: o.background } : {}),
      };
    }
    case "subagent_start": {
      const agentId = idOf(o.agentId);
      if (agentId === undefined) return undefined;
      const agentType = cut(o.agentType, MAX_AGENT_TYPE);
      const transcriptPath = pathOf(o.transcriptPath);
      return {
        type: "subagent_start",
        ...base,
        agentId,
        ...(agentType !== undefined ? { agentType } : {}),
        ...(transcriptPath !== undefined ? { transcriptPath } : {}),
      };
    }
    case "subagent_stop": {
      const agentId = idOf(o.agentId);
      return agentId === undefined ? undefined : { type: "subagent_stop", ...base, agentId };
    }
    case "agent_stop": {
      if (!Array.isArray(o.running)) return undefined;
      const running: { id: string; agentType?: string; description?: string }[] = [];
      let truncated = o.truncated === true;
      for (const item of o.running as unknown[]) {
        if (typeof item !== "object" || item === null) continue;
        const it = item as Record<string, unknown>;
        const id = idOf(it.id);
        if (id === undefined) continue;
        if (running.length >= MAX_RUNNING) {
          truncated = true; // 削った分があるので、突き合わせで「外す」を止める
          break;
        }
        const agentType = cut(it.agentType, MAX_AGENT_TYPE);
        const description = cut(it.description, MAX_DESCRIPTION);
        running.push({ id, ...(agentType !== undefined ? { agentType } : {}), ...(description !== undefined ? { description } : {}) });
      }
      return { type: "agent_stop", ...base, running, truncated };
    }
    case "session_end":
      return { type: "session_end", ...base };
    default:
      return undefined; // 知らない type は捨てる
  }
}
