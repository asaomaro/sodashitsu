import type { AgentInfo, LinkRunReason } from "@sodashitsu/protocol";
import { BLOCKED_HOLD_MS, BUSY_WAIT_MAX_MS } from "@sodashitsu/client-core";

/**
 * 線ごとの実行の状態機械（20260927-agent-graph の architecture「トリガの状態機械」・design D-3）。**純粋**——時刻は入力で受け、I/O もタイマーも持たない。
 * 「いつ送るか」だけを決め、送る・履歴に残す・回数を数えるのは `GraphEngine`。トリガの線と承認の代理の線（元が blocked で監督役へ）の両方に使う。
 *
 * - 完了の鍵は `(instanceId, completionSeq)` の増加。instanceId が変わった直後の値・最初に見た値は「基準」として覚えるだけで動かない
 *   （再起動・再検出で completionSeq が 0 に戻る。起動直後の unknown→idle も完了ではない）。
 * - 承認待ちは blocked が `BLOCKED_HOLD_MS` 続いたら 1 回。blocked を抜けたら次に備える。最初に見た時点で既に blocked なら、その回は動かない（基準）。
 * - 発火したら先を見る: 抑止（一時停止・上限・マシン不在）→ 見送り／先が居ない → 見送り／先が blocked → 見送り／先が idle → 送る／
 *   先が作業中（working・unknown）→ `whenBusy` が wait なら待つ（最長 `BUSY_WAIT_MAX_MS`。待つ間の発火は新しい 1 件に置き換え）、skip なら見送る。
 */
export type TriggerOn = "done" | "blocked";
export type WhenBusy = "wait" | "skip";
export type SkipReason = Exclude<LinkRunReason, "error">;

export interface TriggerSettings {
  on: TriggerOn;
  whenBusy: WhenBusy;
  /** 発火をすべて見送る理由（全体・線の一時停止は "paused"、上限は "limit"、先が別のマシンで繋がっていなければ "machine_unavailable"）。無ければ null。 */
  suppress: SkipReason | null;
}

export type TriggerInput =
  | { kind: "source"; agent: AgentInfo | null; at: number }
  | { kind: "target"; agent: AgentInfo | null; at: number }
  | { kind: "tick"; at: number }
  | { kind: "config"; settings: TriggerSettings };

export type TriggerDecision =
  { kind: "send" } | { kind: "wait" } | { kind: "skip"; reason: SkipReason } | null;

/** 先が今すぐ受け取れるか（idle だけ。unknown は起動直後の猶予なので作業中と同じ扱い）。 */
function targetVerdict(target: AgentInfo | null): "absent" | "blocked" | "ready" | "busy" {
  if (target === null) return "absent";
  if (target.state === "blocked") return "blocked";
  if (target.state === "idle") return "ready";
  return "busy";
}

export class TriggerState {
  private settings: TriggerSettings;
  /** 元の完了の基準。null = まだ元を見ていない（次に見た値を基準にする）。 */
  private baseline: { instanceId: string; completionSeq: number } | null = null;
  /** 元が blocked になった時刻（この instanceId の今の blocked の回）。 */
  private blockedSince: number | null = null;
  /** 今の blocked の回で発火済みか（基準として見送った回も true）。 */
  private blockedHandled = false;
  private target: AgentInfo | null = null;
  /** 先の手が空くのを待っている発火（始めた時刻）。 */
  private waitingSince: number | null = null;

  constructor(
    settings: TriggerSettings,
    initial: { source: AgentInfo | null; target: AgentInfo | null; at: number },
  ) {
    this.settings = settings;
    this.target = initial.target;
    this.observeSource(initial.source, initial.at);
  }

  /** 待っている発火があるか（試験・終了の取り消し用）。 */
  get waiting(): boolean {
    return this.waitingSince !== null;
  }

  handle(input: TriggerInput): TriggerDecision {
    switch (input.kind) {
      case "source":
        return this.observeSource(input.agent, input.at);
      case "target":
        this.target = input.agent;
        return this.resolveWaiting(input.at);
      case "tick":
        // 先の手が空いた・居なくなったは target の知らせで決まる。tick で見るのは承認待ちの 1 秒と待ちの 30 分だけ。
        return this.checkBlockedHold(input.at) ?? this.checkTimeout(input.at);
      case "config": {
        // on を変えたら、今続いている承認待ちの回は基準（新しい線と同じ。D5-5）。
        if (input.settings.on !== this.settings.on && this.blockedSince !== null)
          this.blockedHandled = true;
        this.settings = input.settings;
        if (this.waitingSince !== null && input.settings.suppress !== null) {
          this.waitingSince = null;
          return { kind: "skip", reason: input.settings.suppress };
        }
        return null;
      }
      default:
        input satisfies never;
        return null;
    }
  }

