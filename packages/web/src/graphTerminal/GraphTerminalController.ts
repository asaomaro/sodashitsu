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
import { GRAPH_TERMINAL_MAX_WINDOWS } from "./windowMemory.js";

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

export interface GraphTerminalOpenOptions {
  /** 別のクライアントの直結を奪って開く（W2 の［引き取って開く］と同じ）。 */
  takeover?: boolean;
  /** 開いた窓の端末へフォーカスを置く・その pane を選ぶ（既定は両方 true。留めた窓を開き直すときは false）。 */
  focus?: boolean;
  /** 留めた窓として開く（開き直し）。 */
  pinned?: boolean;
  /** 既にある、留めていない窓を使わず、新しい窓で開く（留めた窓の開き直し）。 */
  forceNew?: boolean;
  /** 押したノードの箱（画面の座標）。無ければ、`store.setAnchor` で渡された箱。 */
  anchor?: { x: number; y: number; w: number; h: number } | null;
}

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
 * グラフの上の端末の窓（20261008-graph-first の PR2a・PR2b。**3 つまで**）の進行。窓ごとに、直結・購読・端末の要素・フォーカスを持つ。
 *
 * 開く: 窓を出す → 端末の要素を窓へ移し、フォーカスを置く（同じ作業の中。X8）→ 購読（要るときだけ）→ `pane.attach`（窓の中の桁と行。40×10 以上）→ その pane を選ぶ（X6。サイドバーの行を押したのと同じ）。
 * 別のノードを押したとき: その pane が窓にあれば前へ出してフォーカス（**同じ pane を 2 つの窓に出さない**）。無ければ、**留めていない窓**（高々 1 つ）の中身を替える。無ければ新しい窓（3 つまで。
 * 3 つとも留めてあれば、開かずに知らせる）。大きさを変える: `pane.attach_resize`（間引く）。別のクライアントが直結を奪ったら、その窓だけ W2 の表示へ。再接続の後は、すべての窓が購読と直結をし直す。
 * 閉じる（X10）: フォーカスを移す → 要素を基本画面へ戻す → `pane.detach` → 窓を外す。**どの閉じる道も `close`／`closeAll` を通る**（どの窓の直結も残さない）。
 */
export class GraphTerminalController {
  private genSeq = 0;
  private readonly resizer: TrailingThrottle;
  /** 大きさを測り直す窓（pane の id）。 */
  private readonly resizePending = new Set<string>();

  constructor(private readonly opts: GraphTerminalControllerOptions) {
    this.resizer = createTrailingThrottle(() => this.flushResize(), opts.resizeIntervalMs);
  }

  /** この pane を、窓に出している（直結の所有者として）。`TerminalRegistry` のフォーカスの報告の判定が、サイズ権限の代わりに使う。 */
  ownsAttachment(paneId: string): boolean {
    return this.opts.store.find(paneId)?.status === "attached";
  }

  /** 窓が 1 つでも出ている。 */
  isOpen(): boolean {
    return this.opts.store.windows.length > 0;
  }

  /** この pane を窓に出している（どの状態でも）。 */
  isShowing(paneId: string): boolean {
    return this.opts.store.has(paneId);
  }

