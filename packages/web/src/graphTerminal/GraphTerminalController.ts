import { nextTick } from "vue";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { createTrailingThrottle, type TrailingThrottle } from "../term/resizeThrottle.js";
import { getCellSize, measure } from "../term/measure.js";
import type { TermEntry, TerminalRegistry } from "../term/TerminalRegistry.js";
import type { TerminalHost } from "../term/terminalHost.js";
import { syncTerminalTabStop } from "../term/useTerminalSurface.js";
import type { useGraphTerminalsStore } from "../store/graphTerminals.js";
import type { useSessionStore } from "../store/session.js";
import type { useViewStore } from "../store/view.js";

/** 窓の端末の最小の大きさ（桁 × 行。X12。これより小さいと、エージェントの画面が崩れる）。 */
export const GRAPH_TERMINAL_MIN_COLS = 40;
export const GRAPH_TERMINAL_MIN_ROWS = 10;

/** 窓を閉じたあと、フォーカスをどこへ置くか（X10）。 */
export type CloseFocus =
  /** グラフのノード（無ければグラフの面）。窓の［×］・pane が閉じた、など、グラフの画面が見えているまま閉じるとき。 */
  | "node"
  /** 基本画面の、選んでいる pane の端末。画面が基本画面へ切り替わるとき（要素を戻した後に置く）。 */
  | "base"
  /** 動かさない（フォーカスが窓の外にある・モバイルの幅・マシンの切り替え）。 */
  | "none";

export interface GraphTerminalControllerOptions {
  conn: Pick<ConnectionPort, "request">;
  host: TerminalHost;
  registry: TerminalRegistry;
  store: ReturnType<typeof useGraphTerminalsStore>;
  session: ReturnType<typeof useSessionStore>;
  view: ReturnType<typeof useViewStore>;
  /** 大きさの申告（`pane.attach_resize`）を間引く間隔。 */
  resizeIntervalMs?: number;
}

const errorCodeOf = (err: unknown): string | undefined => (err as { code?: string } | null)?.code;

/**
 * グラフの上の端末の窓（20261008-graph-first の PR2a。窓は 1 つ）の進行。
 *
 * 開く: 窓を出す → 端末の要素を窓へ移し、フォーカスを置く（同じ作業の中。X8）→ 購読（要るときだけ）→ `pane.attach`（窓の中の桁と行。40×10 以上）→ その pane を選ぶ（X6。サイドバーの行を押したのと同じ）。
 * 大きさを変える: `pane.attach_resize`（間引く）。別のクライアントが直結を奪ったら（`pane.attach_changed`）、W2 の表示へ替える。再接続の後は、購読と直結をし直す。
 * 閉じる（X10）: フォーカスを移す → 要素を基本画面へ戻す → `pane.detach` → 窓を外す。**どの閉じる道も `close` を通す**（直結を残さない）。
 */
export class GraphTerminalController {
  /** 開く・閉じるのたびに進める。await の後で、古い呼び出しの続きを捨てる。 */
  private gen = 0;
  private readonly resizer: TrailingThrottle;

  constructor(private readonly opts: GraphTerminalControllerOptions) {
    this.resizer = createTrailingThrottle(() => this.flushResize(), opts.resizeIntervalMs);
  }

  /** この pane を、窓に出している（直結の所有者として）。`TerminalRegistry` のフォーカスの報告の判定が、サイズ権限の代わりに使う。 */
  ownsAttachment(paneId: string): boolean {
    return this.opts.store.paneId === paneId && this.opts.store.status === "attached";
  }

  /** 窓が出ている（どの状態でも）。 */
  isOpen(): boolean {
    return this.opts.store.paneId !== null;
  }

  /** この pane を窓に出している（どの状態でも）。 */
  isShowing(paneId: string): boolean {
    return this.opts.store.paneId === paneId;
  }

  /**
   * この pane の端末を窓に開く。窓が別の pane を出していれば、中身をこの pane に替える（前の pane の直結をやめ、要素を戻してから）。
   * 同じ pane なら、窓の端末へフォーカスを置くだけ。
   */
  async open(paneId: string, opts: { takeover?: boolean } = {}): Promise<void> {
    const { store, session } = this.opts;
    const pane = session.panes.get(paneId);
    if (!pane) return;
    if (store.paneId === paneId && (store.status === "attached" || store.status === "opening")) {
      this.focusTerminal(paneId);
      return;
    }
    const gen = ++this.gen;
    const prev = store.paneId;
    if (prev !== null) this.release(prev, { sendDetach: store.status !== "taken" });
    store.openFor(paneId);
    if (pane.status === "failed") {
      store.setStatus("failed", { failure: pane.failure ?? "起動できませんでした" });
      return;
    }
    await nextTick(); // 窓の本体の箱が現れる（替える場合は、すでにある）
    if (gen !== this.gen) return;
    await this.attachPane(paneId, gen, opts.takeover === true, { select: true });
  }

