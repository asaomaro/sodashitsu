import type { DisplayState, ItemTarget, MachineState, Pane, Workspace } from "@sodashitsu/protocol";
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
  hiddenWorktreeCount,
  isUngroupedNavigateKey,
  navigateKeyOfGroup,
  navigateKeyOfUngrouped,
  type ItemRow,
  UNGROUPED_REF,
} from "@sodashitsu/client-core";
import { currentSidebarTree } from "../../model/sidebarTree.js";
import { ATTR, hexColor, type PackedColor } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { stringWidth, truncate } from "../width.js";
import { glyphFor, stateColor, type ChromeContext } from "./context.js";

/**
 * worktree の印（worktree グループの先頭の行・子の行。20261004-group-worktree-items・追補 01 の T4）。`⎇`（U+2387）は絵文字の属性を
 * 持たない幅 1 の字形（unicode11 の規則で幅 1。`render/chrome/sidebar.test.ts` で測って固定）。状態の記号の次に置く。
 * 木の線 `├`／`└` と、畳んだ worktree グループの `+n` は薄い色で描く。グループの見出しにはフォルダの印を付けない（decisions D34）。
 */
export const WORKTREE_GLYPH = "⎇";
export const TREE_GLYPH = { branch: "├", last: "└" } as const;
/** グループの見出しの横線（名前と数の間を埋める）。 */
const RULE_GLYPH = "─";

/** サイドバーの行が何を指すか（04 のクリック・navigate が使う）。 */
export type SidebarTarget =
  | { kind: "workspace"; workspaceId: string }
  /** グループの見出し。左の「▸/▾」は `x <= toggleX`（マシンの見出しと同じ作り。クリックの動作は T18）。 */
  | { kind: "group"; groupId: string; toggleX: number }
  /** 「グループなし」の見出し（同形。名前の変更・削除はできない）。 */
  | { kind: "ungrouped"; toggleX: number }
  /**
   * worktree グループの先頭の行（本体の workspace の行）。左の「▸/▾」（`x <= toggleX`）でその worktree グループを畳み・広げ、
   * ほかは `workspaceId` の workspace として働く（マシンの見出しの `machine` と同じ作り）。
   */
  | { kind: "autoGroup"; repoKey: string; workspaceId: string; toggleX: number }
  | { kind: "agent"; paneId: string }
  /** 「＋」（新しい workspace。herdr の M14）。`x` の桁だけが当たり。 */
  | { kind: "newWorkspace"; x: number }
  /** spaces と agents の区切りの行（ドラッグで spaces の区画の高さ。動かさずに離せば agents の折りたたみ。herdr の H19b）。 */
  | { kind: "sectionDivider" }
  /** spaces の見出しの行（押すと spaces の折りたたみ。「＋」と並び順の桁は別の当たり。20261004-ui-interaction-polish）。 */
  | { kind: "sectionHeader"; section: "spaces" }
  /** 並び順の切り替え（web の `sidebar-sort-btn`・herdr の `agent_sort_toggle`。M14）。`x`〜`x+w` だけが当たり。 */
  | { kind: "sort"; section: "spaces" | "agents"; x: number; w: number }
  /** サイドバーを畳む「«」（web の開閉のボタン・herdr の `sidebar_toggle`。M14）。 */
  | { kind: "collapse"; x: number }
  /** マシンの見出し（M10。左の「▸/▾」で畳み・広げ、ほかは切り替え）。 */
  | { kind: "machine"; machineId: string; toggleX: number }
  /** 選んでいないマシンの workspace の行（押すとそのマシンのその workspace へ）。 */
  | { kind: "machineWorkspace"; machineId: string; workspaceId: string; tabId: string }
  /** 区画の中の何も無い行（ホイールでその区画を動かす）。 */
  | { kind: "area"; section: "spaces" | "agents" }
  /** エージェントの行の末尾の件数（`⤷n`。20261004-subagent-display）。`x`〜`x+w` だけが当たり（押すとサブエージェントの一覧）。 */
  | { kind: "subagents"; paneId: string; x: number; w: number };