  /**
   * この pane の端末を窓に開く（上の「別のノードを押したとき」）。同じ pane が窓にあれば、前へ出してフォーカスを置くだけ。
   */
  async open(paneId: string, opts: GraphTerminalOpenOptions = {}): Promise<void> {
    const { store, session, view } = this.opts;
    const pane = session.panes.get(paneId);
    if (!pane) return;
    const existing = store.find(paneId);
    if (existing) {
      store.takePendingAnchor();
      store.raise(existing.key);
      if (existing.status === "attached") this.focusTerminal(paneId);
      else this.focusSurface(paneId);
      return;
    }
    const slot = opts.forceNew ? undefined : store.windows.find((w) => !w.pinned);
    if (!slot && store.windows.length >= GRAPH_TERMINAL_MAX_WINDOWS) {
      store.takePendingAnchor();
      view.toast("窓は 3 つまでです。どれかを閉じるか、留めを外してください。");
      return;
    }
    const anchor = opts.anchor !== undefined ? opts.anchor : store.takePendingAnchor();
    const remembered = store.memory.geometry[paneId] !== undefined;
    let gen: number;
    if (slot) {
      const keepRect = remembered ? null : slot.rect;
      this.resizePending.delete(slot.paneId);
      this.release(slot.paneId, { sendDetach: slot.status !== "taken" });
      const w = store.replace(slot.paneId, paneId, { anchor: remembered ? null : anchor, rect: keepRect, pinned: opts.pinned === true });
      gen = w!.gen = ++this.genSeq;
    } else {
      const w = store.add(paneId, { anchor: remembered ? null : anchor, pinned: opts.pinned === true });
      gen = w.gen = ++this.genSeq;
    }
    if (opts.pinned) store.setPinned(paneId, true);
    if (pane.status === "failed") {
      store.setStatus(paneId, "failed", { failure: pane.failure ?? "起動できませんでした" });
      return;
    }
    await nextTick(); // 窓の本体の箱が現れる（替える場合は、すでにある）
    if (store.find(paneId)?.gen !== gen) return;
    await this.attachPane(paneId, gen, opts.takeover === true, { select: opts.focus !== false, focus: opts.focus !== false });
  }

  /** W2 の［引き取って開く］。別のクライアントの直結を奪って、窓に出す。 */
  async takeover(paneId: string): Promise<void> {
    const { store } = this.opts;
    const w = store.find(paneId);
    if (!w) return;
    const gen = (w.gen = ++this.genSeq);
    store.setStatus(paneId, "opening");
    await nextTick();
    if (store.find(paneId)?.gen !== gen) return;
    await this.attachPane(paneId, gen, true, { select: true, focus: true });
  }

  /** 留める・外す。留めを外すとき、ほかに留めていない窓があれば、そちらを閉じる（留めていない窓は高々 1 つ）。 */
  pin(paneId: string, pinned: boolean): void {
    const { store } = this.opts;
    const w = store.find(paneId);
    if (!w) return;
    if (!pinned) {
      const other = store.windows.find((x) => x !== w && !x.pinned);
      if (other) this.close(other.paneId, "none");
    }
    store.setPinned(paneId, pinned);
  }

  /** 窓を前へ（押した・フォーカスした）。 */
  raise(paneId: string): void {
    const w = this.opts.store.find(paneId);
    if (w) this.opts.store.raise(w.key);
  }

  /**
   * 窓を閉じる。X10 の順: フォーカスを移す → 要素を戻す → `pane.detach` → 窓を外す。何度呼んでもよい。留めの記憶は外す（`keepPinned` なら残す。画面を切り替えて戻ったとき開き直すため）。
   * `base` では、要素を戻した後で、基本画面の端末へフォーカスを置く（基本画面が見えている間に呼ぶこと）。
   */
  close(paneId: string, focus: CloseFocus = "node", o: { keepPinned?: boolean } = {}): void {
    const { store } = this.opts;
    const w = store.find(paneId);
    if (!w) return;
    w.gen = ++this.genSeq;
    this.resizePending.delete(paneId);
    if (focus === "node") this.focusNode(paneId);
    this.release(paneId, { sendDetach: w.status !== "taken" });
    if (focus === "base") {
      const id = this.opts.view.focusedPaneId;
      if (id) this.opts.registry.focus(id);
    }
    if (!o.keepPinned) store.setPinned(paneId, false);
    store.remove(paneId);
  }

  /** すべての窓を閉じる（画面が基本画面になった・1 列の幅）。留めた窓は、グラフの画面へ戻ったとき開き直す。 */
  closeAll(focus: CloseFocus = "base"): void {
    const { store } = this.opts;
    const ids = store.windows.map((w) => w.paneId);
    if (ids.length === 0) return;
    for (const id of ids) this.close(id, "none", { keepPinned: true });
    if (focus === "base") {
      const id = this.opts.view.focusedPaneId;
      if (id) this.opts.registry.focus(id);
    }
  }

