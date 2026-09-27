import { ATTR } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { stringWidth, truncate } from "../width.js";
import type { ChromeContext } from "./context.js";

/** tab バーの tab の位置（04 のクリック・ドラッグが使う）。 */
export interface TabHit {
  tabId: string;
  x: number;
  w: number;
}

/**
 * tab バー（1 行）：左端に prefix 待ちの `PREFIX`（AC-I1）、今の workspace の tab（表示中を強調）、右端に接続の状態・知らせ・session 名。
 */
export function paintTabBar(grid: Grid, rect: Rect, ctx: ChromeContext): TabHit[] {
  const { theme, model } = ctx;
  const bg = theme.ui("--soda-bg");
  const fg = theme.ui("--soda-fg");
  const activeBg = theme.ui("--soda-menu-active-bg");
  grid.fill(rect, fg, bg);
  const end = rect.x + rect.w;
  let x = rect.x;
  if (ctx.mode === "prefix") {
    x += grid.text(
      x,
      rect.y,
      " PREFIX ",
      theme.ui("--soda-accent-fg"),
      theme.ui("--soda-accent"),
      ATTR.bold,
      end - x,
    );
    x += 1;
  }

  // 右端：短い警告 → 接続の状態 → 知らせ → session 名。
  const status = ctx.alert
    ? ctx.alert
    : ctx.connection === "reconnecting"
      ? "再接続中…"
      : ctx.connection === "connecting"
        ? "接続中…"
        : ctx.connection === "rejected"
          ? "接続できません"
          : (ctx.notice ?? (ctx.session ? `session: ${ctx.session}` : ""));
  const statusColor = ctx.connection === "open" && !ctx.alert ? fg : theme.ui("--soda-warn-fg");
  let rightStart = end;
  if (status !== "") {
    const text = truncate(status, Math.max(0, Math.floor(rect.w / 2)));
    rightStart = end - stringWidth(text) - 1;
    grid.text(rightStart, rect.y, text, statusColor, bg, 0, end - rightStart);
  }

  const hits: TabHit[] = [];
  if (!model.workspaceId) return hits;
  const tabs = model.tabsOf(model.workspaceId);
  tabs.forEach((t, i) => {
    if (x >= rightStart - 1) return;
    const label = ` ${i + 1}:${t.label} `;
    const active = t.id === model.tabId;
    const w = grid.text(
      x,
      rect.y,
      truncate(label, rightStart - 1 - x),
      fg,
      active ? activeBg : bg,
      active ? ATTR.bold : 0,
      rightStart - 1 - x,
    );
    hits.push({ tabId: t.id, x, w });
    x += w;
  });
  return hits;
}