  private observeSource(agent: AgentInfo | null, at: number): TriggerDecision {
    if (agent === null) {
      // 元のエージェントが居なくなった。次に現れたものは新しい基準から。
      this.baseline = null;
      this.blockedSince = null;
      return this.resolveBlockedWait();
    }
    if (this.baseline === null || this.baseline.instanceId !== agent.instanceId) {
      // 最初に見た値・入れ替わった直後の値は基準（動かない）。blocked の回も、ここで既に blocked なら動かない。
      this.baseline = { instanceId: agent.instanceId, completionSeq: agent.completionSeq };
      this.blockedSince = agent.state === "blocked" ? at : null;
      this.blockedHandled = agent.state === "blocked";
      return null;
    }
    const completed = agent.completionSeq > this.baseline.completionSeq;
    if (completed)
      this.baseline = { instanceId: agent.instanceId, completionSeq: agent.completionSeq };
    if (agent.state !== "blocked") {
      this.blockedSince = null;
      const resolved = this.resolveBlockedWait();
      if (resolved !== null) return resolved;
    } else if (this.blockedSince === null) {
      // 新しい blocked の回。
      this.blockedSince = at;
      this.blockedHandled = false;
    }
    if (completed && this.settings.on === "done") return this.fire(at);
    return this.checkBlockedHold(at);
  }

  private checkBlockedHold(at: number): TriggerDecision {
    if (this.settings.on !== "blocked" || this.blockedSince === null || this.blockedHandled)
      return null;
    if (at - this.blockedSince < BLOCKED_HOLD_MS) return null;
    this.blockedHandled = true;
    return this.fire(at);
  }

  private fire(at: number): TriggerDecision {
    // 待っていた発火があれば、この新しい 1 件に置き換わる（下で待つなら待ちの時間もここから数え直す）。
    this.waitingSince = null;
    if (this.settings.suppress !== null) return { kind: "skip", reason: this.settings.suppress };
    switch (targetVerdict(this.target)) {
      case "absent":
        return { kind: "skip", reason: "target_absent" };
      case "blocked":
        return { kind: "skip", reason: "blocked" };
      case "ready":
        return { kind: "send" };
      case "busy":
        if (this.settings.whenBusy === "skip") return { kind: "skip", reason: "busy" };
        this.waitingSince = at;
        return { kind: "wait" };
    }
  }

  /** 承認の知らせ（on: blocked）の待ちは、元が承認待ちを抜けたら要らない（古い回の画面を送らない）。 */
  private resolveBlockedWait(): TriggerDecision {
    if (this.settings.on !== "blocked" || this.waitingSince === null) return null;
    this.waitingSince = null;
    return { kind: "skip", reason: "resolved" };
  }

  private checkTimeout(at: number): TriggerDecision {
    if (this.waitingSince === null || at - this.waitingSince < BUSY_WAIT_MAX_MS) return null;
    this.waitingSince = null;
    return { kind: "skip", reason: "busy_timeout" };
  }

  private resolveWaiting(at: number): TriggerDecision {
    // 抑止が付いたら待ちは config の時点で取り消している（ここへは抑止なしでだけ来る）。
    if (this.waitingSince === null) return null;
    const verdict = targetVerdict(this.target);
    if (verdict === "absent") {
      this.waitingSince = null;
      return { kind: "skip", reason: "target_absent" };
    }
    if (verdict === "ready") {
      this.waitingSince = null;
      // 待ちから送った回は処理済み（承認の待ちは回が変われば resolved で消えるので、ここで印は既に付いている。念のための揃え）。
      if (this.blockedSince !== null) this.blockedHandled = true;
      return { kind: "send" };
    }
    // 作業中・承認待ち（人が答えれば作業に戻り、やがて手が空く）の間は待ち続ける。最長で打ち切る。
    return this.checkTimeout(at);
  }

  /** 待っている発火を黙って取り消す（終了・線の削除。履歴に残さない）。 */
  cancel(): void {
    this.waitingSince = null;
  }
}
