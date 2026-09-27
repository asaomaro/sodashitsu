import { ATTR } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { stringWidth, truncate } from "../width.js";
import { glyphFor, stateColor, type ChromeContext } from "./context.js";
import { MODE_BADGES, statusText } from "./tabBar.js";

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
  const badge = MODE_BADGES[ctx.mode];
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
  // 接続の状態・警告・知らせ・session 名（tab バーと同じ `statusText`）。接続が開いていない・警告があるときは名前より先に出す。
  const status = statusText(ctx);
  const urgent = ctx.connection !== "open" || !!ctx.alert;
  if (urgent && status !== "") {
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
  const tab = index >= 0 ? tabs[index]! : null;
  // 今の tab の位置と名前（見つからなければ数えない）。右寄せ、名前は残りに収まる分だけ。
  const tabStatus = tab
    ? tabs.length > 1
      ? `tab ${index + 1}/${tabs.length} ${tab.label}`
      : tab.label
    : "";
  const state = model.workspaceState(ws.id);
  const glyph = glyphFor(state, ctx.prefs.statusSymbols);
  if (glyph) grid.text(x + 1, rect.y, glyph, stateColor(theme, state), bg);
  x += 3;
  // 知らせ・session 名は右の余りに（名前と tab を優先）。
  const avail = switchX - x - 1;
  const nameW = Math.min(stringWidth(ws.label), Math.max(4, Math.floor(avail / 2)));
  if (nameW > 0) grid.text(x, rect.y, truncate(ws.label, nameW), fg, bg, ATTR.bold);
  let rx = x + nameW + 2;
  if (tabStatus && rx < switchX - 1) {
    rx += grid.text(
      rx,
      rect.y,
      truncate(tabStatus, switchX - 1 - rx),
      theme.ui("--soda-state-idle"),
      bg,
      0,
      switchX - 1 - rx,
    );
    rx += 2;
  }
  if (status !== "" && rx < switchX - 2)
    grid.text(rx, rect.y, truncate(status, switchX - 1 - rx), fg, bg, ATTR.dim, switchX - 1 - rx);
  return { switchButton: { x: switchX, w: switchW } };
}