  /** グラフの画面へ戻った・開いたとき: 留めた窓を開き直す（選ばない・フォーカスを動かさない）。無くなった pane の記憶は掃除する。 */
  async reopenPinned(): Promise<void> {
    const { store, session } = this.opts;
    if (session.panes.size > 0) store.sweep((id) => session.panes.has(id));
    for (const id of [...store.memory.pinned]) {
      if (store.has(id) || !session.panes.has(id)) continue;
      if (store.windows.length >= GRAPH_TERMINAL_MAX_WINDOWS) break;
      await this.open(id, { pinned: true, forceNew: true, focus: false, anchor: null });
    }
  }

  /** マシンの切り替え：前のマシンの pane を見せない。サーバへは何も送らない（接続ごと替わる）。留めの記憶も捨てる。 */
  resetForMachineSwitch(): void {
    const { store, host } = this.opts;
    this.resizer.cancel();
    this.resizePending.clear();
    for (const w of [...store.windows]) {
      w.gen = ++this.genSeq;
      host.detachFromWindow(w.paneId);
      store.remove(w.paneId);
    }
    store.clearPinned();
  }

  /**
   * ［基本画面で開く］。その pane を選び直し（基本画面の tab を、その pane のものにする）、画面を基本画面へ切り替える。窓は、画面の切り替えを見て閉じる（`main.ts` の watch。
   * X10：要素を基本画面へ戻してから、その端末にフォーカスを置く）。**先に選び直す**のは、画面のあいだにサイドバーで別の tab を選んでいても、戻した要素が載る `TerminalPane` があるようにするため（B6）。
   */
  openInBase(paneId: string): void {
    if (!this.opts.store.has(paneId)) return;
    this.select(paneId);
    this.opts.view.closeGraph();
  }