  /** W2 の［引き取って開く］。別のクライアントの直結を奪って、窓に出す。 */
  async takeover(): Promise<void> {
    const { store } = this.opts;
    const paneId = store.paneId;
    if (paneId === null) return;
    const gen = ++this.gen;
    store.setStatus("opening");
    await nextTick();
    if (gen !== this.gen) return;
    await this.attachPane(paneId, gen, true, { select: true });
  }

  /**
   * 窓を閉じる。X10 の順: フォーカスを移す → 要素を戻す → `pane.detach` → 窓を外す。何度呼んでもよい。
   * `base` では、要素を戻した後で、基本画面の端末へフォーカスを置く（基本画面が見えている間に呼ぶこと）。
   */
  close(focus: CloseFocus = "node"): void {
    const { store } = this.opts;
    const paneId = store.paneId;
    if (paneId === null) return;
    this.gen++;
    this.resizer.cancel();
    if (focus === "node") this.focusNode(paneId);
    this.release(paneId, { sendDetach: store.status !== "taken" });
    if (focus === "base") {
      const id = this.opts.view.focusedPaneId;
      if (id) this.opts.registry.focus(id);
    }
    store.closeWindow();
  }

  /**
   * ［基本画面で開く］。その pane を選び直し（基本画面の tab を、その pane のものにする）、画面を基本画面へ切り替える。窓は、画面の切り替えを見て閉じる（`main.ts` の watch。
   * X10：要素を基本画面へ戻してから、その端末にフォーカスを置く）。**先に選び直す**のは、画面のあいだにサイドバーで別の tab を選んでいても、戻した要素が載る `TerminalPane` があるようにするため（B6）。
   */
  openInBase(): void {
    const { store, view } = this.opts;
    const paneId = store.paneId;
    if (paneId === null) return;
    this.select(paneId);
    view.closeGraph();
  }

  /** マシンの切り替え：前のマシンの pane を見せない。サーバへは何も送らない（接続ごと替わる）。 */
  resetForMachineSwitch(): void {
    const { store } = this.opts;
    const paneId = store.paneId;
    if (paneId === null) return;
    this.gen++;
    this.resizer.cancel();
    this.opts.host.detachFromWindow(paneId);
    store.closeWindow();
  }

  /** 窓の本体の箱の大きさが変わった。桁と行を測り、変わっていれば申告する（間引く）。 */
  noteBodyResized(): void {
    const { store } = this.opts;
    if (store.paneId === null || store.status !== "attached") return;
    this.resizer.schedule();
  }

  /** `prefix+a`（窓にフォーカスがあるとき。X1）: グラフの面へフォーカスを戻す。窓は開いたまま。 */
  focusGraphSurface(): void {
    document.querySelector<HTMLElement>("[data-graph-view]")?.focus({ preventScroll: true });
  }

  /** 窓の端末へフォーカスを置く。 */
  focusTerminal(paneId: string): void {
    const entry = this.opts.registry.get(paneId);
    if (entry && this.opts.host.heldByWindow(paneId)) entry.term.focus();
  }

  /** `pane.attach_changed`。窓の pane の直結を別のクライアントが奪ったら、W2 の表示へ替える。 */
  onAttachChanged(paneId: string, clientId: string | null): void {
    const { store, session } = this.opts;
    if (store.paneId !== paneId || store.status !== "attached") return;
    if (clientId === null || clientId === session.clientId) return;
    this.gen++;
    this.resizer.cancel();
    this.focusSurface(); // 端末のフォーカスを窓の枠へ（要素を戻すとき、`body` に落とさない）
    this.opts.host.detachFromWindow(paneId);
    store.setStatus("taken", { takenBy: clientId });
  }

  /** 新しい接続の `client.hello` が通った後。窓が出ていれば、購読と直結をし直す（サーバは接続ごとに直結を外す）。 */
  async onReconnected(): Promise<void> {
    const { store, session } = this.opts;
    const paneId = store.paneId;
    if (paneId === null) return;
    if (!session.panes.has(paneId)) {
      this.close("none");
      return;
    }
    if (store.status === "failed") return;
    const gen = ++this.gen;
    if (store.status === "taken") return; // 引き取るかは利用者が決める
    store.setStatus("opening");
    await this.attachPane(paneId, gen, false, { select: false });
  }

  // --- 内部 -----------------------------------------------------------------------------------------------------------------------

