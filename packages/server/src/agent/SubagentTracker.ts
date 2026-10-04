import type { AgentInfo, SubagentInfo } from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import type { Disposable } from "../util/Disposable.js";
import type { AgentReport } from "./AgentReportSocket.js";

/** 配る一覧（`AgentInfo.subagents` と同じ形）。 */
export type Subagents = NonNullable<AgentInfo["subagents"]>;

export interface SubagentTrackerDeps {
  /** `pane.agent_status_changed`・`pane.closed` を購読する。 */
  bus: Pick<EventBus, "subscribe">;
  /** その pane に今検出されているエージェントの `instanceId`（無ければ null）。 */
  agentInstanceOf(paneId: string): string | null;
  /** その pane のエージェントの `subagents` を差し替えて配る。検出されていて配れたら true（`SessionService.setAgentSubagents`）。 */
  publish(paneId: string, subagents: Subagents | undefined): boolean;
  now(): number;
  /** まとめ待ちのタイマー（テストで差し替える）。 */
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  logger: Logger;
}

/** 最初の変化から、この時間だけまとめてから配る（待ちは延ばさない）。 */
const PUBLISH_DELAY_MS = 100;

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
  /** 報告を一度でも受けたか（受けていなければ「分からない」）。 */
  seen: boolean;
  /** 最後に見た、その pane のエージェントの `instanceId`（無し = null）。 */
  instanceId: string | null;
  /** 最後に**配れた**値。 */
  lastPublished?: Subagents;
  /** まとめ待ちのタイマー。 */
  timer?: unknown;
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
  private readonly sub: Disposable;
  private closed = false;

  constructor(private readonly deps: SubagentTrackerDeps) {
    this.sub = deps.bus.subscribe((e) => {
      try {
        if (this.closed) return;
        if (e.event === "pane.closed") this.discard(e.data.paneId);
        else if (e.event === "pane.agent_status_changed")
          this.onAgentChanged(e.data.paneId, e.data.agent?.instanceId ?? null);
      } catch (err) {
        deps.logger.warn("subagents: subscriber failed", { error: String(err) });
      }
    });
  }

  report(r: Report): void {
    if (this.closed) return;
    const pane = this.paneOf(r.paneId);
    pane.seen = true;
    this.apply(r, pane);
    this.tidy(pane);
    this.schedule(r.paneId, pane);
  }

  /** 購読とタイマーを止める。以後は何もしない。 */
  close(): void {
    this.closed = true;
    this.sub.dispose();
    for (const pane of this.panes.values())
      if (pane.timer !== undefined) this.deps.clearTimer(pane.timer);
    this.panes.clear();
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
    for (const [id, s] of pane.sessions)
      if (s.items.size === 0 && s.pending === undefined && s.stopped.size === 0)
        pane.sessions.delete(id);
    while (pane.sessions.size > SESSIONS_MAX)
      pane.sessions.delete(pane.sessions.keys().next().value as string);
  }

  /** その pane の今の一覧。報告を一度も受けていなければ undefined（＝分からない）。 */
  current(paneId: string): Subagents | undefined {
    const pane = this.panes.get(paneId);
    if (!pane?.seen) return undefined;
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
      else if (
        s.pending.agentType === undefined ||
        r.agentType === undefined ||
        s.pending.agentType === r.agentType
      ) {
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
        this.deps.logger.warn("subagents: too many, not counting more", {
          paneId,
          limit: PANE_ITEMS_MAX,
        });
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

  /** pane のエージェントが検出された・入れ替わった・終わった。検出より前に届いた報告は捨てず、入れ替わり・終了では捨てる。 */
  private onAgentChanged(paneId: string, instanceId: string | null): void {
    const pane = this.panes.get(paneId);
    if (!pane || pane.instanceId === instanceId) return; // 自分が配った変化（同じ instanceId）もここで止まる
    const previous = pane.instanceId;
    if (previous === null) {
      // 無し → X（最初の検出。サーバの再起動・引き継ぎの直後を含む）: 検出より前の報告を配り直す。
      // bus の購読の中で配ると、同じイベントを待つほかの購読者へ新しい値が先に届くので、待ち 0 のタイマーで配る。
      pane.instanceId = instanceId;
      delete pane.lastPublished;
      this.startTimer(paneId, pane, 0);
      return;
    }
    // X → null・X → Y: 古い一覧が新しい検出に付かないよう、全部捨てる（新しい検出は `subagents` を持たない）。
    this.discard(paneId); // 次の報告で `paneOf` が、そのときの検出（`agentInstanceOf`）から作り直す
  }

  private discard(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (pane?.timer !== undefined) this.deps.clearTimer(pane.timer);
    this.panes.delete(paneId);
  }

  /** 変わっていれば、最初の変化から `PUBLISH_DELAY_MS` 後に配る。 */
  private schedule(paneId: string, pane: PaneState): void {
    if (pane.timer !== undefined || sameSubagents(this.current(paneId), pane.lastPublished)) return;
    this.startTimer(paneId, pane, PUBLISH_DELAY_MS);
  }

  private startTimer(paneId: string, pane: PaneState, ms: number): void {
    if (pane.timer !== undefined) this.deps.clearTimer(pane.timer);
    pane.timer = this.deps.setTimer(() => this.flush(paneId), ms);
  }

  private flush(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane || this.closed) return;
    delete pane.timer;
    const value = this.current(paneId);
    if (value === undefined || sameSubagents(value, pane.lastPublished)) return;
    // 配れたとき（エージェントが検出されているとき）だけ「最後に配れた値」を更新する。
    try {
      if (this.deps.publish(paneId, value)) pane.lastPublished = value;
    } catch (err) {
      this.deps.logger.warn("subagents: publish failed", { paneId, error: String(err) });
    }
  }

  private paneOf(paneId: string): PaneState {
    let p = this.panes.get(paneId);
    if (!p) {
      p = {
        sessions: new Map(),
        seen: false,
        instanceId: this.deps.agentInstanceOf(paneId),
        capLogged: false,
      };
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

function sameSubagents(a: Subagents | undefined, b: Subagents | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.count !== b.count || a.items.length !== b.items.length) return false;
  return a.items.every((x, i) => {
    const y = b.items[i] as SubagentInfo;
    return (
      x.id === y.id &&
      x.type === y.type &&
      x.description === y.description &&
      x.background === y.background &&
      x.startedAt === y.startedAt
    );
  });
}
