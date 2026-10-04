import type { DisplayState, MachineState, Pane, Workspace } from "@sodashitsu/protocol";
import { remoteKey, type MachineSection } from "../../model/MachinesModel.js";
import {
  aggregate,
  depthFirstPaneIds,
  displayStateFor,
  LOCAL_MACHINE_ID,
  effectiveLayout,
  loadSidebarRows,
  resolveAgentLines,
  resolveSpaceLines,
  type ResolvedLine,
  orderedAgentPaneIds,
  visibleGroupMembers,
  type ItemRow,
} from "@sodashitsu/client-core";
import { currentSidebarTree } from "../../model/sidebarTree.js";
import { ATTR, hexColor, type PackedColor } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { stringWidth, truncate } from "../width.js";
import { glyphFor, stateColor, type ChromeContext } from "./context.js";

/**
 * 行の種類の印（1 桁の記号。20261004-group-worktree-items・decisions D24）。状態の記号（`×◐✓○·`）・折りたたみの `▸▾` と同じく、
 * 絵文字の属性を持たない（`color` を受け継ぎ、unicode11 の幅 1。絵文字は幅が 2 になり色も受け継がない）。形で見分け、色に頼らない。
 * 位置は折りたたみの記号の次（グループ・worktree グループの先頭の行だけ。通常の行・子の行には付けない）。
 */
export const KIND_GLYPH = { group: "≡", worktreeGroup: "ψ" } as const;

/** サイドバーの行が何を指すか（04 のクリック・navigate が使う）。 */
export type SidebarTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "group"; groupId: string }
  /**
   * worktree グループの先頭の行（本体の workspace の行）。左の「▸/▾」（`x <= toggleX`）でその worktree グループを畳み・広げ、
   * ほかは `workspaceId` の workspace として働く（マシンの見出しの `machine` と同じ作り）。
   */
  | { kind: "autoGroup"; repoKey: string; workspaceId: string; toggleX: number }
  | { kind: "agent"; paneId: string }
  /** 「＋」（新しい workspace。herdr の M14）。`x` の桁だけが当たり。 */
  | { kind: "newWorkspace"; x: number }
  /** spaces と agents の区切りの行（ドラッグで spaces の区画の高さ。herdr の H19b）。 */
  | { kind: "sectionDivider" }
  /** 並び順の切り替え（web の `sidebar-sort-btn`・herdr の `agent_sort_toggle`。M14）。`x`〜`x+w` だけが当たり。 */
  | { kind: "sort"; section: "spaces" | "agents"; x: number; w: number }
  /** サイドバーを畳む「«」（web の開閉のボタン・herdr の `sidebar_toggle`。M14）。 */
  | { kind: "collapse"; x: number }
  /** マシンの見出し（M10。左の「▸/▾」で畳み・広げ、ほかは切り替え）。 */
  | { kind: "machine"; machineId: string; toggleX: number }
  /** 選んでいないマシンの workspace の行（押すとそのマシンのその workspace へ）。 */
  | { kind: "machineWorkspace"; machineId: string; workspaceId: string; tabId: string }
  /** 区画の中の何も無い行（ホイールでその区画を動かす）。 */
  | { kind: "area"; section: "spaces" | "agents" };
export type SidebarHit = SidebarTarget & { y: number; section?: "spaces" | "agents" };

/**
 * サイドバーの区画の表示の位置（端末版の状態。描くたびに収まる範囲へ寄せ直す）。`reveal` の workspace・pane が隠れていれば見える所まで動かす
 * （navigate の選択・今の workspace が変わったとき。区画の境界を上げても一覧を辿れる。04 ラウンド 2 の点検）。
 */
export interface SidebarScroll {
  spaces: number;
  agents: number;
  reveal: { workspaceId?: string | null; paneId?: string | null } | null;
}

const WORKSPACE_SORT_LABEL = { opened: "開いた順", name: "名前順" } as const;
const AGENT_SORT_LABEL = { grouped: "グループ順", priority: "優先度順" } as const;

/** 行の中の 1 つの部品（行の並びの 1 トークン）。`fg` が無ければ行の文字の色。 */
interface Seg {
  text: string;
  fg?: PackedColor;
  attrs?: number;
}

