import type { AgentInfo, SubagentInfo } from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";
import type { AgentReport } from "./AgentReportSocket.js";

/** 配る一覧（`AgentInfo.subagents` と同じ形）。 */
export type Subagents = NonNullable<AgentInfo["subagents"]>;

export interface SubagentTrackerDeps {
  now(): number;
  logger: Logger;
}

/** 配る一覧の最大件数（`items`。`count` は実際の数）。 */
export const SUBAGENTS_ITEMS_MAX = 64;
/** pane ごとの、数えるサブエージェントの合計の上限。 */
const PANE_ITEMS_MAX = 256;
/** 実行前の報告を、次の起動の報告に付けてよい時間。 */
const PENDING_TTL_MS = 10_000;
/** 終了の報告を受けた ID を覚えておく件数と時間（作業の終わりの突き合わせで足し直さないため）。 */
const STOPPED_MAX = 64;
const STOPPED_TTL_MS = 60_000;
/** pane ごとに持つセッションの数の上限（終了の報告が来ないセッション ID が溜まり続けないように。超えたら古いものから捨てる）。 */
const SESSIONS_MAX = 32;

type Report = Exclude<AgentReport, { type: "session" }>;

interface Pending {
  description?: string;
  agentType?: string;
  background?: boolean;
  at: number;
}

interface SessionState {
  /** ID → 1 件。起動した順（Map の挿入順）。 */
  items: Map<string, SubagentInfo>;
  /** 対応づけを待つ実行前の報告（最新の 1 件）。 */
  pending?: Pending;
  /** 最近終了の報告を受けた ID → 受けた時刻。 */
  stopped: Map<string, number>;
}

interface PaneState {
  sessions: Map<string, SessionState>;
  /** 上限に達したログを出したか（pane ごとに 1 回）。 */
  capLogged: boolean;
}

/**
 * エージェントが中で動かしているサブエージェントを、pane とセッションごとにメモリに持つ（20261004-subagent-display の design「`SubagentTracker`」）。
 * 入力はフックの報告（`AgentReport`。`type: "session"` 以外）。サブエージェントは pane を持たず、サーバは検出できないので、
 * 起動・終了の報告と、作業の終わりの報告（動いているバックグラウンドの一覧）から数える。保存はしない（再起動で空から始まる）。
 */
export class SubagentTracker {
  private readonly panes = new Map<string, PaneState>();

  constructor(private readonly deps: SubagentTrackerDeps) {}

  report(r: Report): void {
    const pane = this.paneOf(r.paneId);
    this.apply(r, pane);
    this.tidy(pane);
  }

  private apply(r: Report, pane: PaneState): void {
    switch (r.type) {
      case "subagent_pending": {
        const s = this.sessionOf(pane, r.sessionId);
        s.pending = {
          ...(r.description !== undefined ? { description: r.description } : {}),
          ...(r.agentType !== undefined ? { agentType: r.agentType } : {}),
          ...(r.background !== undefined ? { background: r.background } : {}),
          at: this.deps.now(),
        };
        break;
      }
      case "subagent_start":
        this.start(r, pane);
        break;
      case "subagent_stop": {
        const s = this.sessionOf(pane, r.sessionId);
        s.items.delete(r.agentId);
        this.markStopped(s, r.agentId);
        break;
      }
      case "agent_stop":
        this.agentStop(r, pane);
        break;
      case "session_end":
        pane.sessions.delete(r.sessionId);
        break;
    }
  }

  /** 中身の無いセッションの状態を畳み、セッションの数に上限を掛ける。 */
  private tidy(pane: PaneState): void {
    for (const [id, s] of pane.sessions) if (s.items.size === 0 && s.pending === undefined && s.stopped.size === 0) pane.sessions.delete(id);
    while (pane.sessions.size > SESSIONS_MAX) pane.sessions.delete(pane.sessions.keys().next().value as string);
  }

