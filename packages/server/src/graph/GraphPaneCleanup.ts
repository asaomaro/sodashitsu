import type { Graph, GraphOp } from "@sodashitsu/protocol";
import { isLocalNodeKey, parseNodeKey } from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import type { EventBus } from "../bus/EventBus.js";
import { GraphRevConflictError, type GraphStore } from "../persist/GraphStore.js";
import type { Logger } from "../log/Logger.js";

/**
 * 閉じた pane のノードを、連携のグラフから外す（線も一緒に消える）。pane の id は再利用されないので、閉じた pane のノードも線も二度と使えず、
 * 残すとグラフの画面に居ない pane が居続け、監督役への知らせにも居ない配下として載る。
 *
 * - 閉じたとき（`pane.closed`）: その pane の手元のノードを外す。
 * - 起動の復元の後（`pruneMissing`）: 保存したグラフにあって、今の pane に無い手元のノードを外す（サーバが止まっている間に閉じた・古い版が残したもの）。
 * - サーバを止めるときは `close()` を先に呼ぶ（止まる途中で pane が閉じても、保存した連携を消さない）。別のマシンのノードは触らない。
 */
export interface GraphPaneCleanupDeps {
  bus: Pick<EventBus, "subscribe">;
  store: Pick<GraphStore, "get" | "update">;
  paneExists(paneId: string): boolean;
  logger: Logger;
  /** `rev_conflict` のやり直しの最大回数（既定 3）。 */
  retries?: number;
}

const RETRIES_DEFAULT = 3;

export class GraphPaneCleanup {
  private readonly sub: Disposable;
  private closed = false;

  constructor(private readonly deps: GraphPaneCleanupDeps) {
    this.sub = deps.bus.subscribe((e) => {
      try {
        if (this.closed || e.event !== "pane.closed") return;
        const paneId = e.data.paneId;
        void this.remove((g) =>
          g.nodes.filter((n) => nodePane(n.key) === paneId).map((n) => n.key),
        );
      } catch (err) {
        deps.logger.warn("graph.cleanup: subscriber failed", { error: String(err) });
      }
    });
  }

  /** 保存したグラフにあって、今の pane に無い手元のノードを外す。外した数を返す。 */
  pruneMissing(): Promise<number> {
    return this.remove((g) =>
      g.nodes
        .filter((n) => {
          const id = nodePane(n.key);
          return id !== null && !this.deps.paneExists(id);
        })
        .map((n) => n.key),
    );
  }

  close(): void {
    this.closed = true;
    this.sub.dispose();
  }

  private async remove(pick: (g: Graph) => string[]): Promise<number> {
    const { store, logger } = this.deps;
    const retries = this.deps.retries ?? RETRIES_DEFAULT;
    for (let attempt = 0; attempt < retries; attempt++) {
      if (this.closed) return 0;
      const g = store.get();
      const keys = pick(g);
      if (keys.length === 0) return 0;
      const ops: GraphOp[] = keys.map((key) => ({ op: "remove_node", key }) as GraphOp);
      try {
        await store.update(g.rev, ops, "graph");
        logger.info("graph.cleanup: removed nodes of closed panes", { nodes: keys });
        return keys.length;
      } catch (err) {
        if (err instanceof GraphRevConflictError) continue;
        logger.warn("graph.cleanup: failed", { error: String(err) });
        return 0;
      }
    }
    logger.warn("graph.cleanup: skipped (conflict)", {});
    return 0;
  }
}

function nodePane(key: string): string | null {
  return isLocalNodeKey(key) ? (parseNodeKey(key)?.paneId ?? null) : null;
}