/** サイドバーの 1 項目（workspace・グループの見出し・エージェント）。`rows` は画面の行（2 行目からは字下げ）。 */
interface Line {
  indent: number;
  rows: Seg[][];
  /** 2 行目からの追加の字下げ（既定 2 ＝ 状態の印の幅。先頭の行は前に付く「▸ ψ 」の分だけ広げる）。 */
  subIndent?: number;
  selected: boolean;
  navigated?: boolean;
  hit?: SidebarTarget;
}

/** 画面の 1 行（項目の何行目か）。 */
interface VisualRow {
  line: Line;
  sub: number;
}

/** 行の並びの解決の結果（client-core の `resolveSpaceLines`・`resolveAgentLines`。web の Sidebar と同じ）を部品へ。 */
function segsOf(lines: ResolvedLine[], state: DisplayState | null, ctx: ChromeContext): Seg[][] {
  const { theme, prefs } = ctx;
  return lines.map((line) => {
    const out: Seg[] = [];
    for (const t of line) {
      const style = t.style;
      const attrs = (style.bold ? ATTR.bold : 0) | (style.dim ? ATTR.dim : 0);
      const fg = style.fg !== undefined ? hexColor(style.fg) : undefined;
      let seg: Seg | null;
      switch (t.kind) {
        case "state_icon": {
          const glyph = glyphFor(state, prefs.statusSymbols);
          // 状態が無くても印の欄は空けておく（web の StateIcon と同じく、名前の桁をそろえる）。
          seg = { text: glyph === "" ? " " : glyph, fg: fg ?? stateColor(theme, state), attrs };
          break;
        }
        case "git":
          seg = {
            text: t.branch ? `${t.branch} ${t.counts}` : t.counts,
            attrs: attrs || ATTR.dim,
            ...(fg !== undefined ? { fg } : {}),
          };
          break;
        case "git_status":
          seg = { text: t.counts, attrs: attrs || ATTR.dim, ...(fg !== undefined ? { fg } : {}) };
          break;
        case "text":
          seg = t.text === "" ? null : { text: t.text, attrs, ...(fg !== undefined ? { fg } : {}) };
          break;
      }
      if (seg) out.push(seg);
    }
    return out;
  });
}

