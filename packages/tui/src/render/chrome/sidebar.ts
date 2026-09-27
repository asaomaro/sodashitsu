import type { Pane, Workspace } from "@sodashitsu/protocol";
import {
  depthFirstPaneIds,
  groupedWorkspaceRows,
  orderedAgentPaneIds,
  paneNameOf,
  stateGlyph,
  visibleGroupMembers,
} from "@sodashitsu/client-core";
import { ATTR } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { truncate } from "../width.js";
import { stateColor, type ChromeContext } from "./context.js";

/** サイドバーの行が何を指すか（04 のクリック・navigate が使う）。 */
export type SidebarTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "group"; groupId: string }
  | { kind: "autoGroup"; repoKey: string }
  | { kind: "agent"; paneId: string };
export type SidebarHit = SidebarTarget & { y: number };

interface Line {
  indent: number;
  glyph: string;
  glyphState: Parameters<typeof stateColor>[1];
  text: string;
  selected: boolean;
  navigated?: boolean;
  hit?: SidebarTarget;
}

/**
 * サイドバー（20260927-cli-mode の tasks T4 の最小限の chrome）：上に spaces（workspace の行。client-core の `groupedWorkspaceRows` の並び・
 * 状態の集約の記号）、下に agents（エージェントの居る pane。`orderedAgentPaneIds` の並び）。右端の 1 桁は境界の罫線。
 * 行の並び（`sidebarRows` の独自の行の形）は 05 で client-core の `resolveRows` に寄せる。
 */
export function paintSidebar(grid: Grid, rect: Rect, ctx: ChromeContext): SidebarHit[] {
  const { theme, model, prefs } = ctx;
  const bg = theme.ui("--soda-menu-bg");
  const fg = theme.ui("--soda-menu-fg");
  const activeBg = theme.ui("--soda-menu-active-bg");
  const border = theme.ui("--soda-menu-border");
  const inner = rect.w - 1;
  grid.fill({ x: rect.x, y: rect.y, w: inner, h: rect.h }, fg, bg);
  for (let y = rect.y; y < rect.y + rect.h; y++) grid.set(rect.x + inner, y, "│", 1, border, bg);

  const lines: (Line | { header: string })[] = [{ header: "Spaces" }];
  const workspaces = [...model.workspaces.values()];
  const rows = groupedWorkspaceRows(
    workspaces,
    [...model.groups.values()],
    prefs.workspaceSort,
    prefs.collapsedAutoGroups,
  );
  const wsLine = (w: Workspace, indent: number): Line => {
    const state = model.workspaceState(w.id);
    return {
      indent,
      glyph: stateGlyph(state),
      glyphState: state,
      text: w.label,
      selected: w.id === model.workspaceId,
      navigated: w.id === ctx.navigateSelection,
      hit: { kind: "workspace", workspaceId: w.id },
    };
  };
  for (const row of rows) {
    if (row.kind === "standalone") lines.push(wsLine(row.workspace, 0));
    else if (row.kind === "manualGroup") {
      lines.push({
        indent: 0,
        glyph: row.group.collapsed ? "▸" : "▾",
        glyphState: null,
        text: row.group.label,
        selected: false,
        hit: { kind: "group", groupId: row.group.id },
      });
      for (const w of visibleGroupMembers(row.members, row.group.collapsed, model.workspaceId))
        lines.push(wsLine(w, 2));
    } else {
      lines.push({ ...wsLine(row.parent, 0) });
      for (const w of visibleGroupMembers(row.children, row.collapsed, model.workspaceId))
        lines.push(wsLine(w, 2));
    }
  }

  const agentPanes: Pane[] = [];
  for (const w of workspaces) {
    for (const t of model.tabsOf(w.id)) {
      for (const id of depthFirstPaneIds(t.layout)) {
        const p = model.panes.get(id);
        if (p?.agent) agentPanes.push(p);
      }
    }
  }
  if (agentPanes.length > 0) {
    lines.push({ header: "" });
    lines.push({ header: "Agents" });
    const order = orderedAgentPaneIds(
      agentPanes.map((p) => ({
        paneId: p.id,
        state: model.displayStateOf(p),
        since: p.agent?.since ?? 0,
      })),
      prefs.agentSort,
    );
    for (const id of order) {
      const p = model.panes.get(id)!;
      const state = model.displayStateOf(p);
      lines.push({
        indent: 0,
        glyph: stateGlyph(state),
        glyphState: state,
        text: paneNameOf(p),
        selected: id === model.focusedPaneId,
        hit: { kind: "agent", paneId: id },
      });
    }
  }

  const hits: SidebarHit[] = [];
  for (let i = 0; i < lines.length && i < rect.h; i++) {
    const line = lines[i]!;
    const y = rect.y + i;
    if ("header" in line) {
      grid.text(rect.x + 1, y, truncate(line.header, inner - 1), fg, bg, ATTR.dim);
      continue;
    }
    // navigate モードで選んでいる行はアクセントの色で（今の workspace の強調より優先）。
    const rowBg = line.navigated ? theme.ui("--soda-accent") : line.selected ? activeBg : bg;
    const rowFg = line.navigated ? theme.ui("--soda-accent-fg") : fg;
    if (line.selected || line.navigated) grid.fill({ x: rect.x, y, w: inner, h: 1 }, rowFg, rowBg);
    let x = rect.x + 1 + line.indent;
    const room = rect.x + inner - x;
    if (room <= 0) continue;
    // 記号の欄は 2 桁（記号＋空白）。記号が無い行も桁をそろえる。
    if (line.glyph !== "")
      grid.text(x, y, line.glyph, stateColor(theme, line.glyphState), rowBg, 0, room);
    x += 2;
    grid.text(
      x,
      y,
      truncate(line.text, rect.x + inner - x),
      rowFg,
      rowBg,
      line.selected ? ATTR.bold : 0,
    );
    if (line.hit) hits.push({ y, ...line.hit });
  }
  return hits;
}