/**
 * ドラッグの掴み・落とし先になる行の情報（項目の行と、グループ・「グループなし」の見出し。web の `SpaceRow` の `item`・`container`・
 * `dragIds`・`dropAnchorId` に当たる）。子の行は親の worktree グループの項目を指す。
 */
export interface SidebarDragInfo {
  item: ItemTarget;
  /** 入れ物。`null` は一番上のまとまりの列（グループ・「グループなし」の見出し）、`"u"`（UNGROUPED_REF）は「グループなし」の中、それ以外はグループの id。 */
  container: string | null;
  /** 同じ入れ物の中での並びの番号（上下どちらへ動かすかの判定。畳んで見えない項目も数える）。 */
  index: number;
  /** 動かすときの workspace 全部（`layout` の無い古いサーバの `workspace.move_to` 用。worktree グループは先頭から全部）。 */
  workspaceIds: string[];
  /** 古いサーバの落とし先に使う、この項目の先頭の workspace（空のグループは null）。 */
  anchorId: string | null;
  /** 同じ入れ物の次の項目（下へ動かすとき、落とした項目の次の前へ入れる）。最後なら null。 */
  next: { item: ItemTarget; anchorId: string | null } | null;
}
export type SidebarHit = SidebarTarget & {
  y: number;
  section?: "spaces" | "agents";
  drag?: SidebarDragInfo;
};

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
  /** 行の並びの `state_icon` の部品（worktree の印をその次へ差し込むため）。 */
  stateIcon?: true;
}