/**
 * サイドバー（20260927-cli-mode の tasks T4 の最小限の chrome）：上に spaces（workspace の行。client-core の `sidebarTree` の並び・
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

  const lines: Line[] = [];
  const workspaces = [...model.workspaces.values()];
  const tree = currentSidebarTree(model, prefs);
  const layouts = loadSidebarRows(prefs.shared.sidebarRows);
  const spacesLayout = effectiveLayout(layouts, "spaces");
  const agentsLayout = effectiveLayout(layouts, "agents");
  const wsLine = (w: Workspace, indent: number): Line => {
    const state = model.workspaceState(w.id);
    return {
      indent,
      rows: segsOf(resolveSpaceLines(spacesLayout, { workspace: w, state }), state, ctx),
      selected: w.id === model.workspaceId,
      navigated: w.id === ctx.navigateSelection,
      hit: { kind: "workspace", workspaceId: w.id },
    };
  };
  // 項目の木（`sidebarTree`）を 3 段（字下げ 0〜2）に描く。描画とキー操作は同じ木を通る（`model/sidebarTree.ts`）。
  /** 項目 1 つ分の行。`inGroup` は入れ物がグループの中か（字下げの深さ）、`groupCollapsed` は畳んだグループの中か。 */
  const pushItem = (item: ItemRow, inGroup: boolean, groupCollapsed: boolean): void => {
    const base = inGroup ? 2 : 0;
    if (item.kind === "workspace") {
      if (!groupCollapsed || item.workspace.id === model.workspaceId)
        lines.push(wsLine(item.workspace, base));
      return;
    }
    const collapsed = prefs.collapsedAutoGroups.has(item.repoKey);
    const showHead = !groupCollapsed || item.head.id === model.workspaceId;
    if (showHead) lines.push(headLine(item, base, collapsed));
    // 畳んだ worktree グループ・畳んだグループの中は、今いる子の行だけ。
    for (const w of visibleGroupMembers(
      item.children,
      collapsed || groupCollapsed,
      model.workspaceId,
    ))
      lines.push(wsLine(w, base + 2));
  };
  /** worktree グループの先頭の行：「▸/▾ ψ 」を頭に付ける（2 行目からはその分も下げる）。 */
  const headLine = (
    item: Extract<ItemRow, { kind: "worktreeGroup" }>,
    indent: number,
    collapsed: boolean,
  ): Line => {
    const line = wsLine(item.head, indent);
    const first = line.rows[0] ?? [];
    const prefix: Seg[] = [{ text: collapsed ? "▸" : "▾" }, { text: KIND_GLYPH.worktreeGroup }];
    line.rows = [[...prefix, ...first], ...line.rows.slice(1)];
    // 「▸ ψ 」の 4 桁（記号 1・空き 1・記号 1・空き 1）＋状態の印の幅 2。
    line.subIndent = 6;
    line.hit = {
      kind: "autoGroup",
      repoKey: item.repoKey,
      workspaceId: item.head.id,
      toggleX: rect.x + 1 + indent,
    };
    return line;
  };
  for (const row of tree) {
    if (row.kind !== "group") {
      pushItem(row, false, false);
      continue;
    }
    lines.push({
      indent: 0,
      rows: [
        [
          { text: row.group.collapsed ? "▸" : "▾" },
          { text: KIND_GLYPH.group },
          { text: row.group.label },
        ],
      ],
      selected: false,
      hit: { kind: "group", groupId: row.group.id },
    });
    for (const item of row.items) pushItem(item, true, row.group.collapsed);
  }

  // 保存した SSH のマシンがあれば、マシンごとの見出しの下に並べる（web の Sidebar・MachineHeader・MachineRows と同じ）。
  if (ctx.machines?.hasMachines) {
    const own = lines.splice(0);
    for (const section of ctx.machines.sections)
      lines.push(...machineSection(section, own, rect, ctx));
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
  const agentLines: Line[] = [];
  if (agentPanes.length > 0) {
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
      const tab = model.tabs.get(p.tabId);
      const ws = tab ? model.workspaces.get(tab.workspaceId) : undefined;
      agentLines.push({
        indent: 0,
        rows: segsOf(
          resolveAgentLines(agentsLayout, { pane: p, tab, workspace: ws, agent: p.agent!, state }),
          state,
          ctx,
        ),
        selected: id === model.focusedPaneId,
        hit: { kind: "agent", paneId: id },
      });
    }
  }

  // 区画の高さ：見出し 1 行＋spaces。agents があれば区切り 1 行＋agents、最下行は開閉のボタン。
  const scroll = ctx.sidebarScroll ?? { spaces: 0, agents: 0, reveal: null };
  const bodyH = rect.h - 1; // 最下行は「«」
  const hits: SidebarHit[] = [];
  const visual = (list: Line[]): VisualRow[] =>
    list.flatMap((line) => line.rows.map((_, sub) => ({ line, sub })));
  const spacesLines = visual(lines);
  const agentRows = visual(agentLines);
  let spacesH: number;
  let agentsH = 0;
  if (agentLines.length > 0) {
    // spaces の区画の高さ（手元の tui-state の `sidebarSpacesRows`。無ければ中身の高さ＋1）。区切りの行は必ず見える所に置く。
    const natural = spacesLines.length + 1;
    spacesH = Math.max(1, Math.min((prefs.sidebarSpacesRows ?? natural + 1) - 1, bodyH - 3));
    agentsH = Math.max(0, bodyH - 1 - spacesH - 1);
  } else spacesH = Math.max(0, bodyH - 1);

  /** 見せる項目の最初の行と行数（複数行の項目は全部の行を見せる。見つからなければ -1）。 */
  const revealRange = (
    list: VisualRow[],
    match: (h: SidebarTarget) => boolean,
  ): [number, number] => {
    const i = list.findIndex((r) => r.sub === 0 && r.line.hit !== undefined && match(r.line.hit));
    return i < 0 ? [-1, 0] : [i, list[i]!.line.rows.length];
  };
  scroll.spaces = fitScroll(
    scroll.spaces,
    spacesLines.length,
    spacesH,
    ...(scroll.reveal?.workspaceId
      ? revealRange(
          spacesLines,
          (h) =>
            ((h.kind === "workspace" || h.kind === "autoGroup") &&
              h.workspaceId === scroll.reveal!.workspaceId) ||
            (h.kind === "machineWorkspace" &&
              remoteKey(h.machineId, h.workspaceId) === scroll.reveal!.workspaceId),
        )
      : ([-1, 0] as [number, number])),
  );
  scroll.agents = fitScroll(
    scroll.agents,
    agentRows.length,
    agentsH,
    ...(scroll.reveal?.paneId
      ? revealRange(agentRows, (h) => h.kind === "agent" && h.paneId === scroll.reveal!.paneId)
      : ([-1, 0] as [number, number])),
  );
  scroll.reveal = null;

  // 見出し「Spaces」＋並び順＋「＋」
  const headerY = rect.y;
  grid.text(rect.x + 1, headerY, truncate("Spaces", inner - 1), fg, bg, ATTR.dim);
  if (inner >= 10) {
    const x = rect.x + inner - 2;
    grid.set(x, headerY, "+", 1, fg, activeBg);
    hits.push({ y: headerY, kind: "newWorkspace", x });
    const label = WORKSPACE_SORT_LABEL[prefs.workspaceSort];
    const lw = stringWidth(label);
    const lx = x - 1 - lw;
    if (lx > rect.x + 1 + stringWidth("Spaces")) {
      grid.text(lx, headerY, label, fg, bg, ATTR.underline);
      hits.push({ y: headerY, kind: "sort", section: "spaces", x: lx, w: lw });
    }
  }
  paintSection(
    grid,
    rect,
    inner,
    headerY + 1,
    spacesH,
    spacesLines,
    scroll.spaces,
    "spaces",
    ctx,
    hits,
  );

  if (agentLines.length > 0) {
    const y = headerY + 1 + spacesH;
    // 区切りの行：罫線と見出しと並び順。ドラッグで区画の高さを変える。
    for (let x = rect.x; x < rect.x + inner; x++) grid.set(x, y, "─", 1, border, bg);
    grid.text(rect.x + 1, y, ` ${truncate("Agents", inner - 4)} `, fg, bg, ATTR.dim);
    hits.push({ y, kind: "sectionDivider" });
    const label = AGENT_SORT_LABEL[prefs.agentSort];
    const lw = stringWidth(label);
    const lx = rect.x + inner - 1 - lw;
    if (lx > rect.x + 10) {
      grid.text(lx, y, label, fg, bg, ATTR.underline);
      hits.push({ y, kind: "sort", section: "agents", x: lx, w: lw });
    }
    paintSection(grid, rect, inner, y + 1, agentsH, agentRows, scroll.agents, "agents", ctx, hits);
  }

  // 最下行：畳む「«」
  const by = rect.y + rect.h - 1;
  const bx = rect.x + inner - 2;
  if (rect.h >= 3 && bx > rect.x) {
    grid.set(bx, by, "«", 1, fg, activeBg);
    hits.push({ y: by, kind: "collapse", x: bx });
  }
  return hits;
}

