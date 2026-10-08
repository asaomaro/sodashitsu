import {
  GRAPH_LINKS_MAX,
  GRAPH_LOCAL_NODES_MAX,
  type Graph,
  type GraphLink,
  type GraphOp,
  type LinkKind,
  type NodeKey,
} from "@sodashitsu/protocol";
import {
  defaultApprovalConfig,
  GRAPH_FIRST_NODE_RESERVE,
  LINK_LIMIT_DEFAULT,
} from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import type { EventBus } from "../bus/EventBus.js";
import {
  GraphInvalidError,
  GraphRevConflictError,
  type GraphStore,
} from "../persist/GraphStore.js";
import type { Logger } from "../log/Logger.js";

/**
 * エージェントが起動したエージェントを連携のグラフに自動で載せる（20261003-graph-auto-nodes の design）。
 * 「誰が pane を作ったか／誰が `agent start` したか」をメモリだけで覚え、その pane でエージェントが最初に検出されたとき、
 * グラフへ線を足す処理（`attach`）を応答の後（`queueMicrotask`）で 1 回だけ呼ぶ。ノードは足さない（手元のすべての pane のノードは、維持
 * `GraphMaintainer` が足す。20261008-graph-first D9）。`bus` と `GraphStore` だけを使い、fs・/proc・pane.sock には依存しない。
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
  /**
   * 線を足す前に、手元の pane のノードがそろっているようにする（`GraphMaintainer.reconcileNow`）。ノードを足すのは維持の側で、ここは線だけを足す
   * （20261008-graph-first D9）。構造のできごとの 50ms のまとめより先に検出が来ても、線が落ちないための順の保証。無ければ何もしない。
   */
  ensureNodes?: () => Promise<unknown>;
  /** 子を親の下に載せる処理（既定はグラフへ足す実装。テストで差し替える）。 */
  attach?: (childId: string, parentId: string) => Promise<void> | void;
}

/** ログの `reason`（`graph.auto: skipped`）。 */
export type LineageSkipReason =
  | "parent_gone"
  | "reverse_link"
  | "duplicate_link"
  | "supervisor_taken"
  /** 親か子のノードが無い（手元のノードの上限に達していて、維持が足せなかった）。 */
  | "too_many_nodes"
  /** 親か子のノードが（まだ）無い。上限ではない（引き継ぎの停止の間など、維持が足せていない）。次の検出でやり直せるよう、「1 回」の機会を使い切らない。 */
  | "nodes_pending"
  | "too_many_links"
  | "conflict"
  | "invalid";

