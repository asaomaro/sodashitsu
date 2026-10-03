import type { Disposable } from "../util/Disposable.js";
import type { EventBus } from "../bus/EventBus.js";
import type { GraphStore } from "../persist/GraphStore.js";
import type { Logger } from "../log/Logger.js";

/**
 * エージェントが起動したエージェントを連携のグラフに自動で載せる（20261003-graph-auto-nodes の design）。
 * 「誰が pane を作ったか／誰が `agent start` したか」をメモリだけで覚え、その pane でエージェントが最初に検出されたとき、
 * グラフへ足す処理（`attach`）を応答の後（`queueMicrotask`）で 1 回だけ呼ぶ。`bus` と `GraphStore` だけを使い、fs・/proc・pane.sock には依存しない。
 */
export interface AgentLineageDeps {
  /** `pane.agent_status_changed`・`pane.closed` を購読する。 */
  bus: Pick<EventBus, "subscribe">;
  store: Pick<GraphStore, "get" | "update">;
  /** session.model に実在するか（親・子の確認）。 */
  paneExists(paneId: string): boolean;
  logger: Logger;
  /** `rev_conflict` のやり直しの最大回数（既定 3）。 */
  retries?: number;
  /** 子を親の下に載せる処理（既定はグラフへ足す実装。テストで差し替える）。 */
  attach?: (childId: string, parentId: string) => Promise<void> | void;
}

export class AgentLineage {
  /** pane を作った pane（弱い関係）。 */
  private readonly created = new Map<string, string>();
  /** `agent start` を打った pane（強い関係。created に勝つ）。 */
  private readonly started = new Map<string, string>();
  /** 載せる処理を始めた pane（1 pane につき 1 回）。 */
  private readonly attempted = new Set<string>();
  private readonly sub: Disposable;
  private closed = false;
  private readonly attachFn: (childId: string, parentId: string) => Promise<void> | void;

  constructor(private readonly deps: AgentLineageDeps) {
    this.attachFn = deps.attach ?? (() => undefined);
    this.sub = deps.bus.subscribe((e) => {
      try {
        if (this.closed) return;
        if (e.event === "pane.closed") this.forgetPane(e.data.paneId);
        else if (e.event === "pane.agent_status_changed" && e.data.agent !== null)
          this.onDetected(e.data.paneId);
      } catch (err) {
        deps.logger.warn("graph.auto: subscriber failed", { error: String(err) });
      }
    });
  }

  /** pane を作った（`pane.split`・`workspace.create`・`tab.create`）。呼び出し元が無い・実在しない・自分自身なら何もしない。 */
  noteCreated(childPaneId: string, callerPaneId: string | undefined): void {
    if (this.valid(childPaneId, callerPaneId)) this.created.set(childPaneId, callerPaneId);
  }

  /** `agent start` を打った。`noteCreated` に勝つ。 */
  noteStarted(paneId: string, callerPaneId: string | undefined): void {
    if (this.valid(paneId, callerPaneId)) this.started.set(paneId, callerPaneId);
  }

  /** 書き込みの失敗で、その親の `noteStarted` だけを取り消す（並行する別の `agent start` の記録は消さない）。 */
  forgetStart(paneId: string, callerPaneId: string): void {
    if (this.started.get(paneId) === callerPaneId) this.started.delete(paneId);
  }

  /** 購読を外す。以後は何もしない。 */
  close(): void {
    this.closed = true;
    this.sub.dispose();
  }

  private valid(paneId: string, callerPaneId: string | undefined): callerPaneId is string {
    return (
      !this.closed &&
      callerPaneId !== undefined &&
      callerPaneId !== paneId &&
      this.deps.paneExists(callerPaneId) &&
      this.deps.paneExists(paneId)
    );
  }

  private forgetPane(paneId: string): void {
    // 親としての値は消さない（親が閉じたら載せる側で弾く）。
    this.created.delete(paneId);
    this.started.delete(paneId);
    this.attempted.delete(paneId);
  }

  private onDetected(paneId: string): void {
    if (this.attempted.has(paneId)) return;
    const parent = this.started.get(paneId) ?? this.created.get(paneId);
    if (parent === undefined) return; // 後で親が分かった 2 回目の検出に備えて印は付けない
    this.attempted.add(paneId);
    queueMicrotask(() => {
      if (this.closed) return;
      void (async () => {
        try {
          await this.attachFn(paneId, parent);
        } catch (err) {
          this.deps.logger.warn("graph.auto: failed", {
            child: paneId,
            parent,
            error: String(err),
          });
        }
      })();
    });
  }
}