const MACHINE_STATE_LABEL: Record<MachineState, string> = {
  connecting: "接続中",
  online: "接続済み",
  reconnecting: "再接続中",
  attention: "要対応",
};

/** マシンの見出しと、その下の行（選んでいるマシンは今の workspace の行、ほかのマシンは要約の行）。 */
function machineSection(
  section: MachineSection,
  own: Line[],
  rect: Rect,
  ctx: ChromeContext,
): Line[] {
  const m = ctx.machines!;
  const { theme, prefs } = ctx;
  const selected = section.id === m.selectedId;
  const collapsed = m.collapsed[section.id] === true;
  // 見出しの状態：ローカルは画面の接続（選んでいるとき）か軽い接続、ほかは手元の soda serve から見た状態（web の MachineHeader と同じ）。
  let state: MachineState;
  if (section.id === LOCAL_MACHINE_ID) {
    const sum = m.summaries[LOCAL_MACHINE_ID];
    const connected = selected ? ctx.connection === "open" : sum?.connected === true;
    state = connected ? "online" : selected || sum?.everConnected ? "reconnecting" : "connecting";
  } else state = m.statusOf(section.id)?.state ?? "connecting";
  const out: Line[] = [
    {
      indent: 0,
      rows: [
        [
          { text: collapsed ? "▸" : "▾" },
          { text: section.label, attrs: ATTR.bold | (state !== "online" ? ATTR.dim : 0) },
          {
            text: MACHINE_STATE_LABEL[state],
            attrs: ATTR.dim,
            ...(state === "attention" ? { fg: theme.ui("--soda-warn-fg") } : {}),
          },
        ],
      ],
      selected: false,
      hit: { kind: "machine", machineId: section.id, toggleX: rect.x + 1 },
    },
  ];
  if (collapsed) return out;
  if (selected) {
    out.push(...own);
    return out;
  }
  const summary = m.summaries[section.id];
  if (!summary?.everConnected) {
    out.push({ indent: 2, rows: [[{ text: "未接続", attrs: ATTR.dim }]], selected: false });
    return out;
  }
  const selectable = m.isSelectable(section.id);
  for (const ws of summary.workspaces) {
    const states = m
      .agentsInWorkspace(section.id, ws.id)
      .map((a) => displayStateFor(a, a.serverSeenSeq));
    const st = aggregate(states);
    const glyph = glyphFor(st, prefs.statusSymbols);
    out.push({
      indent: 0,
      rows: [
        [
          { text: glyph === "" ? " " : glyph, fg: stateColor(theme, st) },
          { text: ws.label, ...(selectable ? {} : { attrs: ATTR.dim }) },
        ],
      ],
      selected: false,
      navigated: ctx.navigateSelection === remoteKey(section.id, ws.id),
      hit: {
        kind: "machineWorkspace",
        machineId: section.id,
        workspaceId: ws.id,
        tabId: ws.activeTabId,
      },
    });
  }
  return out;
}

