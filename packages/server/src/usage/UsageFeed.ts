import type { AccountUsage, AgentUsage, AgentUsageChangedEvent, AgentUsageResult } from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";

/**
 * 利用状況の配信（20261010-agent-usage PR3 の AC2）。**見ている接続（`agent.usage_watch {on: true}`）が 1 つでも居る間だけ**、一定の間隔（既定 5 秒）で
 * `UsageService.get()` を呼び、前回と比べて変わったものを `agent.usage_changed` で配る（配る相手を絞るのは `WsGateway`。ここは、いつ確かめ、何を配るかだけ）。
 *
 * - 見ている接続が 0 になったら、タイマーを止め、前回の控えを捨てる（次に始まったときは、全部を配る）。サーバの終了（`close`）でも止める。
 * - 前の確かめが終わっていなければ、次は始めない（読む仕事が重ならない）。`get()` の中の `stat` の決まり（変わっていなければ読まない）は PR1 のまま。
 * - 配るのは `get()` の答え（数字・モデル名・時刻・ラベルだけ）の差分。落ちない（読みの失敗は、その回を飛ばす）。
 */

export interface UsageFeedDeps {
  usage: { get(paneId?: string): Promise<AgentUsageResult> };
  publish(event: AgentUsageChangedEvent): void;
  logger: Pick<Logger, "debug">;
  /** 確かめの間隔（ms）。既定 5000。試験で替える。 */
  intervalMs?: number;
  /** 試験で差し替える。 */
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (t: ReturnType<typeof setInterval>) => void;
}

export const USAGE_FEED_INTERVAL_MS = 5000;

export class UsageFeed {
  private readonly watchers = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;
  private closed = false;
  /** 前回配った（または確かめた）pane ごとの形（JSON）。 */
  private lastPanes = new Map<string, string>();
  private lastAccounts: string | null = null;
  /** 世代。止めて始め直したあとに、前の確かめの答えを配らないための印。 */
  private generation = 0;

  constructor(private readonly deps: UsageFeedDeps) {}

  /** いま見ている接続の数（試験・診断用）。 */
  get watcherCount(): number {
    return this.watchers.size;
  }
  /** タイマーが動いているか（試験用。止めたあとに残っていないことを確かめる）。 */
  get running(): boolean {
    return this.timer !== undefined;
  }

  setWatching(clientId: string, on: boolean): void {
    if (this.closed) return;
    if (on) this.watchers.add(clientId);
    else this.watchers.delete(clientId);
    this.sync();
  }

  /** 接続が切れた。 */
  clientGone(clientId: string): void {
    if (this.watchers.delete(clientId)) this.sync();
  }

  close(): void {
    this.closed = true;
    this.watchers.clear();
    this.sync();
  }

  private sync(): void {
    if (this.watchers.size > 0 && this.timer === undefined && !this.closed) {
      const every = this.deps.intervalMs ?? USAGE_FEED_INTERVAL_MS;
      this.timer = (this.deps.setInterval ?? setInterval)(() => void this.tick(), every);
      // 配信のタイマーだけでは、サーバのプロセスを生かさない。
      (this.timer as { unref?: () => void }).unref?.();
    } else if (this.watchers.size === 0 && this.timer !== undefined) {
      (this.deps.clearInterval ?? clearInterval)(this.timer);
      this.timer = undefined;
      this.lastPanes = new Map();
      this.lastAccounts = null;
      this.generation++;
    }
  }

  /** 1 回の確かめ（タイマーから。試験は直接呼んでよい）。 */
  async tick(): Promise<void> {
    if (this.inFlight || this.closed || this.watchers.size === 0) return;
    this.inFlight = true;
    const gen = this.generation;
    try {
      const result = await this.deps.usage.get();
      if (gen !== this.generation || this.closed || this.watchers.size === 0) return;
      this.diffAndPublish(result);
    } catch {
      this.deps.logger.debug("usage feed: check failed");
    } finally {
      this.inFlight = false;
    }
  }

  private diffAndPublish(result: AgentUsageResult): void {
    const changed: Record<string, AgentUsage | null> = {};
    const next = new Map<string, string>();
    for (const [paneId, usage] of Object.entries(result.panes)) {
      if (usage === null) continue;
      const form = JSON.stringify(usage);
      next.set(paneId, form);
      if (this.lastPanes.get(paneId) !== form) changed[paneId] = usage;
    }
    for (const paneId of this.lastPanes.keys()) if (!next.has(paneId)) changed[paneId] = null;
    this.lastPanes = next;

    const accountsForm = JSON.stringify(result.accounts);
    let accounts: AccountUsage[] | undefined;
    if (accountsForm !== this.lastAccounts) {
      // 初回の「無い」は配らない（見ている側は `agent.usage` で、無いことを知っている）。
      if (this.lastAccounts !== null || result.accounts.length > 0) accounts = result.accounts;
      this.lastAccounts = accountsForm;
    }
    if (Object.keys(changed).length === 0 && accounts === undefined) return;
    this.deps.publish({ event: "agent.usage_changed", data: { panes: changed, ...(accounts !== undefined ? { accounts } : {}) } });
  }
}
