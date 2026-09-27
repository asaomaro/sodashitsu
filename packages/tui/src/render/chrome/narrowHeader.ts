import { stateGlyph } from "@sodashitsu/client-core";
import { ATTR } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { stringWidth, truncate } from "../width.js";
import { stateColor, type ChromeContext } from "./context.js";

/** 1 列表示の上辺の「switch」（押すと選び直しの一覧。herdr の mobile の `mobile_switch`）。 */
export interface NarrowHeaderHits {
  switchButton: { x: number; w: number } | null;
}

const SWITCH_LABEL = " switch ";

/**
 * 狭い幅（`tui.narrowThreshold` 未満）の上辺（herdr の `render_mobile_header` を写した形）：左に workspace の状態の記号と名前、その右に
 * 今の tab の位置（`tab 2/3`）、右端に「switch」（workspace・tab・pane の選び直し）。prefix・モードの印は左端に出す。
 */
export function paintNarrowHeader(grid: Grid, rect: Rect, ctx: ChromeContext): NarrowHeaderHits {
  const { theme, model } = ctx;
  const bg = theme.ui("--soda-menu-bg");
  const fg = theme.ui("--soda-fg");
  grid.fill(rect, fg, bg);
  const end = rect.x + rect.w;
  const switchW = stringWidth(SWITCH_LABEL);
  const switchX = end - switchW;
  grid.text(
    switchX,
    rect.y,
    SWITCH_LABEL,
    theme.ui("--soda-accent-fg"),
    theme.ui("--soda-accent"),
    ATTR.bold,
  );
  let x = rect.x;
  const badge =
    ctx.mode === "prefix"
      ? "PREFIX"
      : ctx.mode === "navigate"
        ? "NAVIGATE"
        : ctx.mode === "copy"
          ? "COPY"
          : ctx.mode === "resize"
            ? "RESIZE"
            : null;
  if (badge)
    x +=
      grid.text(
        x,
        rect.y,
        ` ${badge} `,
        theme.ui("--soda-accent-fg"),
        theme.ui("--soda-accent"),
        ATTR.bold,
        switchX - x,
      ) + 1;
  const status =
    ctx.alert ??
    (ctx.connection === "reconnecting"
      ? "再接続中…"
      : ctx.connection === "connecting"
        ? "接続中…"
        : null);
  if (status !== null) {
    grid.text(x, rect.y, truncate(status, switchX - x - 1), theme.ui("--soda-warn-fg"), bg, 0);
    return { switchButton: { x: switchX, w: switchW } };
  }
  const ws = model.workspaceId ? model.workspaces.get(model.workspaceId) : undefined;
  if (!ws) {
    grid.text(x + 1, rect.y, "no workspace", fg, bg, 0, switchX - x - 1);
    return { switchButton: { x: switchX, w: switchW } };
  }
  const tabs = model.tabsOf(ws.id);
  const index = tabs.findIndex((t) => t.id === model.tabId);
  const tabStatus = tabs.length > 1 ? `tab ${index + 1}/${tabs.length}` : "";
  const tabW = tabStatus ? stringWidth(tabStatus) + 1 : 0;
  const state = model.workspaceState(ws.id);
  const glyph = stateGlyph(state);
  if (glyph) grid.text(x + 1, rect.y, glyph, stateColor(theme, state), bg);
  x += 3;
  const nameRoom = switchX - x - tabW - 1;
  if (nameRoom > 0) grid.text(x, rect.y, truncate(ws.label, nameRoom), fg, bg, ATTR.bold);
  if (tabStatus) grid.text(switchX - tabW, rect.y, tabStatus, theme.ui("--soda-state-idle"), bg);
  return { switchButton: { x: switchX, w: switchW } };
}
