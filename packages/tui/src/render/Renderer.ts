import { paneNameOf } from "@sodashitsu/client-core";
import type { LayoutResult } from "../layout/computeLayout.js";
import type { PaneRegistry } from "../term/PaneRegistry.js";
import type { ChromeContext } from "./chrome/context.js";
import { paintFrame } from "./chrome/frame.js";
import { paintSidebar, type SidebarHit } from "./chrome/sidebar.js";
import { paintTabBar, type TabHit } from "./chrome/tabBar.js";
import type { ColorMode } from "./color.js";
import { isCropped, paintPane } from "./paintPane.js";
import { Grid, Screen, type CursorState } from "./Screen.js";
import { stringWidth } from "./width.js";

export interface RenderResult {
  output: string;
  sidebarHits: SidebarHit[];
  tabHits: TabHit[];
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

  /** 次は全部描き直す（大きさの変化・外側の端末の再表示）。 */
  invalidate(): void {
    this.screen.invalidate();
    this.lastGrid = null;
    this.lastPaint.clear();
  }

  render(layout: LayoutResult, ctx: ChromeContext, panes: PaneRegistry): RenderResult {
    const { theme, model } = ctx;
    const grid = new Grid(layout.cols, layout.rows, theme.ui("--soda-bg"));
    if (layout.tooSmall) {
      centerText(grid, "端末が小さすぎます", theme.ui("--soda-fg"), theme.ui("--soda-bg"));
      this.lastGrid = null;
      this.lastPaint.clear();
      return { output: this.screen.frame(grid, null), sidebarHits: [], tabHits: [] };
    }
    const sidebarHits = layout.sidebar ? paintSidebar(grid, layout.sidebar, ctx) : [];
    const tabHits = paintTabBar(grid, layout.tabBar, ctx);

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
    this.lastGrid = grid;
    this.lastPaint = painted;
    return { output: this.screen.frame(grid, cursor), sidebarHits, tabHits };
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
