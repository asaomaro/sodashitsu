import type { LayoutNode } from "@sodashitsu/protocol";
import type { Rect } from "../render/Screen.js";

export type { Rect };

/** 枠の罫線を描く辺。 */
export interface PaneSides {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export const ALL_SIDES: PaneSides = { top: true, right: true, bottom: true, left: true };

export interface PaneBox {
  paneId: string;
  /** 枠（罫線を含む）。 */
  frame: Rect;
  /** 中身（枠の内側。pane の端末の大きさとして申告する）。 */
  content: Rect;
  /** 罫線を描く辺（上辺があれば pane の名前をそこに出す）。 */
  sides: PaneSides;
}

/** pane の枠の描画（共有の設定 `paneBorders`。herdr の `ui.pane_borders`）。 */
export type PaneBorders = "always" | "auto" | "off";

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
  /** pane の枠（always・分割しているときだけ・無し）と、分割の間の隙間（偽なら左右の隣は罫線 1 本を分け合う）。既定は always・true。 */
  paneBorders?: PaneBorders;
  paneGaps?: boolean;
  /** tab バーの位置（共有の設定 `tabBarPosition`。既定は上）。 */
  tabBarPosition?: "top" | "bottom";
  /** tab バーを隠す（tab が 1 つで、`tui.hideTabBarWhenSingle`。狭い幅では隠さない）。 */
  hideTabBar?: boolean;
  /**
   * 狭い幅で navigate モードのとき、サイドバーを pane の上に重ねて出す（herdr の mobile の switcher の役。選んでいる workspace が見える。
   * 04 ラウンド 2 の点検）。pane の割り付けは変えない。
   */
  navigateOverlay?: boolean;
}

export interface LayoutResult {
  cols: number;
  rows: number;
  /** 20×5 未満（「端末が小さすぎます」だけを描く）。 */
  tooSmall: boolean;
  narrow: boolean;
  sidebar?: Rect;
  /** サイドバーを pane の上に重ねて出している（狭い幅の navigate モード）。 */
  sidebarOverlay?: boolean;
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
  // サイドバーは pane の場所を最低 MIN_COLS 桁残せるときだけ出す（`narrowThreshold` を小さく設定しても pane の幅が最小を割らない）。
  if (input.sidebarVisible && !narrow && cols - MIN_COLS >= MIN_SIDEBAR) {
    const w = Math.max(MIN_SIDEBAR, Math.min(input.sidebarCols, cols - MIN_COLS));
    sidebar = { x: 0, y: 0, w, h: rows };
    left = w;
  }
  // tab バー：上か下の 1 行（狭い幅は 1 列表示の上辺で、いつも上）。隠すときは高さ 0（当たりも無い）。
  const hidden = !narrow && input.hideTabBar === true;
  const bottomBar = !narrow && input.tabBarPosition === "bottom";
  const barH = hidden ? 0 : 1;
  const tabBar: Rect = hidden
    ? { x: left, y: -1, w: cols - left, h: 0 }
    : { x: left, y: bottomBar ? rows - 1 : 0, w: cols - left, h: 1 };
  const paneArea: Rect = {
    x: left,
    y: bottomBar || hidden ? 0 : 1,
    w: cols - left,
    h: rows - barH,
  };
  const chrome: ChromeRule = {
    borders: input.paneBorders ?? "always",
    gaps: input.paneGaps ?? true,
  };
  const panes: PaneBox[] = [];
  const dividers: Divider[] = [];
  const tab = input.tab;
  if (tab) {
    let soloId = tab.zoomedPaneId ?? (narrow ? input.focusedPaneId : null);
    // 狭い幅で焦点の pane が無い（この tab に無い）ときは先頭の pane を出す（分割の木ごと並べない）。
    if (narrow && (soloId === null || !containsPane(tab.layout, soloId)))
      soloId = firstPane(tab.layout);
    if (soloId !== null && containsPane(tab.layout, soloId))
      panes.push(box(soloId, paneArea, sidesOf(chrome, false, NO_NEIGHBORS)));
    else {
      const multi = tab.layout.type !== "pane";
      place(tab.layout, paneArea, panes, dividers, chrome, multi, NO_NEIGHBORS);
    }
  }
  const overlay =
    narrow && input.navigateOverlay === true
      ? { x: 0, y: 1, w: Math.min(cols, Math.max(MIN_COLS, input.sidebarCols)), h: rows - 1 }
      : undefined;
  return {
    cols,
    rows,
    tooSmall: false,
    narrow,
    ...(sidebar ? { sidebar } : overlay ? { sidebar: overlay, sidebarOverlay: true } : {}),
    tabBar,
    paneArea,
    panes,
    dividers,
  };
}