  /** 窓の本体の箱の大きさが変わった。桁と行を測り、変わっていれば申告する（間引く）。 */
  noteBodyResized(paneId: string): void {
    const w = this.opts.store.find(paneId);
    if (!w || w.status !== "attached") return;
    this.resizePending.add(paneId);
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

  /**
   * 窓の pane が選ばれていなければ選び直す（窓の端末にフォーカスが入ったとき・キーを受けたとき。PR2a のレビュー指摘 1）。**フォーカスのある窓の pane が、選んでいる pane**
   * （copy・スクロールバック・サブエージェントの一覧は選んでいる pane が対象）。開く途中（`attached` でない間）は何もしない（X6 の順を保つ）。
   */
  ensureSelected(paneId: string): void {
    const { store, view } = this.opts;
    if (store.find(paneId)?.status !== "attached" || view.focusedPaneId === paneId) return;
    this.select(paneId);
  }

  /** `pane.attach_changed`。窓の pane の直結を別のクライアントが奪ったら、その窓を W2 の表示へ替える。 */
  onAttachChanged(paneId: string, clientId: string | null): void {
    const { store, session } = this.opts;
    const w = store.find(paneId);
    if (!w || w.status !== "attached") return;
    if (clientId === null || clientId === session.clientId) return;
    w.gen = ++this.genSeq;
    this.resizePending.delete(paneId);
    this.focusSurface(paneId); // 端末のフォーカスを窓の枠へ（要素を戻すとき、`body` に落とさない）
    this.opts.host.detachFromWindow(paneId);
    store.setStatus(paneId, "taken", { takenBy: clientId });
  }

  /** 新しい接続の `client.hello` が通った後。すべての窓が、購読と直結をし直す（サーバは接続ごとに直結を外す）。 */
  async onReconnected(): Promise<void> {
    const { store, session } = this.opts;
    const jobs: Promise<void>[] = [];
    for (const w0 of [...store.windows]) {
      const paneId = w0.paneId;
      if (!session.panes.has(paneId)) {
        this.close(paneId, "none");
        continue;
      }
      const w = store.find(paneId);
      if (!w || w.status === "failed" || w.status === "taken") continue; // 引き取るかは利用者が決める
      const gen = (w.gen = ++this.genSeq);
      store.setStatus(paneId, "opening");
      jobs.push(this.attachPane(paneId, gen, false, { select: false, focus: false }));
    }
    await Promise.all(jobs);
  }

  // --- 内部 -----------------------------------------------------------------------------------------------------------------------

  /** 要素を窓へ移して購読し、`pane.attach` する。 */
  private async attachPane(paneId: string, gen: number, takeover: boolean, o: { select: boolean; focus: boolean }): Promise<void> {
    const { store, host, conn } = this.opts;
    const w = store.find(paneId);
    const container = w?.container;
    if (!w || !container) {
      store.setStatus(paneId, "failed", { failure: "窓を開けませんでした" });
      return;
    }
    // 移す → 描き直す → フォーカス、を同じ作業の中で行う（X8。見回りに `body` を見せない）。窓を開き直すだけのとき（フォーカスを動かさない）は、端末の tabIndex も触らない。
    const entry = host.attachToWindow(paneId, container);
    if (o.focus) {
      syncTerminalTabStop(entry.term.textarea, true);
      entry.term.focus();
    }
    host.ensureSubscribed(paneId);
    const { cols, rows } = this.measureBody(entry, container);
    try {
      const res = await conn.request("pane.attach", { paneId, cols, rows, ...(takeover ? { takeover: true } : {}) });
      if (store.find(paneId)?.gen !== gen) return;
      store.setStatus(paneId, "attached");
      store.setSize(paneId, res.cols, res.rows);
    } catch (err) {
      if (store.find(paneId)?.gen !== gen) return;
      this.focusSurface(paneId);
      host.detachFromWindow(paneId);
      if (errorCodeOf(err) === "pane_attached") store.setStatus(paneId, "taken");
      else store.setStatus(paneId, "failed", { failure: "pane に直結できませんでした" });
      return;
    }
    if (o.select) this.select(paneId);
    // 新しく作った端末は、描画されるまでセルの寸法が既定値（9×18）。描画の後に測り直す。
    requestAnimationFrame(() => {
      if (store.find(paneId)?.gen === gen) this.noteBodyResized(paneId);
    });
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
      this.focusSurface(paneId); // 要素を動かす前に、フォーカスを窓の枠へ（端末にフォーカスを残したまま動かさない）
      host.detachFromWindow(paneId);
    }
    if (o.sendDetach) void conn.request("pane.detach", { paneId }).catch(() => undefined);
  }

  private flushResize(): void {
    const { store, registry, host, conn } = this.opts;
    const ids = [...this.resizePending];
    this.resizePending.clear();
    for (const paneId of ids) {
      const w = store.find(paneId);
      if (!w || w.status !== "attached" || !host.heldByWindow(paneId)) continue;
      const entry = registry.get(paneId);
      const container = w.container;
      if (!entry || !container) continue;
      const { cols, rows } = this.measureBody(entry, container);
      if (cols === w.cols && rows === w.rows) continue;
      store.setSize(paneId, cols, rows);
      void conn.request("pane.attach_resize", { paneId, cols, rows }).catch((err) => {
        if (errorCodeOf(err) === "not_attached" && store.find(paneId)) this.onAttachChanged(paneId, "unknown");
      });
    }
  }

  private measureBody(entry: TermEntry, container: HTMLElement): { cols: number; rows: number } {
    const { cols, rows } = measure(container.clientWidth, container.clientHeight, getCellSize(entry.term));
    return { cols: Math.max(GRAPH_TERMINAL_MIN_COLS, cols), rows: Math.max(GRAPH_TERMINAL_MIN_ROWS, rows) };
  }

  private windowRoot(paneId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-graph-terminal-window][data-pane-id="${paneId}"]`);
  }
  /** フォーカスを窓の枠（`tabindex="-1"`）へ。窓の外にフォーカスがあるときは動かさない。 */
  private focusSurface(paneId: string): void {
    const root = this.windowRoot(paneId);
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
