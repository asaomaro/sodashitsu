import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { Rect } from "../display/floatGeometry.js";

/**
 * グラフの上の端末の窓の状態（20261008-graph-first の PR2a。**窓は 1 つ**）。決めるのは `term/GraphTerminalController`、出すのは `GraphTerminalLayer`・`GraphTerminalWindow`。
 * - `opening`: 窓は出ているが、`pane.attach` の応答を待っている。
 * - `attached`: このブラウザが pane の直結の所有者で、窓の中に端末がある。
 * - `taken`: 別のクライアントが直結している（開くときに `pane_attached`、または開いた後に奪われた）。端末は出さず、［引き取って開く］と［閉じる］を出す（W2）。
 * - `failed`: pane が失敗状態・直結が断られた、など。理由を出す。
 */
export type GraphTerminalStatus = "opening" | "attached" | "taken" | "failed";

export const useGraphTerminalsStore = defineStore("graphTerminals", () => {
  /** 窓に出している pane。null なら窓は無い。 */
  const paneId = ref<string | null>(null);
  const status = ref<GraphTerminalStatus>("opening");
  /** `taken` のとき、いま直結しているクライアント（分かれば）。 */
  const takenBy = ref<string | null>(null);
  const failure = ref<string | null>(null);
  /** 窓の本体（端末の要素を入れる箱）。窓の部品が mount 時に渡す。 */
  const container = shallowRef<HTMLElement | null>(null);
  /** 窓の位置と大きさ（層の左上から、px）。ブラウザを開いている間だけ覚える（X11）。null は、まだ決めていない。 */
  const rect = ref<Rect | null>(null);
  /** 押したノードの箱（画面の座標）。窓の最初の位置（ノードの隣）と、ノードから窓への線に使う。窓を動かすまでの間だけ使う。 */
  const anchor = ref<Rect | null>(null);
  /** いま出している窓の矩形（層の中の座標）。層が、ノードから窓への線を引くのに使う。 */
  const shownRect = ref<Rect | null>(null);
  /** いまの端末の桁と行（窓の下の行に出す）。 */
  const cols = ref(0);
  const rows = ref(0);

  function openFor(id: string): void {
    paneId.value = id;
    status.value = "opening";
    takenBy.value = null;
    failure.value = null;
  }
  function closeWindow(): void {
    paneId.value = null;
    status.value = "opening";
    takenBy.value = null;
    failure.value = null;
    shownRect.value = null;
  }
  function setStatus(s: GraphTerminalStatus, extra: { takenBy?: string | null; failure?: string | null } = {}): void {
    status.value = s;
    takenBy.value = extra.takenBy ?? null;
    failure.value = extra.failure ?? null;
  }
  function setSize(c: number, r: number): void {
    cols.value = c;
    rows.value = r;
  }
  function setRect(r: Rect): void {
    rect.value = r;
  }
  function setAnchor(r: Rect | null): void {
    anchor.value = r;
  }
  function setShownRect(r: Rect | null): void {
    shownRect.value = r;
  }
  function setContainer(el: HTMLElement | null): void {
    container.value = el;
  }

  return { paneId, status, takenBy, failure, container, rect, anchor, shownRect, setAnchor, setShownRect, cols, rows, openFor, closeWindow, setStatus, setSize, setRect, setContainer };
});