const RETRIES_DEFAULT = 3;
const AUTO_LINK_KINDS: readonly LinkKind[] = ["supervise", "approval"];

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
    this.attachFn = deps.attach ?? ((c, p) => this.attachToGraph(c, p));
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

  /**
   * 子から親への監督の線・承認の代理の線を、1 回の `store.update` で足す。重複・上限・監督役の取り合いは、ops が全か無かなので組み立て前に自分で外す。
   * 何も足すものが無ければ `update` を呼ばない（rev は進まない）。ノードは足さない（先に `ensureNodes` で維持にそろえてもらう）。
   */
  private async attachToGraph(childId: string, parentId: string): Promise<void> {
    const { paneExists, logger, store } = this.deps;
    if (childId === parentId) return;
    // 上限に当たると利用者の手動操作も塞がれる（閉じた pane のノードは自動で消えない）ので、見落とされないよう warn にする。
    const skip = (reason: LineageSkipReason, level: "info" | "warn" = "info"): void =>
      logger[reason === "too_many_nodes" || reason === "too_many_links" ? "warn" : level](
        "graph.auto: skipped",
        {
          child: childId,
          parent: parentId,
          reason,
        },
      );
    const parent: NodeKey = `local:${parentId}`;
    const child: NodeKey = `local:${childId}`;

    const retries = this.deps.retries ?? RETRIES_DEFAULT;
    for (let attempt = 0; attempt < retries; attempt++) {
      // 競合の間に閉じた pane のノードを載せない。子が閉じていた（F7）は黙る。
      if (this.closed || !paneExists(childId)) return;
      if (!paneExists(parentId)) return skip("parent_gone");
      // ノードは維持の側が足す。構造のできごとの 50ms のまとめより先に検出が来ても線が落ちないよう、先にそろえてもらう。
      await this.deps.ensureNodes?.();
      if (this.closed || !paneExists(childId)) return;
      if (!paneExists(parentId)) return skip("parent_gone");
      const g = store.get();
      // skip の理由は試行ごとに集め、採用した試行のぶんだけ出す（競合の再試行で重複させない）。
      const reasons: LineageSkipReason[] = [];
      const plan = this.plan(g, parent, child, (r) => reasons.push(r));
      if (plan === null || plan.ops.length === 0) {
        reasons.forEach((r) => skip(r));
        // ノードがまだ無いだけ（上限ではない）なら、この pane の機会を使い切らない（次の検出でやり直す）。
        if (reasons.includes("nodes_pending")) this.attempted.delete(childId);
        return;
      }
      try {
        await store.update(g.rev, plan.ops, "graph");
      } catch (err) {
        if (err instanceof GraphRevConflictError) continue;
        reasons.forEach((r) => skip(r));
        if (err instanceof GraphInvalidError) return skip("invalid", "warn");
        throw err;
      }
      reasons.forEach((r) => skip(r));
      logger.info("graph.auto: added", {
        child: childId,
        parent: parentId,
        links: plan.links,
      });
      return;
    }
    skip("conflict", "warn");
  }

  /** 今のグラフに足す ops。何も足さずに終わる理由は `skip` へ記録して null。 */
  private plan(
    g: Graph,
    parent: NodeKey,
    child: NodeKey,
    skip: (reason: LineageSkipReason) => void,
  ): { ops: GraphOp[]; links: number } | null {
    // 手元のノードの上限で維持が足せなかったときだけ、ノードが無い（線の端のノードが無いと線は足せない）。
    if (!g.nodes.some((n) => n.key === parent) || !g.nodes.some((n) => n.key === child)) {
      const local = g.nodes.filter((n) => n.key.startsWith("local:")).length;
      skip(
        local >= GRAPH_LOCAL_NODES_MAX - GRAPH_FIRST_NODE_RESERVE
          ? "too_many_nodes"
          : "nodes_pending",
      );
      return null;
    }
    const ops: GraphOp[] = [];

    let links = 0;
    for (const kind of AUTO_LINK_KINDS) {
      const reason = linkSkipReason(g.links, kind, child, parent);
      if (reason !== null) {
        skip(reason);
        continue;
      }
      links++;
      ops.push(
        kind === "approval"
          ? {
              op: "add_link",
              kind,
              from: child,
              to: parent,
              approval: defaultApprovalConfig(),
              limit: LINK_LIMIT_DEFAULT,
            }
          : { op: "add_link", kind, from: child, to: parent, limit: LINK_LIMIT_DEFAULT },
      );
    }
    if (g.links.length + links > GRAPH_LINKS_MAX) {
      skip("too_many_links");
      return null;
    }
    return { ops, links };
  }
}

/** この線を引かない理由（引いてよければ null）。 */
function linkSkipReason(
  links: readonly GraphLink[],
  kind: LinkKind,
  from: NodeKey,
  to: NodeKey,
): LineageSkipReason | null {
  const sameKind = links.filter((l) => l.kind === kind);
  if (sameKind.some((l) => l.from === from && l.to === to)) return "duplicate_link";
  if (sameKind.some((l) => l.from === from)) return "supervisor_taken";
  if (sameKind.some((l) => l.from === to && l.to === from)) return "reverse_link";
  return null;
}