interface ChromeRule {
  borders: PaneBorders;
  gaps: boolean;
}

const NO_NEIGHBORS: PaneSides = { top: false, right: false, bottom: false, left: false };

/**
 * 罫線を描く辺（web の `resolvePaneChrome` をセルに読み替えた）：枠を描くのは always か、分割しているときの auto。枠を描くなら外側の辺は全部、
 * 隣のある辺は隙間があれば両方、無ければ左右の隣は 1 本を分け合う（右の pane の左の罫線だけ。上下の隣は名前の行が要るので両方残す）。
 * 枠を描かないとき（off・1 つだけの auto）は、隣との間に区切りの 1 本だけ（左・上の pane の右・下の辺。境界のドラッグに使う）。
 */
function sidesOf(rule: ChromeRule, multi: boolean, n: PaneSides): PaneSides {
  const framed = rule.borders === "always" || (rule.borders === "auto" && multi);
  if (!framed) return { top: false, left: false, right: n.right, bottom: n.bottom };
  return { top: true, bottom: true, left: true, right: !(n.right && !rule.gaps) };
}

function box(paneId: string, frame: Rect, sides: PaneSides = ALL_SIDES): PaneBox {
  const t = sides.top ? 1 : 0;
  const l = sides.left ? 1 : 0;
  const content: Rect = {
    x: frame.x + l,
    y: frame.y + t,
    w: Math.max(0, frame.w - l - (sides.right ? 1 : 0)),
    h: Math.max(0, frame.h - t - (sides.bottom ? 1 : 0)),
  };
  return { paneId, frame, content, sides };
}

/** 比率で分ける（両側に最低 `MIN_SIDE` を残す。残せない狭さなら半分）。 */
export function splitSize(total: number, ratio: number): number {
  const min = Math.min(MIN_SIDE, Math.floor(total / 2));
  const r = Number.isFinite(ratio) ? ratio : 0.5;
  return Math.max(min, Math.min(total - min, Math.round(total * r)));
}

function place(
  node: LayoutNode,
  area: Rect,
  out: PaneBox[],
  dividers: Divider[],
  rule: ChromeRule = { borders: "always", gaps: true },
  multi = true,
  n: PaneSides = NO_NEIGHBORS,
): void {
  if (node.type === "pane") {
    out.push(box(node.paneId, area, sidesOf(rule, multi, n)));
    return;
  }
  if (node.dir === "right") {
    const aw = splitSize(area.w, node.ratio);
    place(node.a, { ...area, w: aw }, out, dividers, rule, multi, { ...n, right: true });
    place(node.b, { ...area, x: area.x + aw, w: area.w - aw }, out, dividers, rule, multi, {
      ...n,
      left: true,
    });
    dividers.push({ splitId: node.id, dir: "right", x: area.x + aw, y: area.y, len: area.h, area });
  } else {
    const ah = splitSize(area.h, node.ratio);
    place(node.a, { ...area, h: ah }, out, dividers, rule, multi, { ...n, bottom: true });
    place(node.b, { ...area, y: area.y + ah, h: area.h - ah }, out, dividers, rule, multi, {
      ...n,
      top: true,
    });
    dividers.push({ splitId: node.id, dir: "down", x: area.x, y: area.y + ah, len: area.w, area });
  }
}

function firstPane(node: LayoutNode): string {
  return node.type === "pane" ? node.paneId : firstPane(node.a);
}

function containsPane(node: LayoutNode, paneId: string): boolean {
  return node.type === "pane"
    ? node.paneId === paneId
    : containsPane(node.a, paneId) || containsPane(node.b, paneId);
}
