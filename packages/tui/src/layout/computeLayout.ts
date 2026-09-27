import type { LayoutNode } from "@sodashitsu/protocol";
import type { Rect } from "../render/Screen.js";

export type { Rect };

export interface PaneBox {
  paneId: string;
  /** 枠（1 桁/1 行の罫線を含む）。 */
  frame: Rect;
  /** 中身（枠の内側。pane の端末の大きさとして申告する）。 */
  content: Rect;
}

/** 分割の境界（04 でドラッグに使う）。`dir` は分割の向き（`right` = 左右に並ぶ＝縦の境界）。 */
export interface Divider {
  splitId: string;
  dir: "right" | "down";
  x: number;
  y: number;
  /** 境界の長さ（`right` なら行数、`down` なら桁数）。 */
  len: number;
  /** その分割が割り付けられた矩形（比率の計算に使う）。 */
  area: Rect;
}

export interface LayoutInput {
  cols: number;
  rows: number;
  sidebarVisible: boolean;
  /** サイドバーの幅（右の境界の 1 桁を含む）。 */
  sidebarCols: number;
  /** これより狭ければ 1 列表示（サイドバーを隠し、焦点の pane だけを出す）。 */
  narrowThreshold: number;
  tab: { layout: LayoutNode; zoomedPaneId: string | null } | null;
  focusedPaneId: string | null;
}

export interface LayoutResult {
  cols: number;
  rows: number;
  /** 20×5 未満（「端末が小さすぎます」だけを描く）。 */
  tooSmall: boolean;
  narrow: boolean;
  sidebar?: Rect;
  tabBar: Rect;
  /** tab の分割を置く場所。 */
  paneArea: Rect;
  panes: PaneBox[];
  dividers: Divider[];
}

export const MIN_COLS = 20;
export const MIN_ROWS = 5;
const MIN_SIDEBAR = 10;
/** 枠つきの pane が最低限持つ桁/行（罫線 2＋中身 1）。 */
const MIN_SIDE = 3;

/**
 * 画面の割り付け（20260927-cli-mode の design「画面」・「layout/」。純粋な関数）。左にサイドバー（幅は列）、上に tab バー（1 行）、
 * 残りに tab の分割の木（比率 → 桁・行）。pane はそれぞれ 1 桁/1 行の罫線の枠を持つ。zoom は焦点の pane だけ。
 */
export function computeLayout(input: LayoutInput): LayoutResult {
  const { cols, rows } = input;
  const empty: Rect = { x: 0, y: 0, w: 0, h: 0 };
  if (cols < MIN_COLS || rows < MIN_ROWS) {
    return {
      cols,
      rows,
      tooSmall: true,
      narrow: false,
      tabBar: empty,
      paneArea: empty,
      panes: [],
      dividers: [],
    };
  }
  const narrow = cols < input.narrowThreshold;
  let left = 0;
  let sidebar: Rect | undefined;
  if (input.sidebarVisible && !narrow) {
    const w = Math.max(MIN_SIDEBAR, Math.min(input.sidebarCols, cols - MIN_COLS));
    sidebar = { x: 0, y: 0, w, h: rows };
    left = w;
  }
  const tabBar: Rect = { x: left, y: 0, w: cols - left, h: 1 };
  const paneArea: Rect = { x: left, y: 1, w: cols - left, h: rows - 1 };
  const panes: PaneBox[] = [];
  const dividers: Divider[] = [];
  const tab = input.tab;
  if (tab) {
    const soloId = tab.zoomedPaneId ?? (narrow ? input.focusedPaneId : null);
    if (soloId !== null && containsPane(tab.layout, soloId)) panes.push(box(soloId, paneArea));
    else place(tab.layout, paneArea, panes, dividers);
  }
  return {
    cols,
    rows,
    tooSmall: false,
    narrow,
    ...(sidebar ? { sidebar } : {}),
    tabBar,
    paneArea,
    panes,
    dividers,
  };
}

function box(paneId: string, frame: Rect): PaneBox {
  const content: Rect = {
    x: frame.x + 1,
    y: frame.y + 1,
    w: Math.max(0, frame.w - 2),
    h: Math.max(0, frame.h - 2),
  };
  return { paneId, frame, content };
}

/** 比率で分ける（両側に最低 `MIN_SIDE` を残す。残せない狭さなら半分）。 */
export function splitSize(total: number, ratio: number): number {
  const min = Math.min(MIN_SIDE, Math.floor(total / 2));
  const r = Number.isFinite(ratio) ? ratio : 0.5;
  return Math.max(min, Math.min(total - min, Math.round(total * r)));
}

function place(node: LayoutNode, area: Rect, out: PaneBox[], dividers: Divider[]): void {
  if (node.type === "pane") {
    out.push(box(node.paneId, area));
    return;
  }
  if (node.dir === "right") {
    const aw = splitSize(area.w, node.ratio);
    place(node.a, { ...area, w: aw }, out, dividers);
    place(node.b, { ...area, x: area.x + aw, w: area.w - aw }, out, dividers);
    dividers.push({ splitId: node.id, dir: "right", x: area.x + aw, y: area.y, len: area.h, area });
  } else {
    const ah = splitSize(area.h, node.ratio);
    place(node.a, { ...area, h: ah }, out, dividers);
    place(node.b, { ...area, y: area.y + ah, h: area.h - ah }, out, dividers);
    dividers.push({ splitId: node.id, dir: "down", x: area.x, y: area.y + ah, len: area.w, area });
  }
}

function containsPane(node: LayoutNode, paneId: string): boolean {
  return node.type === "pane"
    ? node.paneId === paneId
    : containsPane(node.a, paneId) || containsPane(node.b, paneId);
}
