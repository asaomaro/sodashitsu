import { paneNameOf } from "@sodashitsu/client-core";
import type { LayoutResult } from "../layout/computeLayout.js";
import type { PaneRegistry } from "../term/PaneRegistry.js";
import type { ChromeContext } from "./chrome/context.js";
import { paintFrame } from "./chrome/frame.js";
import { paintSidebar, type SidebarHit } from "./chrome/sidebar.js";
import { paintTabBar, type TabBarHits, type TabHit } from "./chrome/tabBar.js";
import type { ColorMode } from "./color.js";
import { isCropped, paintPane } from "./paintPane.js";
import { Grid, Screen, type CursorState } from "./Screen.js";
import { stringWidth, truncate } from "./width.js";

/** chrome と pane の後に重ねて描くもの（オーバーレイ・知らせ・pane の上の印）。 */
export interface RenderExtras {
  /** pane の上の印（copy モードの選択・ドラッグの落とし先）。本物のカーソルを返せば焦点の pane のカーソルの代わりに置く。 */
  decorate?(grid: Grid): CursorState | null | undefined;
  /** 右下の知らせ。 */
  toasts?: readonly string[];
  /** オーバーレイ（ダイアログ・メニュー）。描いたら本物のカーソルの位置（入力欄が無ければ隠す）を返す。 */
  overlay?(grid: Grid): CursorState | null;
}

export interface RenderResult {
  output: string;
  sidebarHits: SidebarHit[];
  tabHits: TabHit[];
  newTabButton: TabBarHits["newTab"];
}

/**
 * 1 フレームを組み立てて差分の ANSI にする（20260927-cli-mode の architecture「描画」の 3.）：割り付け → 格子を作り直し（chrome と、
 * 中身が変わった pane はバッファから、変わっていない pane は前の格子の該当部分を写す）→ `Screen.frame`。
 */
export class Renderer {
  private readonly screen: Screen;
  private lastGrid: Grid | null = null;
  /** pane → 前のフレームで中身を描いた矩形とテーマ（同じなら写してよい）。 */
  private lastPaint = new Map<string, string>();

  constructor(mode: ColorMode, repeatImeAnchor: boolean) {
    this.screen = new Screen(mode, repeatImeAnchor);
  }

  setColorMode(mode: ColorMode): void {
    if (mode === this.screen.colorMode) return; // 変わらなければ描き直さない
    this.screen.setColorMode(mode);
    this.lastGrid = null;
    this.lastPaint.clear();
  }

  /** 次は全部描き直す（大きさの変化・外側の端末の再表示）。 */
  invalidate(): void {
    this.screen.invalidate();
    this.lastGrid = null;
    this.lastPaint.clear();
  }

  render(
    layout: LayoutResult,
    ctx: ChromeContext,
    panes: PaneRegistry,
    extras: RenderExtras = {},
  ): RenderResult {
    const { theme, model } = ctx;
    const grid = new Grid(layout.cols, layout.rows, theme.ui("--soda-bg"));
    if (layout.tooSmall) {
      centerText(grid, "端末が小さすぎます", theme.ui("--soda-fg"), theme.ui("--soda-bg"));
      this.lastGrid = null;
      this.lastPaint.clear();
      return {
        output: this.screen.frame(grid, null),
        sidebarHits: [],
        tabHits: [],
        newTabButton: null,
      };
    }
    const sidebarHits = layout.sidebar ? paintSidebar(grid, layout.sidebar, ctx) : [];
    const tabBar = paintTabBar(grid, layout.tabBar, ctx);
    const tabHits = tabBar.tabs;

    const prev =
      this.lastGrid && this.lastGrid.w === grid.w && this.lastGrid.h === grid.h
        ? this.lastGrid
        : null;
    const painted = new Map<string, string>();
    let cursor: CursorState | null = null;
    for (const box of layout.panes) {
      const pane = model.panes.get(box.paneId);
      const term = panes.get(box.paneId);
      const focused = box.paneId === model.focusedPaneId;
      paintFrame(
        grid,
        box.frame,
        {
          name: pane ? paneNameOf(pane) : box.paneId,
          state: pane ? model.displayStateOf(pane) : null,
          focused,
          cropped: term ? isCropped(term, box.content) : false,
        },
        theme,
      );
      if (!term) {
        grid.fill(box.content, theme.paneFg, theme.paneBg);
        continue;
      }
      const key = `${box.content.x},${box.content.y},${box.content.w},${box.content.h},${theme.name}`;
      if (prev && !term.dirty && !focused && this.lastPaint.get(box.paneId) === key) {
        grid.copyFrom(prev, box.content);
      } else {
        const c = paintPane(grid, term, box.content, theme);
        term.dirty = false;
        if (focused) cursor = c;
      }
      painted.set(box.paneId, key);
    }
    if (layout.panes.length === 0) {
      const msg = ctx.connection === "open" ? "workspace がありません" : "接続中…";
      centerText(grid, msg, theme.ui("--soda-fg"), theme.ui("--soda-bg"), layout.paneArea);
    }
    // 重ねて描いたものがあれば、次のフレームは pane の中身を前の格子から写さない（重ねた絵まで写してしまう）。
    let covered = false;
    const decoCursor = extras.decorate?.(grid);
    if (decoCursor !== undefined) {
      covered = true;
      if (decoCursor !== null) cursor = decoCursor;
    }
    if (extras.toasts && extras.toasts.length > 0) {
      paintToasts(grid, extras.toasts, ctx);
      covered = true;
    }
    const overlayCursor = extras.overlay?.(grid) ?? null;
    if (overlayCursor) {
      cursor = overlayCursor;
      covered = true;
    }
    if (covered) painted.clear();
    this.lastGrid = grid;
    this.lastPaint = painted;
    return {
      output: this.screen.frame(grid, cursor),
      sidebarHits,
      tabHits,
      newTabButton: tabBar.newTab,
    };
  }
}

function centerText(
  grid: Grid,
  text: string,
  fg: number,
  bg: number,
  area = { x: 0, y: 0, w: grid.w, h: grid.h },
): void {
  const w = stringWidth(text);
  const x = area.x + Math.max(0, Math.floor((area.w - w) / 2));
  const y = area.y + Math.floor(area.h / 2);
  grid.text(x, y, text, fg, bg, 0, area.x + area.w - x);
}

/** 右下に知らせを積む（新しいものが下）。 */
function paintToasts(grid: Grid, toasts: readonly string[], ctx: ChromeContext): void {
  const bg = ctx.theme.ui("--soda-menu-active-bg");
  const fg = ctx.theme.ui("--soda-menu-fg");
  const maxW = Math.max(10, Math.min(60, grid.w - 4));
  let y = grid.h - 2;
  for (let i = toasts.length - 1; i >= 0 && y >= 1; i--, y--) {
    const text = ` ${truncate(toasts[i]!, maxW - 2)} `;
    const w = stringWidth(text);
    grid.text(grid.w - w - 1, y, text, fg, bg);
  }
}