  /** 要素を窓へ移して購読し、`pane.attach` する。 */
  private async attachPane(paneId: string, gen: number, takeover: boolean, o: { select: boolean }): Promise<void> {
    const { store, host, conn } = this.opts as { store: GraphTerminalControllerOptions["store"]; host: TerminalHost; conn: Pick<ConnectionPort, "request"> };
    const container = store.container;
    if (!container) {
      store.setStatus("failed", { failure: "窓を開けませんでした" });
      return;
    }
    // 移す → 描き直す → フォーカス、を同じ作業の中で行う（X8。見回りに `body` を見せない）。
    const entry = host.attachToWindow(paneId, container);
    syncTerminalTabStop(entry.term.textarea, true);
    entry.term.focus();
    host.ensureSubscribed(paneId);
    const { cols, rows } = this.measureBody(entry, container);
    try {
      const res = await conn.request("pane.attach", { paneId, cols, rows, ...(takeover ? { takeover: true } : {}) });
      if (gen !== this.gen) return;
      store.setStatus("attached");
      store.setSize(res.cols, res.rows);
    } catch (err) {
      if (gen !== this.gen) return;
      if (errorCodeOf(err) === "pane_attached") {
        this.focusSurface();
        host.detachFromWindow(paneId);
        store.setStatus("taken");
      } else {
        this.focusSurface();
        host.detachFromWindow(paneId);
        store.setStatus("failed", { failure: "pane に直結できませんでした" });
      }
      return;
    }
    if (o.select) this.select(paneId);
    // 新しく作った端末は、描画されるまでセルの寸法が既定値（9×18）。描画の後に測り直す。
    requestAnimationFrame(() => {
      if (gen === this.gen) this.noteBodyResized();
    });
  }

  /**
   * 窓の pane が「選んでいる pane」でなくなっていたら選び直す（窓の端末にフォーカスが入ったとき・キーを受けたとき。レビュー指摘 1）。窓を開いた後にサイドバーが別の pane を選ぶと、
   * copy・スクロールバック・サブエージェントの一覧（どれも選んでいる pane が対象）が、窓に見えていない pane に効いてしまう。「窓で打った操作は、窓に見えている pane に効く」を保つ。
   */
  ensureSelected(paneId: string): void {
    const { store, view } = this.opts;
    if (store.paneId !== paneId || store.status !== "attached" || view.focusedPaneId === paneId) return;
    this.select(paneId);
  }

  /** サイドバーの行を押したのと同じに、その pane を選ぶ（X6。`GraphCanvas.selectLikeSidebar` の pane の場合と同じ）。 */
  private select(paneId: string): void {
    const { session, view, conn } = this.opts;
    const pane = session.panes.get(paneId);
    const tab = pane ? session.tabs.get(pane.tabId) : undefined;
    if (!pane || !tab) return;
    view.setView(tab.workspaceId, tab.id);
    view.focusPane(paneId);
    void conn.request("pane.focus", { paneId }).catch(() => undefined);
  }

  /** 要素を窓から戻し、直結をやめる。 */
  private release(paneId: string, o: { sendDetach: boolean }): void {
    const { host, conn } = this.opts;
    if (host.heldByWindow(paneId)) {
      this.focusSurface(); // 要素を動かす前に、フォーカスを窓の枠へ（端末にフォーカスを残したまま動かさない）
      host.detachFromWindow(paneId);
    }
    if (o.sendDetach) void conn.request("pane.detach", { paneId }).catch(() => undefined);
  }

  private flushResize(): void {
    const { store, registry, host, conn } = this.opts;
    const paneId = store.paneId;
    if (paneId === null || store.status !== "attached" || !host.heldByWindow(paneId)) return;
    const entry = registry.get(paneId);
    const container = store.container;
    if (!entry || !container) return;
    const { cols, rows } = this.measureBody(entry, container);
    if (cols === store.cols && rows === store.rows) return;
    store.setSize(cols, rows);
    void conn.request("pane.attach_resize", { paneId, cols, rows }).catch((err) => {
      if (errorCodeOf(err) === "not_attached" && this.opts.store.paneId === paneId) this.onAttachChanged(paneId, "unknown");
    });
  }

  private measureBody(entry: TermEntry, container: HTMLElement): { cols: number; rows: number } {
    const { cols, rows } = measure(container.clientWidth, container.clientHeight, getCellSize(entry.term));
    return { cols: Math.max(GRAPH_TERMINAL_MIN_COLS, cols), rows: Math.max(GRAPH_TERMINAL_MIN_ROWS, rows) };
  }

  private windowRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>("[data-graph-terminal-window]");
  }
  /** フォーカスを窓の枠（`tabindex="-1"`）へ。窓の外にフォーカスがあるときは動かさない。 */
  private focusSurface(): void {
    const root = this.windowRoot();
    if (!root) return;
    const a = document.activeElement;
    if (a && !root.contains(a)) return;
    root.focus({ preventScroll: true });
  }
  /** グラフのノード（無ければグラフの面）へフォーカスを置く。 */
  private focusNode(paneId: string): void {
    const view = document.querySelector<HTMLElement>("[data-graph-view]");
    // pane が閉じて閉じる場合、ノードもまもなく消える（フォーカスを持ったまま消えると `body` に落ちる）ので、グラフの面へ。
    const node = this.opts.session.panes.has(paneId) ? view?.querySelector<HTMLElement>(`[data-node-key$=":${paneId}"]`) : null;
    (node ?? view)?.focus({ preventScroll: true });
  }
}
