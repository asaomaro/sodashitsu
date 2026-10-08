import type { Graph } from "@sodashitsu/protocol";
import { reconcileGraph, type LayoutStructure, type ReconcileHints } from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import type { EventBus } from "../bus/EventBus.js";
import {
  GraphInvalidError,
  GraphRevConflictError,
  GraphStoreClosedError,
  type GraphStore,
} from "../persist/GraphStore.js";
import type { Logger } from "../log/Logger.js";
import { graphStructure, type GraphStructureSession } from "./graphStructure.js";

/**
 * 連携のグラフの維持（20261008-graph-first の T5。design 追補 01「維持」）。手元の、一時的でない pane のすべてにノードを足し、囲いの重なりを直す
 * （`reconcileGraph`。破れている所だけを直す）。
 *
 * - 呼ぶ時: **起動**（復元と `pruneMissing` の後・`graphEngine.start()` の前。毎回）と、**構造のできごと**（`pane.created`・`pane.updated`・`pane.closed`・
 *   `layout.updated`・`workspace.updated`・`sidebar.layout_changed`・`group.deleted`）の後の 50ms まとめて 1 回。
 * - 直すものが無ければ `graph.update` を呼ばない（rev は進まない）。構造が前回の確認から変わっていなければ、構造から導く処理も飛ばす。
 * - `soda handoff` の停止の間は呼ばない（`pause`）。新しい版の起動が、起動の経路で呼ぶ。
 * - サーバの内部の更新として直す（方式の層の検査〔`node_required`・`frame_overlap`〕を通さない）。
 */
export interface GraphMaintainerDeps {
  bus: Pick<EventBus, "subscribe">;
  store: Pick<GraphStore, "get" | "update">;
  session: GraphStructureSession;
  logger: Logger;
  /** まとめる時間（既定 50ms）。 */
  debounceMs?: number;
  /** `rev_conflict` のやり直しの最大回数（既定 3）。 */
  retries?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const STRUCTURAL_EVENTS: ReadonlySet<string> = new Set([
  "pane.created",
  "pane.updated",
  "pane.closed",
  "layout.updated",
  "workspace.updated",
  "sidebar.layout_changed",
  "group.deleted",
]);

const DEBOUNCE_DEFAULT_MS = 50;
const RETRIES_DEFAULT = 3;

/** 構造と rev の指紋（前回の確認から変わっていなければ、導き直しを飛ばす）。 */
function fingerprint(structure: LayoutStructure, rev: number): string {
  const parts: string[] = [String(rev)];
  for (const sp of structure.spaces) {
    parts.push(`#${sp.id}`);
    for (const t of sp.tops) {
      parts.push(`${t.kind}:${t.id}`);
      for (const m of t.members) parts.push(`${m.id}=${m.nodes.join(",")}`);
    }
  }
  return parts.join("|");
}

interface Memory {
  /** ノードの鍵 → 属したメンバー（workspace）の id。 */
  memberOfKey: Map<string, string>;
  /** メンバーの id → 含むノードの鍵（整列）+ 属した最上位の囲いの id。 */
  members: Map<string, string>;
}

function remember(structure: LayoutStructure): Memory {
  const memberOfKey = new Map<string, string>();
  const members = new Map<string, string>();
  for (const sp of structure.spaces) {
    for (const t of sp.tops) {
      for (const m of t.members) {
        for (const k of m.nodes) memberOfKey.set(k, m.id);
        members.set(m.id, `${t.id}:${[...m.nodes].sort().join(",")}`);
      }
    }
  }
  return { memberOfKey, members };
}

/** 前回の構成との差から、置き直す「移ってきた」ノードと、構成が変わった囲いを求める。前回が無ければ手がかりは無い。 */
function hintsFrom(prev: Memory | null, structure: LayoutStructure): ReconcileHints {
  if (prev === null) return {};
  const arrived = new Set<string>();
  const changed = new Set<string>();
  for (const sp of structure.spaces) {
    for (const t of sp.tops) {
      let topChanged = false;
      for (const m of t.members) {
        for (const k of m.nodes) {
          const was = prev.memberOfKey.get(k);
          if (was !== undefined && was !== m.id) arrived.add(k);
        }
        const now = `${t.id}:${[...m.nodes].sort().join(",")}`;
        if (prev.members.get(m.id) !== now) {
          changed.add(m.id);
          topChanged = true;
        }
      }
      if (topChanged) changed.add(t.id);
    }
  }
  return { arrived, changed };
}

export class GraphMaintainer {
  private readonly sub: Disposable;
  private chain: Promise<unknown> = Promise.resolve();
  private timer: unknown = null;
  private paused = false;
  private closed = false;
  private lastFingerprint: string | null = null;
  private memory: Memory | null = null;

