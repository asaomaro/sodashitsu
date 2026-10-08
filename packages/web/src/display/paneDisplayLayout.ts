import type { DisplayDock, DisplayEdge } from "@sodashitsu/protocol";
import { BANDS_MORE_ROW_PX, DEFAULT_CELL_WIDTH_PX, PANEL_MIN_PX, TERMINAL_MIN_COLS, panelWidth, visibleBands } from "./displayLayout.js";

/**
 * pane の表示の面（パネル・帯・トレイ）の割り付け（20261008-display-layout の design「割り付け」）。**純粋な関数 1 つ**で、部品はこの結果を描くだけ。
 * 入出力の形は最後の形（上下左右の側・浮いた窓も持つ）。PR-A の計算は、手順 1（帯）・2（トレイ。やり直しを含む）・4（横。右だけ）・5（端末の領域）。
 * 手順 3（縦）・6（浮いた窓）は、PR-B・PR-C で足す（それまでは該当の面が無いものとして空を返す）。
 */
export { TERMINAL_MIN_COLS, PANEL_MIN_PX as DOCK_W_MIN_PX };
export const TERMINAL_MIN_ROWS = 10;
export const DOCK_H_MIN_PX = 96;
/** 帯が無いときの、トレイだけの行の高さ。 */
export const TRAY_ROW_PX = 24;
/**
 * 帯の行の固定の部品（印・［⋮］・［×］。スクリプトが動く帯は、印「スクリプト」・［操作する］〔操作中は［操作を終える］〕も）が全部入る、pane の幅の下限（px）。
 * 実測の合計は、スクリプトの帯 約 265〔操作中 約 285〕・それ以外 約 105。余裕をみた値。これより狭い pane では、帯を自動でたたむ（記憶は変えない。トレイに押せないボタンで残る）。
 */
export const BAND_MIN_W_PX = 140;
export const BAND_SCRIPT_MIN_W_PX = 320;
export const FLOAT_MIN_W_PX = 240;
export const FLOAT_MIN_H_PX = 120;
export const FLOAT_AREA_INSET_PX = 4;
export const FLOAT_INSET_PX = 8;
export const FLOAT_CASCADE_PX = 24;

export type Side = "right" | "left" | "top" | "bottom";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LayoutInput {
  /** pane の本体の箱（px）と、端末のセル（取れなければ 9×18）。 */
  paneW: number;
  paneH: number;
  cellW: number;
  cellH: number;
  /** 出た順。`seq` は、その pane の面の全体（パネルと帯）での出た順の番号。 */
  bands: { id: string; seq: number; size: number; edge: DisplayEdge; collapsed: boolean; script?: boolean }[];
  panels: { id: string; seq: number; size: number; dock: DisplayDock; collapsed: boolean }[];
  /** 側ごとの、選んでいる面。 */
  active: Partial<Record<Side, string>>;
  /** 利用者が決めた大きさ。 */
  sideSizes: Partial<Record<Side, number>>;
  floatRects: Record<string, Rect>;
  /** 設定 `displayBandEdge`。 */
  trayEdgeDefault: DisplayEdge;
}
export interface TrayButton {
  id: string;
  kind: "panel" | "float" | "band";
  /** 開いている浮いた窓（ほかは false）。 */
  open: boolean;
  /** 自動でたたんだ面（押せない）。 */
  disabled: boolean;
}
export interface DockGroup {
  ids: string[];
  activeId: string;
  size: number;
  min: number;
  max: number;
}
export interface LayoutResult {
  /** 出す帯（側ごと・出た順）と、「ほか N 件」に回った帯。 */
  bands: { top: string[]; bottom: string[]; more: string[] };
  tray: { edge: DisplayEdge; row: "band" | "own" | "none"; hostBandId: string | null; buttons: TrayButton[] };
  docks: Record<Side, DockGroup | null>;
  /** 出す窓（出た順）。`rect` は窓の動ける領域（端末の領域の 4px 内側）の左上から。 */
  floats: { id: string; rect: Rect }[];
  /** 自動でたたんだ面（記憶は変えない）。 */
  auto: string[];
  /** 端末の領域（本体の箱の左上から）。 */
  terminal: Rect;
}

const EMPTY_DOCKS = (): Record<Side, DockGroup | null> => ({ right: null, left: null, top: null, bottom: null });

interface Pass {
  bands: LayoutResult["bands"];
  trayOwn: boolean;
  trayEdge: DisplayEdge;
  hostBandId: string | null;
  buttons: TrayButton[];
  auto: string[];
  docks: Record<Side, DockGroup | null>;
  terminal: Rect;
  hasUserButtons: boolean;
}

/**
 * 手順 1〜5 を 1 回計算する。専用のトレイの行（24px）の高さは、利用者がたたんだ面のボタンがあるとき、または `extraRow`（自動でたたんだ面だけで行が出るときのやり直し）のときに引く。
 */
