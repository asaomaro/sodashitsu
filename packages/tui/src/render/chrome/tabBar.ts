import { ATTR } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { stringWidth, truncate } from "../width.js";
import type { ChromeContext } from "./context.js";

export const MODE_BADGES: Partial<Record<ChromeContext["mode"], string>> = {
  prefix: "PREFIX",
  navigate: "NAVIGATE",
  copy: "COPY",
  resize: "RESIZE",
};

/** tab バーの tab の位置（04 のクリック・ドラッグが使う）。 */
export interface TabHit {
  tabId: string;
  x: number;
  w: number;
}

/**
 * tab バーの当たり：tab と「＋」（新しい tab。herdr の M14）、あふれたときの「‹」「›」（herdr の `tab_scroll_left/right`。H22b）、
 * サイドバーを畳んでいるときの「»」（開く。herdr の `sidebar_toggle`）。
 */
export interface TabBarHits {
  tabs: TabHit[];
  newTab: { x: number; w: number } | null;
  scrollLeft?: { x: number } | null;
  scrollRight?: { x: number } | null;
  expandSidebar?: { x: number } | null;
}

/** tab バーのあふれたときの表示の位置（先頭に出す tab の番号）。`reveal` なら今の tab が見えるまで動かす。 */
export interface TabScroll {
  first: number;
  reveal: boolean;
}

/** tab バー・1 列表示の上辺の右端に出すもの：短い警告 → 接続の状態 → 知らせ → session 名（無ければ空）。 */
export function statusText(ctx: ChromeContext): string {
  if (ctx.alert) return ctx.alert;
  switch (ctx.connection) {
    case "reconnecting":
      return "再接続中…";
    case "connecting":
      return "接続中…";
    case "rejected":
      return "接続できません";
    default:
      return ctx.notice ?? (ctx.session ? `session: ${ctx.session}` : "");
  }
}

/**
 * tab バー（1 行）：左端に prefix 待ちの `PREFIX`（AC-I1）、今の workspace の tab（表示中を強調）、右端に接続の状態・知らせ・session 名。
 */
export function paintTabBar(grid: Grid, rect: Rect, ctx: ChromeContext): TabBarHits {
  const { theme, model } = ctx;
  const bg = theme.ui("--soda-bg");
  const fg = theme.ui("--soda-fg");
  const activeBg = theme.ui("--soda-menu-active-bg");
  grid.fill(rect, fg, bg);
  const end = rect.x + rect.w;
  let x = rect.x;
  // prefix 待ち・モードの印（AC-I1。web の PrefixIndicator と同じく左端に）。
  const badge = MODE_BADGES[ctx.mode];
  if (badge) {
    x += grid.text(
      x,
      rect.y,
      ` ${badge} `,
      theme.ui("--soda-accent-fg"),
      theme.ui("--soda-accent"),
      ATTR.bold,
      end - x,
    );
    x += 1;
  }

  // サイドバーを畳んでいれば左端に「»」（押すと開く）。
  let expandSidebar: TabBarHits["expandSidebar"] = null;
  if (ctx.prefs.sidebarCollapsed && x + 2 < end) {
    grid.set(x, rect.y, "»", 1, fg, activeBg);
    expandSidebar = { x };
    x += 2;
  }

  // 右端：短い警告 → 接続の状態 → 知らせ → session 名。
  const status = statusText(ctx);
  const statusColor = ctx.connection === "open" && !ctx.alert ? fg : theme.ui("--soda-warn-fg");
  let rightStart = end;
  if (status !== "") {
    const text = truncate(status, Math.max(0, Math.floor(rect.w / 2)));
    rightStart = end - stringWidth(text) - 1;
    grid.text(rightStart, rect.y, text, statusColor, bg, 0, end - rightStart);
  }

  const hits: TabHit[] = [];
  if (!model.workspaceId) return { tabs: hits, newTab: null, expandSidebar };
  const tabs = model.tabsOf(model.workspaceId);
  const labels = tabs.map((t, i) => ` ${i + 1}:${t.label} `);
  const widths = labels.map((l) => stringWidth(l));
  // あふれるなら「‹」「›」を出し、先頭の tab をずらす（今の tab が見えるように。herdr の tab_scroll。H22b）。
  const PLUS_W = 4; // 「 + 」と前の空き
  const total = widths.reduce((a, b) => a + b, 0);
  const overflow = tabs.length > 1 && total > rightStart - 1 - x - PLUS_W;
  const scroll = ctx.tabScroll ?? { first: 0, reveal: true };
  let first = 0;
  let scrollLeft: TabBarHits["scrollLeft"] = null;
  let scrollRight: TabBarHits["scrollRight"] = null;
  let limit = rightStart - 1;
  if (overflow) {
    const left = x;
    limit = rightStart - 1 - PLUS_W - 2;
    const avail = limit - (left + 2);
    first = Math.max(0, Math.min(scroll.first, tabs.length - 1));
    const active = tabs.findIndex((t) => t.id === model.tabId);
    const fits = (from: number, to: number): boolean =>
      widths.slice(from, to + 1).reduce((a, b) => a + b, 0) <= avail;
    if (scroll.reveal && active >= 0) {
      if (active < first) first = active;
      while (first < active && !fits(first, active)) first++;
    }
    if (first > 0) {
      grid.set(left, rect.y, "‹", 1, fg, activeBg);
      scrollLeft = { x: left };
    }
    x = left + 2;
  }
  scroll.first = first;
  scroll.reveal = false;
  let last = first - 1;
  for (let i = first; i < tabs.length && x < limit; i++) {
    const t = tabs[i]!;
    const active = t.id === model.tabId;
    const w = grid.text(
      x,
      rect.y,
      truncate(labels[i]!, limit - x),
      fg,
      active ? activeBg : bg,
      active ? ATTR.bold : 0,
      limit - x,
    );
    hits.push({ tabId: t.id, x, w });
    x += w;
    last = i;
  }
  if (overflow) {
    if (last < tabs.length - 1) {
      grid.set(limit + 1, rect.y, "›", 1, fg, activeBg);
      scrollRight = { x: limit + 1 };
    }
    x = limit + 2;
  }
  let newTab: TabBarHits["newTab"] = null;
  if (x + 3 < rightStart) {
    const w = grid.text(x + 1, rect.y, " + ", fg, activeBg, 0);
    newTab = { x: x + 1, w };
  }
  return { tabs: hits, newTab, scrollLeft, scrollRight, expandSidebar };
}
