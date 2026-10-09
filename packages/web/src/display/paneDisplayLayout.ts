import type { DisplayDock, DisplayEdge } from "@sodashitsu/protocol";
import { BANDS_MORE_ROW_PX, DEFAULT_CELL_WIDTH_PX, PANEL_MIN_PX, TERMINAL_MIN_COLS, visibleBands } from "./displayLayout.js";
import { FLOAT_AREA_INSET_PX, FLOAT_CASCADE_PX, FLOAT_INSET_PX, FLOAT_MIN_H_PX, FLOAT_MIN_W_PX, clampFloatRect, defaultFloatRect, floatAreaOf, type Rect } from "./floatGeometry.js";

/**
 * pane の表示の面（パネル・帯・トレイ）の割り付け（20261008-display-layout の design「割り付け」）。**純粋な関数 1 つ**で、部品はこの結果を描くだけ。
 * 入出力の形は最後の形（上下左右の側・浮いた窓も持つ）。PR-A の計算は、手順 1（帯）・2（トレイ。やり直しを含む）・4（横。右だけ）・5（端末の領域）。
 * 手順 3（縦）は PR-B、手順 6（浮いた窓）は PR-C で足した。
 */
export { TERMINAL_MIN_COLS, PANEL_MIN_PX as DOCK_W_MIN_PX };
export { FLOAT_AREA_INSET_PX, FLOAT_CASCADE_PX, FLOAT_INSET_PX, FLOAT_MIN_H_PX, FLOAT_MIN_W_PX };
export type { Rect };
export const TERMINAL_MIN_ROWS = 10;
export const DOCK_H_MIN_PX = 96;
/**
 * 上・下のパネルを出せる、pane の幅の下限（px）。見出しの固定の部品（印・［操作する］／［操作を終える］・［⋮］・［▸］・［×］）が、最小の高さ（96px）の箱に 2 行で収まる幅。
 * これより細い pane では、上・下のパネルは自動でたたむ（トレイの押せないボタン。記憶は変えない）。左右は、最小の幅 160px で 2 行に折れて収まる。
 */
export const PANEL_TB_MIN_W_PX = 200;
/** セルの高さが取れないときの値（px）。 */
const DEFAULT_CELL_HEIGHT_PX = 18;
/** 帯が無いときの、トレイだけの行の高さ。 */
export const TRAY_ROW_PX = 24;
/**
 * 帯の行の固定の部品（印・［⋮］・［×］。スクリプトが動く帯は、印「スクリプト」・［操作する］〔操作中は［操作を終える］〕も）が全部入る、pane の幅の下限（px）。
 * 実測の合計は、スクリプトの帯 約 265〔操作中 約 285〕・それ以外 約 105。余裕をみた値。これより狭い pane では、帯を自動でたたむ（記憶は変えない。トレイに押せないボタンで残る）。
 */
export const BAND_MIN_W_PX = 140;
export const BAND_SCRIPT_MIN_W_PX = 320;

export type Side = "right" | "left" | "top" | "bottom";
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
  /** 窓の動ける領域の大きさ（端末の領域を各辺 4px 縮めた箱）。最小の窓が入らなければ null（窓は全部が自動でたたまれ、開く操作を受けない）。 */
  floatArea: { w: number; h: number } | null;
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
  floats: { id: string; rect: Rect }[];
  floatArea: { w: number; h: number } | null;
  hasUserButtons: boolean;
}

interface SidePlan {
  /** その側に置いたたたんでいないパネル（出た順）。無ければ null。 */
  group: { ids: string[]; activeId: string; want: number } | null;
}

/** 1 つの軸（縦なら上・下、横なら左・右）の 2 つの側を、範囲に丸め、合計が `avail` を超えるなら縮め、入らなければ「先」の側を自動でたたむ。 */
function fitAxis(
  first: SidePlan["group"],
  second: SidePlan["group"],
  total: number,
  avail: number,
  min: number,
): { size: { first: number; second: number }; max: number; autoFirst: boolean; autoSecond: boolean } {
  const max = Math.floor(Math.min(Math.floor(total / 2), avail));
  const out = { size: { first: 0, second: 0 }, max, autoFirst: false, autoSecond: false };
  if (!(max >= min)) {
    out.autoFirst = first !== null;
    out.autoSecond = second !== null;
    return out;
  }
  const round = (g: NonNullable<SidePlan["group"]>): number => Math.min(max, Math.max(min, Math.round(g.want)));
  let a = first ? round(first) : 0;
  let b = second ? round(second) : 0;
  if (first && second && a + b > avail) {
    // 大きいほう（同じなら先の側）から、最小までのあいだで縮める。まだ超えるなら、もう一方も。
    const shrink = (bigFirst: boolean): void => {
      if (bigFirst) a = Math.max(min, avail - b);
      else b = Math.max(min, avail - a);
    };
    const firstIsBig = a >= b;
    shrink(firstIsBig);
    if (a + b > avail) shrink(!firstIsBig);
    if (a + b > avail) {
      // それでも入らない: 先の側を自動でたたみ、後ろの側だけで計算し直す。
      out.autoFirst = true;
      a = 0;
      b = round(second);
    }
  }
  out.size = { first: a, second: b };
  return out;
}

/**
 * 手順 1〜5 を 1 回計算する。専用のトレイの行（24px）の高さは、利用者がたたんだ面のボタンがあるとき、または `extraRow`（自動でたたんだ面だけで行が出るときのやり直し）のときに引く。
 */