function pass(input: LayoutInput, extraRow: boolean): Pass {
  const { paneW, paneH } = input;
  const cellW = input.cellW > 0 ? input.cellW : DEFAULT_CELL_WIDTH_PX;

  // 1. 帯: たたんでいない帯を出た順に足し、高さの合計が paneH / 3 以下に収まる分だけ出す（上と下を合わせて数える）。
  // pane が狭くて固定の部品が入らない帯は、自動でたたむ（出す帯の数え方・トレイの側にも入れない）。
  const tooNarrow = (b: LayoutInput["bands"][number]): boolean => paneW < (b.script ? BAND_SCRIPT_MIN_W_PX : BAND_MIN_W_PX);
  const open = input.bands.filter((b) => !b.collapsed && !tooNarrow(b));
  const autoBands = input.bands.filter((b) => !b.collapsed && tooNarrow(b));
  const split = visibleBands(open.map((b) => b.size), paneH);
  const shown = open.slice(0, split.shown);
  const more = open.slice(split.shown).map((b) => b.id);
  const top = shown.filter((b) => b.edge === "top");
  const bottom = shown.filter((b) => b.edge === "bottom");

  // 2. トレイの側: 出す帯の最初の 1 本の側。出す帯が無ければ設定。
  const first = shown[0];
  const trayEdge: DisplayEdge = first ? first.edge : input.trayEdgeDefault;

  // 4. 横（PR-A は右だけ）。置き場所が right のたたんでいないパネルを出た順に。
  const rightPanels = input.panels.filter((p) => p.dock === "right" && !p.collapsed).sort((a, b) => a.seq - b.seq);
  const auto: string[] = autoBands.map((b) => b.id);
  const docks = EMPTY_DOCKS();
  let rightW = 0;
  if (rightPanels.length > 0) {
    const activeId = rightPanels.some((p) => p.id === input.active.right) ? (input.active.right as string) : rightPanels[0]!.id;
    const active = rightPanels.find((p) => p.id === activeId)!;
    const sized = panelWidth(paneW, active.size, cellW, input.sideSizes.right);
    if (sized.autoCollapsed) {
      for (const p of rightPanels) auto.push(p.id);
    } else {
      const min = PANEL_MIN_PX;
      const max = Math.floor(Math.min(Math.floor(paneW / 2), paneW - TERMINAL_MIN_COLS * cellW));
      docks.right = { ids: rightPanels.map((p) => p.id), activeId, size: sized.width, min, max };
      rightW = sized.width;
    }
  }

  // 2（続き）. トレイのボタン: たたんだパネル・浮いた窓の面の全部（開いていても）・たたんだ帯・自動でたたんだ面を、種類をまたいで seq の順に。
  const autoSet = new Set(auto);
  const tagged: { seq: number; b: TrayButton }[] = [];
  for (const p of input.panels) {
    const isAuto = autoSet.has(p.id);
    if (p.dock === "float") tagged.push({ seq: p.seq, b: { id: p.id, kind: "float", open: !p.collapsed && !isAuto, disabled: isAuto } });
    else if (p.collapsed || isAuto) tagged.push({ seq: p.seq, b: { id: p.id, kind: "panel", open: false, disabled: isAuto } });
  }
  for (const b of input.bands) if (b.collapsed || autoSet.has(b.id)) tagged.push({ seq: b.seq, b: { id: b.id, kind: "band", open: false, disabled: autoSet.has(b.id) && !b.collapsed } });
  tagged.sort((a, b) => a.seq - b.seq);
  const buttons = tagged.map((t) => t.b);
  const hostBandId = (trayEdge === "top" ? top : bottom)[0]?.id ?? null;

  // 5. 端末の領域。
  const trayOwn = hostBandId === null && buttons.length > 0;
  const hasUserButtons = tagged.some((t) => !t.b.disabled);
  const rowOnEdge = (edge: DisplayEdge): number => {
    let h = 0;
    if (edge === trayEdge) h += (trayOwn && (hasUserButtons || extraRow) ? TRAY_ROW_PX : 0) + (more.length > 0 ? BANDS_MORE_ROW_PX : 0);
    for (const b of edge === "top" ? top : bottom) h += b.size;
    return h;
  };
  const topH = rowOnEdge("top");
  const bottomH = rowOnEdge("bottom");
  const terminal: Rect = { x: 0, y: topH, w: Math.max(0, paneW - rightW), h: Math.max(0, paneH - topH - bottomH) };

  return {
    bands: { top: top.map((b) => b.id), bottom: bottom.map((b) => b.id), more },
    trayOwn,
    trayEdge,
    hostBandId,
    buttons,
    auto,
    docks,
    terminal,
    hasUserButtons,
  };
}

export function resolvePaneDisplays(input: LayoutInput): LayoutResult {
  // 1 回目: 専用の行の高さは、利用者がたたんだ面のボタンがあるときだけ引く。自動でたたんだ面「だけ」で行が none → own に変わったら、行の高さを引いて 1 回だけやり直す
  // （やり直しで自動でたたむ面は増えるだけ。2 回目の結果を使う）。
  let p = pass(input, false);
  if (p.trayOwn && !p.hasUserButtons) p = pass(input, true);
  const row: LayoutResult["tray"]["row"] = p.hostBandId !== null ? "band" : p.buttons.length > 0 ? "own" : "none";
  return {
    bands: p.bands,
    tray: { edge: p.trayEdge, row, hostBandId: p.hostBandId, buttons: p.buttons },
    docks: p.docks,
    floats: [],
    auto: p.auto,
    terminal: p.terminal,
  };
}