  /** その pane の今の一覧。報告を一度も受けていなければ undefined（＝分からない）。 */
  current(paneId: string): Subagents | undefined {
    const pane = this.panes.get(paneId);
    if (!pane) return undefined;
    const all: SubagentInfo[] = [];
    for (const s of pane.sessions.values()) all.push(...s.items.values());
    all.sort((a, b) => a.startedAt - b.startedAt); // 安定ソート。同じ時刻なら受けた順
    return { count: all.length, items: all.slice(0, SUBAGENTS_ITEMS_MAX).map((i) => ({ ...i })) };
  }

  private start(r: Extract<Report, { type: "subagent_start" }>, pane: PaneState): void {
    const s = this.sessionOf(pane, r.sessionId);
    // 終了の報告のほうが先に届いた ID は、数えない（終了の報告は並行に走るので、起動より先に着くことがある）。
    if (s.items.has(r.agentId) || s.stopped.has(r.agentId)) return;
    const now = this.deps.now();
    let pending: Pending | undefined;
    if (s.pending) {
      if (now - s.pending.at > PENDING_TTL_MS) delete s.pending;
      else if (s.pending.agentType === undefined || r.agentType === undefined || s.pending.agentType === r.agentType) {
        pending = s.pending;
        delete s.pending;
      }
    }
    const type = r.agentType ?? pending?.agentType;
    // 上限で数えなくても、実行前の報告はこの起動のものとして使い切る（次の起動に付けない）。
    this.add(r.paneId, pane, s, {
      id: r.agentId,
      ...(type !== undefined ? { type } : {}),
      ...(pending?.description !== undefined ? { description: pending.description } : {}),
      ...(pending?.background !== undefined ? { background: pending.background } : {}),
      startedAt: now,
    });
  }

  private agentStop(r: Extract<Report, { type: "agent_stop" }>, pane: PaneState): void {
    const s = this.sessionOf(pane, r.sessionId);
    const now = this.deps.now();
    if (!r.truncated) {
      const running = new Set(r.running.map((x) => x.id));
      for (const id of [...s.items.keys()]) if (!running.has(id)) s.items.delete(id);
    }
    this.pruneStopped(s);
    for (const x of r.running) {
      if (s.items.has(x.id) || s.stopped.has(x.id)) continue;
      this.add(r.paneId, pane, s, {
        id: x.id,
        ...(x.agentType !== undefined ? { type: x.agentType } : {}),
        ...(x.description !== undefined ? { description: x.description } : {}),
        background: true,
        startedAt: now,
      });
    }
    delete s.pending;
  }

  private add(paneId: string, pane: PaneState, s: SessionState, info: SubagentInfo): void {
    let total = 0;
    for (const x of pane.sessions.values()) total += x.items.size;
    if (total >= PANE_ITEMS_MAX) {
      if (!pane.capLogged) {
        pane.capLogged = true;
        this.deps.logger.warn("subagents: too many, not counting more", { paneId, limit: PANE_ITEMS_MAX });
      }
      return;
    }
    s.items.set(info.id, info);
  }

  private markStopped(s: SessionState, id: string): void {
    this.pruneStopped(s);
    s.stopped.delete(id);
    s.stopped.set(id, this.deps.now());
    while (s.stopped.size > STOPPED_MAX) s.stopped.delete(s.stopped.keys().next().value as string);
  }

  private pruneStopped(s: SessionState): void {
    const now = this.deps.now();
    for (const [id, at] of s.stopped) if (now - at > STOPPED_TTL_MS) s.stopped.delete(id);
  }

  private paneOf(paneId: string): PaneState {
    let p = this.panes.get(paneId);
    if (!p) {
      p = { sessions: new Map(), capLogged: false };
      this.panes.set(paneId, p);
    }
    return p;
  }

  private sessionOf(pane: PaneState, sessionId: string): SessionState {
    let s = pane.sessions.get(sessionId);
    if (!s) {
      s = { items: new Map(), stopped: new Map() };
      pane.sessions.set(sessionId, s);
    }
    return s;
  }
}