/** 表示の位置を収める（`reveal` の行が隠れていれば見える所まで）。 */
function fitScroll(
  offset: number,
  total: number,
  height: number,
  reveal: number,
  revealRows = 1,
): number {
  let o = Math.max(0, Math.min(offset, total - height));
  if (reveal >= 0 && height > 0) {
    // 項目の全部の行（入らなければ頭から入る分）を見せる。
    const last = reveal + Math.min(Math.max(1, revealRows), height) - 1;
    if (reveal < o) o = reveal;
    else if (last >= o + height) o = last - height + 1;
  }
  return Math.max(0, o);
}

/** 区画の行を描く（`offset` 行目から `height` 行）。隠れている行があれば右端に ↑・↓。 */
function paintSection(
  grid: Grid,
  rect: Rect,
  inner: number,
  top: number,
  height: number,
  rows: VisualRow[],
  offset: number,
  section: "spaces" | "agents",
  ctx: ChromeContext,
  hits: SidebarHit[],
): void {
  const { theme } = ctx;
  const bg = theme.ui("--soda-menu-bg");
  const fg = theme.ui("--soda-menu-fg");
  const activeBg = theme.ui("--soda-menu-active-bg");
  for (let i = 0; i < height; i++) {
    const y = top + i;
    const row = rows[offset + i];
    if (!row) {
      hits.push({ y, kind: "area", section });
      continue;
    }
    const { line, sub } = row;
    // navigate モードで選んでいる行はアクセントの色で（今の workspace の強調より優先）。
    const rowBg = line.navigated ? theme.ui("--soda-accent") : line.selected ? activeBg : bg;
    const rowFg = line.navigated ? theme.ui("--soda-accent-fg") : fg;
    if (line.selected || line.navigated) grid.fill({ x: rect.x, y, w: inner, h: 1 }, rowFg, rowBg);
    if (line.hit) hits.push({ y, section, ...line.hit });
    else hits.push({ y, kind: "area", section });
    // 1 行目は項目の頭から、2 行目からは状態の印の幅（2 桁）だけ下げる（web の line2 と同じ）。
    let x = rect.x + 1 + line.indent + (sub > 0 ? (line.subIndent ?? 2) : 0);
    const end = rect.x + inner - 1;
    const segs = line.rows[sub]!;
    segs.forEach((seg, k) => {
      if (x >= end) return;
      const text = truncate(seg.text, end - x);
      const bold = line.selected && sub === 0 && seg.fg === undefined ? ATTR.bold : 0;
      x += grid.text(x, y, text, seg.fg ?? rowFg, rowBg, (seg.attrs ?? 0) | bold, end - x);
      if (k < segs.length - 1) x += 1;
    });
  }
  if (offset > 0 && height > 0) grid.set(rect.x + inner - 1, top, "↑", 1, fg, bg);
  if (offset + height < rows.length && height > 0)
    grid.set(rect.x + inner - 1, top + height - 1, "↓", 1, fg, bg);
}