function pass(input: LayoutInput, extraRow: boolean): Pass {
  const { paneW, paneH } = input;
  const cellW = input.cellW > 0 ? input.cellW : DEFAULT_CELL_WIDTH_PX;
  const cellH = input.cellH > 0 ? input.cellH : DEFAULT_CELL_HEIGHT_PX;

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
  const hostBandId = (trayEdge === "top" ? top : bottom)[0]?.id ?? null;
  // 専用のトレイの行を引くか（ボタンがある〔利用者がたたんだ面がある〕か、やり直し）。
  const hasUserButtons = input.panels.some((p) => p.collapsed || p.dock === "float") || input.bands.some((b) => b.collapsed);
  const trayRow = hostBandId === null && (hasUserButtons || extraRow) ? TRAY_ROW_PX : 0;
  const rowOnEdge = (edge: DisplayEdge): number => {
    let h = 0;
    if (edge === trayEdge) h += trayRow + (more.length > 0 ? BANDS_MORE_ROW_PX : 0);
    for (const b of edge === "top" ? top : bottom) h += b.size;
    return h;
  };
  const topH = rowOnEdge("top");
  const bottomH = rowOnEdge("bottom");

  // 3・4. パネルの 4 つの側。置き場所が `float` の面はここでは場所を取らない（手順 6 で窓にする）。
  const planOf = (side: Side): SidePlan["group"] => {
    const ps = input.panels.filter((p) => p.dock === side && !p.collapsed).sort((a, b) => a.seq - b.seq);
    if (ps.length === 0) return null;
    const activeId = ps.some((p) => p.id === input.active[side]) ? (input.active[side] as string) : ps[0]!.id;
    const active = ps.find((p) => p.id === activeId)!;
    return { ids: ps.map((p) => p.id), activeId, want: input.sideSizes[side] ?? active.size };
  };
  const plans: Record<Side, SidePlan["group"]> = { top: planOf("top"), bottom: planOf("bottom"), left: planOf("left"), right: planOf("right") };
  const auto: string[] = autoBands.map((b) => b.id);
  // pane が細くて、上・下のパネルの見出しの固定の部品が最小の高さに収まらないときは、自動でたたむ。
  if (paneW < PANEL_TB_MIN_W_PX) {
    for (const side of ["top", "bottom"] as const) {
      const g = plans[side];
      if (g) auto.push(...g.ids);
      plans[side] = null;
    }
  }
  const docks = EMPTY_DOCKS();
  const place = (side: Side, plan: NonNullable<SidePlan["group"]>, size: number, min: number, max: number): void => {
    docks[side] = { ids: plan.ids, activeId: plan.activeId, size, min, max };
  };
  // 縦（上・下）: 本体の高さから、帯の行を引いた残り。端末は 10 行を残す。
  const H = paneH - topH - bottomH;
  const v = fitAxis(plans.top, plans.bottom, H, H - TERMINAL_MIN_ROWS * cellH, DOCK_H_MIN_PX);
  if (plans.top) {
    if (v.autoFirst) auto.push(...plans.top.ids);
    else place("top", plans.top, v.size.first, DOCK_H_MIN_PX, v.max);
  }
  if (plans.bottom) {
    if (v.autoSecond) auto.push(...plans.bottom.ids);
    else place("bottom", plans.bottom, v.size.second, DOCK_H_MIN_PX, v.max);
  }
  // 横（左・右）: 本体の幅から、端末は 40 列を残す。
  const h = fitAxis(plans.left, plans.right, paneW, paneW - TERMINAL_MIN_COLS * cellW, PANEL_MIN_PX);
  if (plans.left) {
    if (h.autoFirst) auto.push(...plans.left.ids);
    else place("left", plans.left, h.size.first, PANEL_MIN_PX, h.max);
  }
  if (plans.right) {
    if (h.autoSecond) auto.push(...plans.right.ids);
    else place("right", plans.right, h.size.second, PANEL_MIN_PX, h.max);
  }

  // 5. 端末の領域。
  const leftW = docks.left?.size ?? 0;
  const rightW = docks.right?.size ?? 0;
  const topP = docks.top?.size ?? 0;
  const bottomP = docks.bottom?.size ?? 0;
  const terminal: Rect = { x: leftW, y: topH + topP, w: Math.max(0, paneW - leftW - rightW), h: Math.max(0, H - topP - bottomP) };

  // 6. 浮いた窓: 窓の動ける領域は、端末の領域を各辺 4px 縮めた箱。最小の窓が入らなければ、窓は全部（閉じているものも）自動でたたむ＝開く操作を受けない。
  //    入るなら、たたんでいない窓ごとに、記憶の矩形（無ければ初めの矩形）を領域の中へ丸める。
  const floatArea = floatAreaOf(terminal);
  const floatPanels = input.panels.filter((p) => p.dock === "float");
  const floats: { id: string; rect: Rect }[] = [];
  if (floatArea === null) auto.push(...floatPanels.map((p) => p.id));
  else {
    for (const p of floatPanels) {
      if (p.collapsed) continue;
      floats.push({ id: p.id, rect: clampFloatRect(input.floatRects[p.id] ?? defaultFloatRect(0, p.size, floatArea), floatArea) });
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
  const trayOwn = hostBandId === null && buttons.length > 0;

  return {
    bands: { top: top.map((b) => b.id), bottom: bottom.map((b) => b.id), more },
    trayOwn,
    trayEdge,
    hostBandId,
    buttons,
    auto,
    docks,
    terminal,
    floats,
    floatArea,
    hasUserButtons: tagged.some((t) => !t.b.disabled),
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
    floats: p.floats,
    floatArea: p.floatArea,
    auto: p.auto,
    terminal: p.terminal,
  };
}
