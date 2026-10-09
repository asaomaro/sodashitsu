import { defineStore } from "pinia";
import { markRaw, ref } from "vue";
import type { Rect } from "../display/floatGeometry.js";
import { emptyMemory, loadMemory, rememberGeometry, saveMemory, sweepMemory, type WindowMemory, type WindowMemoryEntry } from "../graphTerminal/windowMemory.js";

/**
 * グラフの上の端末の窓の状態（20261008-graph-first の PR2a・PR2b。**窓は 3 つまで**）。決めるのは `graphTerminal/GraphTerminalController`、出すのは `GraphTerminalLayer`・`GraphTerminalWindow`。
 * - `opening`: 窓は出ているが、`pane.attach` の応答を待っている。
 * - `attached`: このブラウザが pane の直結の所有者で、窓の中に端末がある。
 * - `taken`: 別のクライアントが直結している（開くときに `pane_attached`、または開いた後に奪われた）。端末は出さず、［引き取って開く］と［閉じる］を出す（W2）。
 * - `failed`: pane が失敗状態・直結が断られた、など。理由を出す。
 */
export type GraphTerminalStatus = "opening" | "attached" | "taken" | "failed";

export interface GraphTerminalWindow {
  /** 窓の部品の識別（中身の pane が替わっても変わらない。Vue の `key`）。 */
  key: number;
  /** 窓に出している pane。**同じ pane を 2 つの窓には出さない**。 */
  paneId: string;
  status: GraphTerminalStatus;
  /** `taken` のとき、いま直結しているクライアント（分かれば）。 */
  takenBy: string | null;
  failure: string | null;
  /** 窓の本体（端末の要素を入れる箱）。窓の部品が mount 時に渡す。 */
  container: HTMLElement | null;
  /** 留めている（別のノードを押しても、中身が替わらない）。 */
  pinned: boolean;
  /** 窓の位置と大きさ（層の左上から、px）。動かした・大きさを変えたときだけ入る（null は、覚えた位置か、ノードの隣）。 */
  rect: Rect | null;
  /** 押したノードの箱（画面の座標）。窓の最初の位置（ノードの隣）と、ノードから窓への線に使う。窓を動かすまでの間だけ使う。 */
  anchor: Rect | null;
  /** いま出している窓の矩形（層の中の座標）。層が、ノードから窓への線を引くのに使う。 */
  shownRect: Rect | null;
  cols: number;
  rows: number;
  /** 開く・閉じるのたびに進める（非同期の続きを捨てる）。 */
  gen: number;
}

const safeStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const useGraphTerminalsStore = defineStore("graphTerminals", () => {
  /** 開いている窓（開いた順）。 */
  const windows = ref<GraphTerminalWindow[]>([]);
  /** 重なりの順（窓の `key`。末尾が最前面）。 */
  const order = ref<number[]>([]);
  /** 次に開く窓の最初の位置に使う、押したノードの箱（`open` が使い切る）。 */
  const pendingAnchor = ref<Rect | null>(null);
  /** 位置・大きさ・留めの記憶（ブラウザごと。`localStorage`）。 */
  const memory = ref<WindowMemory>(loadMemory(safeStorage()));
  let nextKey = 1;

  function persist(): void {
    saveMemory(safeStorage(), memory.value);
  }

  const find = (paneId: string): GraphTerminalWindow | undefined => windows.value.find((w) => w.paneId === paneId);
  const findByKey = (key: number): GraphTerminalWindow | undefined => windows.value.find((w) => w.key === key);
  const has = (paneId: string): boolean => find(paneId) !== undefined;

  function newWindow(paneId: string, init: Partial<GraphTerminalWindow> = {}): GraphTerminalWindow {
    return { key: nextKey++, paneId, status: "opening", takenBy: null, failure: null, container: null, pinned: false, rect: null, anchor: null, shownRect: null, cols: 0, rows: 0, gen: 0, ...init };
  }

  /** 窓を足す（最前面）。 */
  function add(paneId: string, init: Partial<GraphTerminalWindow> = {}): GraphTerminalWindow {
    windows.value.push(newWindow(paneId, init));
    const w = windows.value[windows.value.length - 1]!;
    order.value.push(w.key);
    return w;
  }

  /** `oldPaneId` の窓の中身を `paneId` に替える（窓の部品〔`key`〕・本体の箱・位置は、そのまま。最前面へ）。 */
  function replace(oldPaneId: string, paneId: string, init: Partial<GraphTerminalWindow> = {}): GraphTerminalWindow | undefined {
    const i = windows.value.findIndex((w) => w.paneId === oldPaneId);
    const old = windows.value[i];
    if (!old) return undefined;
    windows.value[i] = { ...newWindow(paneId, { key: old.key, container: old.container, rect: old.rect, gen: old.gen + 1 }), ...init };
    raise(windows.value[i]!.key);
    return windows.value[i]!;
  }

  function remove(paneId: string): void {
    const w = find(paneId);
    if (!w) return;
    windows.value = windows.value.filter((x) => x !== w);
    order.value = order.value.filter((k) => k !== w.key);
  }

  /** 押した・フォーカスした窓を前へ。 */
  function raise(key: number): void {
    if (order.value[order.value.length - 1] === key) return;
    order.value = [...order.value.filter((k) => k !== key), key];
  }
  const zOf = (key: number): number => Math.max(0, order.value.indexOf(key));

  function setStatus(paneId: string, s: GraphTerminalStatus, extra: { takenBy?: string | null; failure?: string | null } = {}): void {
    const w = find(paneId);
    if (!w) return;
    w.status = s;
    w.takenBy = extra.takenBy ?? null;
    w.failure = extra.failure ?? null;
  }
  function setSize(paneId: string, c: number, r: number): void {
    const w = find(paneId);
    if (!w) return;
    w.cols = c;
    w.rows = r;
  }
  function setRect(paneId: string, r: Rect): void {
    const w = find(paneId);
    if (w) w.rect = r;
  }
  function setShownRect(key: number, r: Rect | null): void {
    const w = findByKey(key);
    if (w) w.shownRect = r;
  }
  function setContainer(key: number, el: HTMLElement | null): void {
    const w = findByKey(key);
    if (w) w.container = el ? markRaw(el) : null;
  }
  function setAnchorOf(paneId: string, r: Rect | null): void {
    const w = find(paneId);
    if (w) w.anchor = r;
  }
  /** 次に開く窓のための、押したノードの箱（`GraphCanvas` が `open` の前に渡す）。 */
  function setAnchor(r: Rect | null): void {
    pendingAnchor.value = r;
  }
  function takePendingAnchor(): Rect | null {
    const a = pendingAnchor.value;
    pendingAnchor.value = null;
    return a;
  }

  // --- 記憶 ---------------------------------------------------------------------------------------------------------------------
  function setPinned(paneId: string, pinned: boolean): void {
    const w = find(paneId);
    if (w) w.pinned = pinned;
    const has2 = memory.value.pinned.includes(paneId);
    if (pinned && !has2) memory.value.pinned.push(paneId);
    else if (!pinned && has2) memory.value.pinned = memory.value.pinned.filter((id) => id !== paneId);
    persist();
  }
  function remember(paneId: string, e: WindowMemoryEntry): void {
    memory.value = rememberGeometry(memory.value, paneId, e);
    persist();
  }
  function sweep(alive: (paneId: string) => boolean): void {
    memory.value = sweepMemory(memory.value, alive);
    persist();
  }
  /** 留めの記憶を捨てる（マシンの切り替え。pane の id が別のマシンのものになるため）。 */
  function clearPinned(): void {
    for (const w of windows.value) w.pinned = false;
    memory.value.pinned = [];
    persist();
  }
  /** テスト用: 記憶を捨てる。 */
  function resetMemory(): void {
    memory.value = emptyMemory();
    persist();
  }

  return {
    windows,
    order,
    memory,
    find,
    findByKey,
    has,
    add,
    replace,
    remove,
    raise,
    zOf,
    setStatus,
    setSize,
    setRect,
    setShownRect,
    setContainer,
    setAnchorOf,
    setAnchor,
    takePendingAnchor,
    setPinned,
    clearPinned,
    remember,
    sweep,
    resetMemory,
  };
});
