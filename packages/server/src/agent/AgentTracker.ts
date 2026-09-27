/**
 * 1 pane 分のエージェントの状態と遷移（architecture.md「agent/AgentTracker」・design「エージェントの状態」）。
 * herdr のソース（`da6bcd5`。Apache-2.0・D5）の `src/pane/agent_detection.rs` のヒステリシス
 * （3秒の起動猶予・working→idle の保留）を移植した（decisions.md D46・D50）。
 */
import type { AgentInfo, AgentState } from "@sodashitsu/protocol";
import { agentDescriptor } from "./agents.js";

export interface TrackerJudgment {
  state: AgentState;
  visibleIdle: boolean;
  visibleBlocker: boolean;
  visibleWorking: boolean;
}
/** `ManifestEngine.evaluate` の戻り値をそのまま渡せる形（`"skip"` は状態を更新しない）。 */
export type TrackerUpdateInput = TrackerJudgment | "skip";

interface PublishState {
  state: AgentState;
  visibleIdle: boolean;
  visibleBlocker: boolean;
  visibleWorking: boolean;
}

const UNKNOWN_PUBLISH_STATE: PublishState = { state: "unknown", visibleIdle: false, visibleBlocker: false, visibleWorking: false };

/** herdr の `AGENT_STARTUP_GRACE_WINDOW`（3秒。新しいエージェントを見つけてから判定を始めるまで待つ。D46）。 */
const STARTUP_GRACE_MS = 3000;
/** herdr の `AGENT_PENDING_IDLE_CAP`（700ms）・`AGENT_PENDING_IDLE_CONFIRMATIONS`（3回）。working→素のidle の保留の上限。 */
const PENDING_IDLE_CAP_MS = 700;
const PENDING_IDLE_CONFIRMATIONS = 3;

export interface Clock {
  now(): number;
}

export class AgentTracker {
  private info: AgentInfo | null = null;
  private publishState: PublishState = UNKNOWN_PUBLISH_STATE;
  private startupGraceUntil: number | null = null;
  private pendingIdle: { startedAt: number; confirmations: number } | null = null;

  constructor(
    private readonly allocateInstanceId: () => string,
    private readonly clock: Clock = { now: () => Date.now() },
  ) {}

  current(): AgentInfo | null {
    return this.info;
  }

  /** 猶予中（起動直後の3秒、または working→idle の保留）は、T9 が短い間隔で再確認する対象になる。
   *  `startupGraceUntil` の非 null だけを見る（時刻比較をしない）：猶予が実際に明けるのは
   *  `update()` 内でこのフィールドが null に戻されたときであり、それは猶予明け後「最初の」判定が
   *  済んでから。時刻で先読みして「もう明けたはず」と判定すると、猶予明け直後の1心拍がまだ
   *  `FAST_RECHECK_INTERVAL_MS` の対象から外れてしまい（`now === startupGraceUntil` の境界）、
   *  その回の判定自体が ACTIVE/IDLE 間隔（500ms/1000ms）まで足止めされてしまう。 */
  needsFastRecheck(): boolean {
    return this.pendingIdle !== null || this.startupGraceUntil !== null;
  }

  /**
   * 1 周期分の判定を反映する。`kind` は `ProcessMatcher.match` の結果（前面ジョブから見つからなければ null）、
   * `judgment` は `ManifestEngine.evaluate` の結果（読み込めていない kind なら呼び出し側が判定せず
   * `{state:'unknown',...}` を渡す。design「そのエージェントのルールが読み込めていないときはunknownにする」）。
   */
  update(kind: string | null, judgment: TrackerUpdateInput): AgentInfo | null | "unchanged" {
    const now = this.clock.now();

    if (kind === null) {
      if (this.info === null) return "unchanged";
      this.reset();
      return null;
    }

    const agentChanged = this.info === null || this.info.kind !== kind;
    if (agentChanged) {
      const descriptor = agentDescriptor(kind);
      this.info = {
        instanceId: this.allocateInstanceId(),
        kind,
        label: descriptor?.label ?? kind,
        state: "unknown",
        completionSeq: 0,
        serverSeenSeq: 0,
        verified: descriptor?.verified ?? false,
        since: now,
      };
      this.publishState = UNKNOWN_PUBLISH_STATE;
      this.startupGraceUntil = now + STARTUP_GRACE_MS;
      this.pendingIdle = null;
      return this.info;
    }

    if (this.startupGraceUntil !== null) {
      if (now < this.startupGraceUntil) return "unchanged"; // 猶予中は判定しない（D46）
      this.startupGraceUntil = null;
    }

    if (judgment === "skip") return "unchanged";

    const previous = this.publishState;
    if (this.shouldHoldWorkingToIdle(previous, judgment, now)) return "unchanged";
    if (!this.shouldPublish(previous, judgment)) return "unchanged";

    const current = this.info!;
    const becameIdleFromWorking = previous.state === "working" && judgment.state === "idle";
    const updated: AgentInfo = {
      ...current,
      state: judgment.state,
      since: judgment.state !== previous.state ? now : current.since,
      completionSeq: becameIdleFromWorking ? current.completionSeq + 1 : current.completionSeq,
    };
    this.info = updated;
    this.publishState = judgment;
    return updated;
  }

  /** `pane.focus` を受けたら呼ぶ（design「done（未読）」）。変化が無ければ null。 */
  markSeen(): AgentInfo | null {
    if (this.info === null || this.info.serverSeenSeq === this.info.completionSeq) return null;
    this.info = { ...this.info, serverSeenSeq: this.info.completionSeq };
    return this.info;
  }

  private reset(): void {
    this.info = null;
    this.publishState = UNKNOWN_PUBLISH_STATE;
    this.startupGraceUntil = null;
    this.pendingIdle = null;
  }

  /** herdr の `should_hold_working_to_idle`。working → 「素の」idle（visible_idle/visible_blocker 無し）は
   *  3回の再確認か700msの上限まで保留する（画面の一瞬の揺れで done を誤って出さないため）。 */
  private shouldHoldWorkingToIdle(previous: PublishState, next: PublishState, now: number): boolean {
    const isWorkingToPlainIdle = previous.state === "working" && next.state === "idle" && !next.visibleIdle && !next.visibleBlocker;
    if (!isWorkingToPlainIdle) {
      this.pendingIdle = null;
      return false;
    }
    if (this.pendingIdle === null) {
      this.pendingIdle = { startedAt: now, confirmations: 0 };
      return true;
    }
    if (now - this.pendingIdle.startedAt >= PENDING_IDLE_CAP_MS) {
      this.pendingIdle = null;
      return false;
    }
    this.pendingIdle.confirmations += 1;
    if (this.pendingIdle.confirmations >= PENDING_IDLE_CONFIRMATIONS) {
      this.pendingIdle = null;
      return false;
    }
    return true;
  }

  /** herdr の `should_publish_detection_update`。D50：安定した blocked を周期的に再発行する
   *  `stable_visible_signal_refresh_due` は省略した（`since` は実際に状態が変わった時刻のままでよいため）。 */
  private shouldPublish(previous: PublishState, next: PublishState): boolean {
    return (
      next.state !== previous.state ||
      next.visibleIdle !== previous.visibleIdle ||
      next.visibleBlocker !== previous.visibleBlocker ||
      next.visibleWorking !== previous.visibleWorking
    );
  }
}