  constructor(private readonly deps: GraphMaintainerDeps) {
    this.sub = deps.bus.subscribe((e) => {
      try {
        if (this.closed || this.paused) return;
        if (STRUCTURAL_EVENTS.has(e.event)) this.schedule();
      } catch (err) {
        deps.logger.warn("graph.maintain: subscriber failed", { error: String(err) });
      }
    });
  }

  /** 50ms まとめて 1 回、確認する。 */
  schedule(): void {
    if (this.closed || this.paused || this.timer !== null) return;
    const set = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.timer = set(() => {
      this.timer = null;
      if (this.closed || this.paused) return;
      void this.reconcileNow().catch((err: unknown) => {
        this.deps.logger.warn("graph.maintain: failed", { error: String(err) });
      });
    }, this.deps.debounceMs ?? DEBOUNCE_DEFAULT_MS);
  }

  /**
   * 今すぐ確認して、破れている所を直す。直した操作の数を返す。前の確認が終わるのを待って 1 つずつ行う。
   * `force` なら、構造が前回から変わっていなくても確認する（起動のとき）。`repack` は移行（`schema` 1 → 2）のとき: 外接が大きすぎる workspace を
   * 詰め直す（`ReconcileHints.repack`）。
   */
  reconcileNow(opts: { force?: boolean; repack?: boolean } = {}): Promise<number> {
    // 引き継ぎの停止の間は呼ばない（起動の `force` だけは通す）。
    if (this.paused && opts.force !== true) return Promise.resolve(0);
    const run = (): Promise<number> => this.run(opts.force === true, opts.repack === true);
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  /** 引き継ぎの停止の間。確認を始めず、待っているものも取り消す。 */
  pause(): void {
    this.paused = true;
    this.cancelTimer();
  }

  /** 引き継ぎを取りやめて元に戻ったとき。止まっている間のできごとを拾うため、1 回確認する。 */
  resume(): void {
    if (this.closed) return;
    this.paused = false;
    this.schedule();
  }

  close(): void {
    this.closed = true;
    this.cancelTimer();
    this.sub.dispose();
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    (this.deps.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout)))(this.timer);
    this.timer = null;
  }

  private async run(force: boolean, repack: boolean): Promise<number> {
    const { store, session, logger } = this.deps;
    const retries = this.deps.retries ?? RETRIES_DEFAULT;
    for (let attempt = 0; attempt < retries; attempt++) {
      if (this.closed) return 0;
      const g: Graph = store.get();
      const structure = graphStructure(session, g);
      const fp = fingerprint(structure, g.rev);
      if (!force && fp === this.lastFingerprint) return 0;
      const ops = reconcileGraph(structure, g, {
        ...hintsFrom(this.memory, structure),
        ...(repack ? { repack } : {}),
      });
      if (ops.length === 0) {
        this.lastFingerprint = fp;
        this.memory = remember(structure);
        return 0;
      }
      try {
        const next = await store.update(g.rev, ops, "graph");
        // 確認した構成（`structure`）と、直した後の rev を基準にする。**直した後の構成を導き直して基準にしない**——更新を待つ間に pane が増えていると、
        // 確認していない構成を「確認済み」にして、次の確認が飛ばされ、その pane のノードが足されないままになる。
        this.lastFingerprint = fingerprint(structure, next.rev);
        this.memory = remember(structure);
        logger.debug("graph.maintain: reconciled", { ops: ops.length });
        return ops.length;
      } catch (err) {
        if (err instanceof GraphRevConflictError) continue;
        if (err instanceof GraphStoreClosedError) return 0;
        if (err instanceof GraphInvalidError) {
          logger.warn("graph.maintain: invalid", { error: err.message });
          return 0;
        }
        throw err;
      }
    }
    logger.warn("graph.maintain: skipped (conflict)", {});
    return 0;
  }
}