/** サイドバーの 1 項目（workspace・グループの見出し・エージェント）。`rows` は画面の行（2 行目からは字下げ）。 */
interface Line {
  indent: number;
  rows: Seg[][];
  /** 2 行目からの追加の字下げ（既定 2 ＝ 状態の印の幅。先頭の行は前に付く「▸ 」「⎇ 」の分だけ広げる）。 */
  subIndent?: number;
  /** 1 行目の右端に寄せる部品（ブランチ名・見出しの数）。入らなければ左の部品を削って場所を空ける（半分まで）。 */
  right?: Seg;
  /** 名前と `right` の間を横線 `─` で埋める（グループの見出し）。 */
  rule?: boolean;
  selected: boolean;
  navigated?: boolean;
  hit?: SidebarTarget;
  drag?: SidebarDragInfo;
  /** 1 行目の末尾に右寄せで出す印（サブエージェントの件数）。 */
  badge?: { text: string; paneId: string };
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
          seg = {
            text: glyph === "" ? " " : glyph,
            fg: fg ?? stateColor(theme, state),
            attrs,
            stateIcon: true,
          };
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
  // 行の並びの 1 行目にブランチを出す項目があれば、worktree グループの行のブランチ名は重ねない（web の `line1HasBranch`）。
  const line1HasBranch = (spacesLayout[0] ?? []).some(
    (t) => t.token === "git" || t.token === "branch",
  );
  const dim = (text: string): Seg => ({ text, attrs: ATTR.dim });
  /** 中の全 pane のエージェントの状態のうち優先度の高いもの（workspace の行・グループの見出しで同じ決まり）。 */
  const stateOfAll = (list: Workspace[]): DisplayState | null =>
    aggregate(list.map((w) => model.workspaceState(w.id)));
  const itemWorkspaces = (item: ItemRow): Workspace[] =>
    item.kind === "workspace" ? [item.workspace] : [item.head, ...item.children];
  /** workspace の行。`state` は状態のまとめ（既定は自分の pane）。 */
  const wsLine = (w: Workspace, indent: number, state?: DisplayState | null): Line => {
    const st = state === undefined ? model.workspaceState(w.id) : state;
    return {
      indent,
      rows: segsOf(resolveSpaceLines(spacesLayout, { workspace: w, state: st }), st, ctx),
      selected: w.id === model.workspaceId,
      navigated: w.id === ctx.navigateSelection,
      hit: { kind: "workspace", workspaceId: w.id },
    };
  };
  /**
   * 項目の行の頭に部品を足す（T4）。通常の行は折りたたみの桁を空ける（先頭の行の「▾」と状態の記号の桁をそろえる）。
   * worktree の行は「<頭> ◐ ⎇ 名前」（`⎇` は状態の記号の次。無ければ頭の次）。2 行目は名前の桁（頭 2・状態 2・`⎇` 2）から。
   */
  const withLead = (line: Line, lead: Seg, worktree: boolean): Line => {
    const first = line.rows[0] ?? [];
    if (worktree) {
      const at = first.findIndex((g) => g.stateIcon) + 1;
      line.rows = [
        [lead, ...first.slice(0, at), dim(WORKTREE_GLYPH), ...first.slice(at)],
        ...line.rows.slice(1),
      ];
      line.subIndent = 6;
    } else {
      line.rows = [[lead, ...first], ...line.rows.slice(1)];
      line.subIndent = 4;
    }
    return line;
  };
  /** worktree の行の右に出すブランチ名（行の並びの 1 行目に git の項目があれば出さない）。 */
  const branchOf = (line: Line, w: Workspace): Line => {
    const branch = w.git?.branch;
    if (!line1HasBranch && branch) line.right = dim(branch);
    return line;
  };
  // 項目の木（`sidebarTree`）を描く。描画とキー操作は同じ木を通る（`model/sidebarTree.ts`）。
  /** 項目 1 つ分の行。`base` は項目の字下げ（グループの中は 2）、`unitCollapsed` は畳んだまとまりの中か。`drag` は掴み・落とし先の情報。 */
  const pushItem = (
    item: ItemRow,
    base: number,
    unitCollapsed: boolean,
    drag: SidebarDragInfo,
  ): void => {
    if (item.kind === "workspace") {
      if (!unitCollapsed || item.workspace.id === model.workspaceId)
        lines.push({
          ...withLead(wsLine(item.workspace, base), { text: " " }, false),
          drag,
        });
      return;
    }
    const collapsed = prefs.collapsedAutoGroups.has(item.repoKey);
    if (!unitCollapsed || item.head.id === model.workspaceId)
      lines.push({ ...headLine(item, base, collapsed), drag });
    // 畳んだ worktree グループ・畳んだまとまりの中は、今いる子の行だけ。
    const shown = visibleGroupMembers(item.children, collapsed || unitCollapsed, model.workspaceId);
    for (const w of shown) {
      const last = shown[shown.length - 1] === w; // 見えている子の最後（web と同じ）
      lines.push({
        ...branchOf(
          withLead(wsLine(w, base), dim(last ? TREE_GLYPH.last : TREE_GLYPH.branch), true),
          w,
        ),
        drag,
      });
    }
  };
  /** 入れ物の中の `i` 番目の項目の掴み・落とし先の情報（子の行は親の worktree グループ＝先頭の workspace の項目）。 */
  const itemDrag = (items: ItemRow[], i: number, container: string): SidebarDragInfo => {
    const ids = itemWorkspaces(items[i]!).map((w) => w.id);
    const nextItem = items[i + 1];
    const nextId = nextItem ? itemWorkspaces(nextItem)[0]!.id : null;
    return {
      item: { kind: "workspace", workspaceId: ids[0]! },
      container,
      index: i,
      workspaceIds: ids,
      anchorId: ids[0]!,
      next:
        nextId === null
          ? null
          : { item: { kind: "workspace", workspaceId: nextId }, anchorId: nextId },
    };
  };
  /**
   * worktree グループの先頭の行：「▾ ◐ ⎇ 名前」。畳んでいるときは本体と worktree 全部の状態のまとめと、隠れている数 `+n`。
   * 左の「▸/▾」が折りたたみの当たり（`autoGroup`）、ほかは workspace の当たり。
   */
  const headLine = (
    item: Extract<ItemRow, { kind: "worktreeGroup" }>,
    indent: number,
    collapsed: boolean,
  ): Line => {
    const line = withLead(
      wsLine(item.head, indent, collapsed ? stateOfAll(itemWorkspaces(item)) : undefined),
      { text: collapsed ? "▸" : "▾" },
      true,
    );
    if (collapsed) {
      const hidden = hiddenWorktreeCount(item, model.workspaceId);
      if (hidden > 0) line.rows[0] = [...line.rows[0]!, dim(`+${hidden}`)];
    }
    branchOf(line, item.head);
    line.hit = {
      kind: "autoGroup",
      repoKey: item.repoKey,
      workspaceId: item.head.id,
      toggleX: rect.x + 1 + indent,
    };
    return line;
  };
  /** グループ・「グループなし」の見出し：「▾ ◐ 名前 ───── 数」（名前・線・数は薄い色。状態は中の全部のまとめ）。 */
  const headingLine = (
    collapsed: boolean,
    label: string,
    items: ItemRow[],
    hit: SidebarTarget,
    navigateKey: string,
  ): Line => {
    const state = stateOfAll(items.flatMap(itemWorkspaces));
    const glyph = glyphFor(state, prefs.statusSymbols);
    return {
      indent: 0,
      rows: [
        [
          { text: collapsed ? "▸" : "▾" },
          { text: glyph === "" ? " " : glyph, fg: stateColor(theme, state) },
          dim(label),
        ],
      ],
      right: dim(String(items.length)),
      rule: true,
      selected: false,
      navigated: ctx.navigateSelection === navigateKey,
      hit,
    };
  };
  // まとまりの列（見出しのあるグループ・「グループなし」）。見出しのドラッグはこの中で並べ替える。
  const units = tree.filter((r) => r.kind === "group" || r.heading);
  const unitItem = (row: (typeof units)[number]): ItemTarget =>
    row.kind === "group" ? { kind: "group", groupId: row.group.id } : { kind: "ungrouped" };
  const unitIds = (row: (typeof units)[number]): string[] =>
    row.items.flatMap(itemWorkspaces).map((w) => w.id);
  const unitDrag = (row: (typeof units)[number]): SidebarDragInfo => {
    const i = units.indexOf(row);
    const nx = units[i + 1];
    const ids = unitIds(row);
    return {
      item: unitItem(row),
      container: null,
      index: i,
      workspaceIds: ids,
      anchorId: ids[0] ?? null,
      next: nx ? { item: unitItem(nx), anchorId: unitIds(nx)[0] ?? null } : null,
    };
  };
  for (const row of tree) {
    if (row.kind === "ungrouped") {
      // 見出しは本物のグループが 1 つ以上あるときだけ。無ければ項目がそのまま並ぶ（字下げなし）。
      if (row.heading) {
        lines.push({
          ...headingLine(
            row.collapsed,
            "グループなし",
            row.items,
            { kind: "ungrouped", toggleX: rect.x + 1 },
            navigateKeyOfUngrouped(),
          ),
          drag: unitDrag(row),
        });
      }
      row.items.forEach((item, i) =>
        pushItem(item, row.heading ? 2 : 0, row.collapsed, itemDrag(row.items, i, UNGROUPED_REF)),
      );
      continue;
    }
    lines.push({
      ...headingLine(
        row.group.collapsed,
        row.group.label,
        row.items,
        { kind: "group", groupId: row.group.id, toggleX: rect.x + 1 },
        navigateKeyOfGroup(row.group.id),
      ),
      drag: unitDrag(row),
    });
    row.items.forEach((item, i) =>
      pushItem(item, 2, row.group.collapsed, itemDrag(row.items, i, row.group.id)),
    );
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
        // サブエージェントの件数（1 件以上のとき。20261004-subagent-display）。`⤷` は unicode11 で 1 桁（環境で崩れるなら別の記号にする。decisions D11）。
        ...((p.agent?.subagents?.count ?? 0) > 0
          ? { badge: { text: `⤷${p.agent!.subagents!.count}`, paneId: id } }
          : {}),
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
  // 区画の折りたたみ（手元の tui-state。20261004-ui-interaction-polish）。agents が 0 件のときは畳む対象が無いので agents の折りたたみは効かない。
  const folded = prefs.sectionsCollapsed;
  const spacesFolded = folded.spaces;
  const agentsFolded = agentLines.length > 0 && folded.agents;
  let spacesH: number;
  let agentsH = 0;
  if (agentLines.length > 0) {
    if (spacesFolded || agentsFolded) {
      // 畳んだ区画は 0 行（見出し・区切りの行だけ）。もう片方が残りを使う。両方畳めば、残りは空く。
      const rest = Math.max(0, bodyH - 2);
      spacesH = spacesFolded ? 0 : rest;
      agentsH = agentsFolded ? 0 : rest;
    } else {
      // spaces の区画の高さ（手元の tui-state の `sidebarSpacesRows`。無ければ中身の高さ＋1）。区切りの行は必ず見える所に置く。
      const natural = spacesLines.length + 1;
      spacesH = Math.max(1, Math.min((prefs.sidebarSpacesRows ?? natural + 1) - 1, bodyH - 3));
      agentsH = Math.max(0, bodyH - 1 - spacesH - 1);
    }
  } else spacesH = spacesFolded ? 0 : Math.max(0, bodyH - 1);

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
            // 見出しを選んでいるとき（navigate の選択のキー `group:<id>`・`ungrouped:`）もその行まで動かす。
            (h.kind === "group" && navigateKeyOfGroup(h.groupId) === scroll.reveal!.workspaceId) ||
            (h.kind === "ungrouped" &&
              isUngroupedNavigateKey(scroll.reveal!.workspaceId ?? null)) ||
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

  // 見出し「▾ Spaces」（畳んでいれば「▸ Spaces <数>」）＋並び順＋「＋」。押すと spaces の折りたたみ（「＋」と並び順は別の当たり）。
  const headerY = rect.y;
  const spacesTitle = `${spacesFolded ? "▸" : "▾"} Spaces`;
  // 「＋」と並び順が入る幅（`inner >= 10`）では、その手前までに収める。入らない狭い幅では印と題だけ（件数は出さない）。
  const headerRoom = inner >= 12 ? inner - 4 : inner - 1;
  const countText = ` ${workspaces.length}`;
  const spacesHead =
    spacesFolded && stringWidth(spacesTitle + countText) <= headerRoom
      ? spacesTitle + countText
      : spacesTitle;
  grid.text(rect.x + 1, headerY, truncate(spacesHead, inner - 1), fg, bg, ATTR.dim);
  hits.push({ y: headerY, kind: "sectionHeader", section: "spaces" });
  // 「＋」は題（8 桁）の次の桁から（`inner - 2 > 9`）。それより狭いと題の末尾に重なるので出さない。
  if (inner >= 12) {
    const x = rect.x + inner - 2;
    grid.set(x, headerY, "+", 1, fg, activeBg);
    hits.push({ y: headerY, kind: "newWorkspace", x });
    if (!spacesFolded) {
      const label = WORKSPACE_SORT_LABEL[prefs.workspaceSort];
      const lw = stringWidth(label);
      const lx = x - 1 - lw;
      if (lx > rect.x + 1 + stringWidth(spacesTitle)) {
        grid.text(lx, headerY, label, fg, bg, ATTR.underline);
        hits.push({ y: headerY, kind: "sort", section: "spaces", x: lx, w: lw });
      }
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
    // 区切りの行：罫線と見出し（`▾ Agents`。畳んでいれば `▸ Agents <数> <状態>`）と並び順。ドラッグで区画の高さを変え、動かさずに離せば agents の折りたたみ。
    for (let x = rect.x; x < rect.x + inner; x++) grid.set(x, y, "─", 1, border, bg);
    const agentsTitle = `${agentsFolded ? "▸" : "▾"} Agents`;
    const blocked = agentPanes.some((p) => model.displayStateOf(p) === "blocked");
    const glyph = blocked ? glyphFor("blocked", prefs.statusSymbols) : "";
    const countPart = agentsFolded ? ` ${agentLines.length}` : "";
    const glyphPart = agentsFolded && glyph !== "" ? ` ${glyph}` : "";
    // 入りきらない狭い幅では印と題だけ。
    const room = inner - 4;
    const full = stringWidth(agentsTitle + countPart + glyphPart);
    const head = full <= room ? agentsTitle + countPart : agentsTitle;
    grid.text(rect.x + 1, y, ` ${truncate(head, room)} `, fg, bg, ATTR.dim);
    if (full <= room && glyphPart !== "") {
      const gx = rect.x + 1 + 1 + stringWidth(head) + 1;
      grid.text(gx, y, glyph, stateColor(theme, "blocked"), bg);
    }
    hits.push({ y, kind: "sectionDivider" });
    if (!agentsFolded) {
      const label = AGENT_SORT_LABEL[prefs.agentSort];
      const lw = stringWidth(label);
      const lx = rect.x + inner - 1 - lw;
      if (lx > rect.x + 2 + stringWidth(agentsTitle) + 1) {
        grid.text(lx, y, label, fg, bg, ATTR.underline);
        hits.push({ y, kind: "sort", section: "agents", x: lx, w: lw });
      }
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
    if (line.hit) hits.push({ y, section, ...line.hit, ...(line.drag ? { drag: line.drag } : {}) });
    else hits.push({ y, kind: "area", section });
    // 1 行目は項目の頭から、2 行目からは状態の印の幅（2 桁）だけ下げる（web の line2 と同じ）。
    let x = rect.x + 1 + line.indent + (sub > 0 ? (line.subIndent ?? 2) : 0);
    const lineEnd = rect.x + inner - 1;
    // 1 行目の末尾の印（件数）。名前の行の幅（字下げを除く）が印＋2 桁を超えるときだけ出し、文字はその手前（印と 1 桁あけて）までに縮める。
    // 入らない狭い幅では出さない（文字の最小幅の保証はしない。一覧へは pane のメニュー・`show_subagents` からも行ける）。
    const badge = sub === 0 ? line.badge : undefined;
    const badgeW = badge ? stringWidth(badge.text) : 0;
    const showBadge = badge !== undefined && lineEnd - rect.x - 1 - line.indent > badgeW + 2;
    const end = showBadge ? lineEnd - badgeW - 1 : lineEnd;
    if (showBadge) {
      const bx = lineEnd - badgeW;
      grid.text(bx, y, badge!.text, rowFg, rowBg, ATTR.underline, badgeW);
      hits.push({ y, section, kind: "subagents", paneId: badge!.paneId, x: bx, w: badgeW });
    }
    const segs = line.rows[sub]!;
    // 1 行目の右端の部品（ブランチ名・数）。右へ寄せ、広くても残りの半分まで（左の名前を先に残す）。
    let right: { seg: Seg; text: string; x: number } | null = null;
    let segEnd = end;
    if (sub === 0 && line.right) {
      const text = truncate(line.right.text, Math.max(0, Math.floor((end - x) / 2)));
      const w = stringWidth(text);
      if (w > 0) {
        right = { seg: line.right, text, x: end - w };
        segEnd = end - w - 1;
      }
    }
    segs.forEach((seg, k) => {
      if (x >= segEnd) return;
      const text = truncate(seg.text, segEnd - x);
      const bold = line.selected && sub === 0 && seg.fg === undefined ? ATTR.bold : 0;
      x += grid.text(x, y, text, seg.fg ?? rowFg, rowBg, (seg.attrs ?? 0) | bold, segEnd - x);
      if (k < segs.length - 1) x += 1;
    });
    if (sub === 0 && line.rule)
      for (let rx = x + 1; rx < segEnd; rx++)
        grid.set(rx, y, RULE_GLYPH, 1, rowFg, rowBg, ATTR.dim);
    if (right)
      grid.text(
        right.x,
        y,
        right.text,
        right.seg.fg ?? rowFg,
        rowBg,
        right.seg.attrs ?? 0,
        end - right.x,
      );
  }
  if (offset > 0 && height > 0) grid.set(rect.x + inner - 1, top, "↑", 1, fg, bg);
  if (offset + height < rows.length && height > 0)
    grid.set(rect.x + inner - 1, top + height - 1, "↓", 1, fg, bg);
}
