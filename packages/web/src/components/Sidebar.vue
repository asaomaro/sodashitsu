<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import type { ItemTarget, Workspace } from "@sodashitsu/protocol";
import { ActionDispatcherKey, ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useSeenStore, aggregate, displayStateFor, STATE_PRIORITY } from "../store/seen.js";
import { orderedAgentPaneIds } from "@sodashitsu/client-core";
import { type ItemRow, groupIdOfNavigateKey, visibleGroupMembers } from "@sodashitsu/client-core";
import { currentSidebarTree } from "../store/sidebarTree.js";
import SidebarKindIcon from "./SidebarKindIcon.vue";
import { type AgentSort, SIDEBAR_WIDTH, type WorkspaceSort, useViewStore } from "../store/view.js";
import { useSettingsStore } from "../store/settings.js";
import { type ResolvedLine, resolveAgentLines, resolveSpaceLines, tokenStyleAttr } from "@sodashitsu/client-core";
import StateIcon from "./StateIcon.vue";
import MachineHeader from "./MachineHeader.vue";
import MachineRows from "./MachineRows.vue";
import { useMachinesStore } from "../store/machines.js";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";

/**
 * サイドバー（D56 の訂正 9）。「spaces」（workspace の一覧）と「agents」（エージェントの一覧）の 2 区画。
 * `prefix+b` での折りたたみは `view.sidebarCollapsed` を見るだけ（切替自体は `ActionDispatcher`）。
 *
 * spaces 区画は 20260923-workspace-grouping でグループ構造を持つ描画へ拡張し、20261004-group-worktree-items で
 * サーバが配るレイアウトの 3 段（グループ／worktree グループ／通常の行。字下げ 0〜2）へ替えた：`sidebarTree`（純関数）で
 * 木を求め、`SpaceRow[]`（グループの見出し行・worktree グループの先頭・子・通常の行をフラットに並べたもの）に組み立てる。
 * D&D は `PaneFrame.vue` の `onNamePointerDown`/`onNamePointerMove`/`onNamePointerUp` と同じ流儀
 * （6px の閾値・`setPointerCapture`・`document.elementFromPoint` によるドロップ先判定・Esc での
 * 取り消し）をそのまま踏襲する。
 */
const session = useSessionStore();
const seen = useSeenStore();
const view = useViewStore();
const settings = useSettingsStore();
const actions = inject(ActionDispatcherKey);
const machines = useMachinesStore();

/**
 * マシンのまとまり（20260927-multi-host-machines の design「サイドバー」）。有効なマシンが無ければ、選んでいる（＝ローカルの）1 つだけで見出しを
 * 出さない＝今までの描画のまま（AC15）。あれば、ローカルを先頭に登録の順。選んでいるマシンのまとまりには今までの workspace の行を、ほかは要約の行を出す。
 */
const machineSections = computed(() => (machines.hasMachines ? machines.sections : [{ id: machines.selectedId, label: "" }]));

// navigate モード（サイドバーの行をキーで選ぶ）に入ったら、選んでいるマシンのまとまりを開く（畳んだままだと選択の枠が見えない）。
watch(
  () => view.mode,
  (mode) => {
    if (mode === "navigate" && machines.collapsed[machines.selectedId]) machines.toggleCollapsed(machines.selectedId);
  },
);
const conn = inject(ConnectionKey);

const el = ref<HTMLElement | null>(null);
let dragging = false;
let dragStartX = 0;
let dragStartWidth = 0;
let lastDividerClick = 0;

/** 並び順の表示名（20260922-appearance-settings-rest。`AGENT_SORT_LABEL` と同じパターン）。 */
const WORKSPACE_SORT_LABEL: Record<WorkspaceSort, string> = { opened: "開いた順", name: "名前順" };

interface SpaceRow {
  key: string;
  /** 行の種類（20261004-group-worktree-items）：グループの見出し／worktree グループの先頭／worktree グループの子／通常の行。 */
  kind: "group" | "worktreeHead" | "worktreeChild" | "workspace";
  /** 入れ物の深さ（字下げ。0〜2）。 */
  depth: 0 | 1 | 2;
  /** メンバーの workspace（単独行・メンバー行・worktree グループの本体・子）。グループの
   *  ヘッダー行だけ null（グループ自体は特定の workspace ではないため）。 */
  workspace: Workspace | null;
  state: keyof typeof STATE_PRIORITY | null;
  isCurrent: boolean;
  /** この行を入れているグループの id（グループの見出し行・一番上の行は null）。 */
  parentGroupId: string | null;
  /** 字下げする行（`depth > 0`）か。 */
  indent: boolean;
  /** このグループの「頭」の行（折りたたみの開閉アイコンを持ち、ドラッグするとグループ全体が動く）か。
   *  グループの見出し行と、worktree グループの先頭の行が該当する。 */
  isGroupHead: boolean;
  groupKind: "manual" | "auto" | null;
  /** 折りたたみ・右クリックメニューの対象（グループの id、または worktree グループの repoKey）。 */
  groupTargetId: string | null;
  /** ヘッダー行のラベル（`workspace` が null のときだけ使う。グループの名前）。 */
  groupLabel: string;
  collapsed: boolean;
  /** ドラッグしたときに一緒に動かす workspace id（通常の行は自分自身の1件。グループの頭は全メンバー）。 */
  dragIds: string[];
  /** この行が表す項目（ドラッグで動くのも、落とし先になるのもこの単位。子の行は親の worktree グループ）。 */
  item: ItemTarget;
  /** 項目の入れ物（`null` は一番上、それ以外はグループの id。グループの見出し自身は一番上の項目）。 */
  container: string | null;
  /**
   * 古いサーバ（`layout` が無い）の `workspace.move_to` へ渡す落とし先（workspace id。項目の先頭の workspace）。
   * 無ければ（メンバーが 1 人もいないグループ）古いサーバへは送れない。**ホバー中の行の特定には使わない**
   * ——グループの見出しとその先頭メンバーの行は同じ値を持ちうる。行の特定・ハイライトは一意な `key` で行う。
   */
  dropAnchorId: string | null;
  /**
   * 展開したサイドバーで描く行（設定した並び〔既定なら今と同じ並び〕を解決したもの。20260927-sidebar-row-tokens）。グループの見出し行は空
   * （見出しは今までどおりの 1 行で描く）。
   */
  lines: ResolvedLine[];
}

function rowStateFor(ws: Workspace): { state: keyof typeof STATE_PRIORITY | null; isCurrent: boolean; lines: ResolvedLine[] } {
  const states = session.panesInWorkspace(ws.id).map((p) => displayStateFor(p.agent, seen.getSeenSeq(p.agent?.instanceId ?? "", p.agent?.serverSeenSeq ?? 0)));
  const isCurrent = ws.id === view.workspaceId;
  const state = aggregate(states) as keyof typeof STATE_PRIORITY | null;
  return { state, isCurrent, lines: resolveSpaceLines(settings.spacesLayout, { workspace: ws, state }) };
}

/** `itemHeadId` はこの行の項目の先頭の workspace（通常の行は自分、worktree グループの子は先頭の行）。 */
function workspaceRow(ws: Workspace, opts: { depth: 0 | 1 | 2; parentGroupId: string | null; kind: SpaceRow["kind"]; groupKind: SpaceRow["groupKind"]; groupTargetId: string | null; dragIds: string[]; itemHeadId: string }): SpaceRow {
  return { key: ws.id, kind: opts.kind, workspace: ws, ...rowStateFor(ws), depth: opts.depth, parentGroupId: opts.parentGroupId, indent: opts.depth > 0, isGroupHead: false, groupKind: opts.groupKind, groupTargetId: opts.groupTargetId, groupLabel: "", collapsed: false, dragIds: opts.dragIds, item: { kind: "workspace", workspaceId: opts.itemHeadId }, container: opts.parentGroupId, dropAnchorId: opts.itemHeadId };
}

const spaces = computed<SpaceRow[]>(() => {
  // 描画の木（`sidebarTree`。キー操作の順と同じ関数を通る——`currentVisibleWorkspaceIds`）。
  const tree = currentSidebarTree(session, view);
  const out: SpaceRow[] = [];
  /** 項目（worktree グループ・通常の行）の行を足す。`groupCollapsed` なら今いる workspace の行だけ（AC6）。 */
  const pushItem = (item: ItemRow, depth: 0 | 1, parentGroupId: string | null, groupCollapsed: boolean): void => {
    if (item.kind === "workspace") {
      if (!groupCollapsed || item.workspace.id === view.workspaceId) out.push(workspaceRow(item.workspace, { depth, parentGroupId, kind: "workspace", groupKind: null, groupTargetId: null, dragIds: [item.workspace.id], itemHeadId: item.workspace.id }));
      return;
    }
    // worktree グループ：先頭（本体）の行自体がグループの頭を兼ねる（herdr と同じ並び）。
    const collapsed = view.collapsedAutoGroups.has(item.repoKey);
    const allIds = [item.head.id, ...item.children.map((w) => w.id)];
    if (!groupCollapsed || item.head.id === view.workspaceId) {
      out.push({ ...workspaceRow(item.head, { depth, parentGroupId, kind: "worktreeHead", groupKind: "auto", groupTargetId: item.repoKey, dragIds: allIds, itemHeadId: item.head.id }), isGroupHead: true, collapsed });
    }
    const children = groupCollapsed ? item.children.filter((w) => w.id === view.workspaceId) : visibleGroupMembers(item.children, collapsed, view.workspaceId);
    for (const w of children) out.push(workspaceRow(w, { depth: (depth + 1) as 1 | 2, parentGroupId, kind: "worktreeChild", groupKind: "auto", groupTargetId: item.repoKey, dragIds: allIds, itemHeadId: item.head.id }));
  };
  for (const row of tree) {
    if (row.kind !== "group") {
      // 暫定（T25 で直す）: 「グループなし」は見出しを描かず、項目を今までの一番上の行として描く。
      for (const item of row.items) pushItem(item, 0, null, false);
      continue;
    }
    const allIds = row.items.flatMap((item) => (item.kind === "workspace" ? [item.workspace.id] : [item.head.id, ...item.children.map((w) => w.id)]));
    out.push({
      key: `group:${row.group.id}`,
      kind: "group",
      workspace: null,
      state: null,
      isCurrent: false,
      depth: 0,
      parentGroupId: null,
      indent: false,
      isGroupHead: true,
      groupKind: "manual",
      groupTargetId: row.group.id,
      groupLabel: row.group.label,
      collapsed: row.group.collapsed,
      dragIds: allIds,
      item: { kind: "group", groupId: row.group.id },
      container: null,
      dropAnchorId: allIds[0] ?? null,
      lines: [],
    });
    for (const item of row.items) pushItem(item, 1, row.group.id, row.group.collapsed);
  }
  return out;
});

/** 全体のメニューが開いているか（`PaneFrame` の枠のボタンと同じく `aria-expanded` で伝える）。 */
const globalMenuOpen = computed(() => view.contextMenu?.target.kind === "global");

/**
 * 上端の session のボタン（20260926-named-session-ui の AC2）。名前付き session なら常に、既定の session は名前付き session が
 * 1 つでもあるとき（切り替えの入口）だけ出す。押すと session の一覧（`SessionSwitchDialog`）。
 */
const sessionLabel = computed(() => {
  // ほかのマシンを選んでいる間は出さない（そのマシンの session を手元のブラウザのホスト名では開けない。20260927-multi-host-machines）。
  if (machines.selectedId !== LOCAL_MACHINE_ID) return null;
  const name = session.host?.sessionName;
  if (name !== undefined) return name;
  return session.namedSessionCount > 0 ? "default" : null;
});

/**
 * 文字のトークンのクラス（今の DOM を写す。20260927-sidebar-row-tokens の decisions D3）。主の行（1 行目）は `sidebar-label`（省略記号で切る）、
 * 補足の行は付けた名前・未検証だけが自分のクラスを持つ（薄めない・警告色）。
 */
function textTokenClass(token: string, lineIndex: number): string | undefined {
  if (lineIndex === 0) return "sidebar-label";
  if (token === "name") return "sidebar-agent-name";
  if (token === "unverified") return "sidebar-unverified";
  return undefined;
}

/**
 * 文字のトークンの属性（クラスと style）。**無いものはキーごと付けない**——`:class="undefined"` は空の `class=""` を描き、今の DOM
 * （クラスの無い `<span>`）から変わる（golden の比較で見つけた）。
 */
function textTokenAttrs(t: { token: string; style: Parameters<typeof tokenStyleAttr>[0] }, lineIndex: number): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const cls = textTokenClass(t.token, lineIndex);
  if (cls !== undefined) attrs["class"] = cls;
  const style = tokenStyleAttr(t.style);
  if (style !== undefined) attrs["style"] = style;
  return attrs;
}

/** 並び順の表示名。内部の値（`grouped` / `priority`）をそのまま出さない（decisions.md D6）。 */
const AGENT_SORT_LABEL: Record<AgentSort, string> = { grouped: "グループ順", priority: "優先度順" };

const agents = computed(() => {
  const rows = [...session.panes.values()]
    .filter((p) => p.agent)
    .map((p) => {
      const tab = session.tabs.get(p.tabId);
      const ws = tab ? session.workspaces.get(tab.workspaceId) : undefined;
      const agent = p.agent!;
      const state = displayStateFor(agent, seen.getSeenSeq(agent.instanceId, agent.serverSeenSeq));
      const lines = resolveAgentLines(settings.agentsLayout, { pane: p, tab, workspace: ws, agent, state });
      return { pane: p, tab, workspace: ws, agent, state, lines };
    });
  const rowsByPaneId = new Map(rows.map((r) => [r.pane.id, r]));
  // 並び順は `orderedAgentPaneIds`（`ActionDispatcher` の `previous_agent`/`next_agent`/`focus_agent` と
  // 共有。decisions D4）——表示順と操作対象順を構造的に一致させる。
  const entries = rows.map((r) => ({ paneId: r.pane.id, state: r.state, since: r.agent.since }));
  return orderedAgentPaneIds(entries, view.agentSort).map((id) => rowsByPaneId.get(id)!);
});

/** サイドバーでの選択（M1・AC-I4・AC7）。design「フォーカス系の方式」：自分の表示を変え、サーバの
 *  「最後の選択」も更新する（ほかのクライアントの表示は動かさない）。 */
function focusWorkspace(workspaceId: string): void {
  const ws = session.workspaces.get(workspaceId);
  if (!ws) return;
  const tab = session.tabs.get(ws.activeTabId);
  view.setView(workspaceId, ws.activeTabId);
  if (tab) view.focusPane(tab.focusedPaneId);
  void conn?.request("workspace.focus", { workspaceId }).catch(() => undefined);
}

function focusPane(paneId: string, tabId: string, workspaceId: string): void {
  view.setView(workspaceId, tabId);
  view.focusPane(paneId);
  void conn?.request("pane.focus", { paneId }).catch(() => undefined);
}

/** グループのヘッダー行（グループ）は `group` メニュー、それ以外（workspace を持つ行）は
 *  `workspace` メニュー（20260923-workspace-grouping）。 */
function onRowContextMenu(ev: MouseEvent, row: SpaceRow): void {
  ev.preventDefault();
  if (row.workspace) actions?.openContextMenu({ kind: "workspace", workspaceId: row.workspace.id }, { x: ev.clientX, y: ev.clientY });
  else if (row.groupTargetId) actions?.openContextMenu({ kind: "group", groupId: row.groupTargetId }, { x: ev.clientX, y: ev.clientY });
}

/**
 * navigate モード中の「メニューを開く」要求（`ActionDispatcher.navigate("openMenu")`。
 * 20260925-sidebar-keyboard-menu。design「振る舞いの詳細」手順4）。要求は先に消してから
 * （一度きりのトリガー保証。design「エラー処理 / 異常系」）、選択中の行の DOM を
 * `data-drop-workspace-id`（D&D 用に既存。`onRowContextMenu` と同じ target の形）で探し、
 * `getBoundingClientRect()` の位置でメニューを開く。行が見つからなければ `{x:0, y:0}` に
 * フォールバックする（`PaneFrame.vue` の `rect?.left ?? 0` と同じ防御）。
 */
watch(
  () => view.navigateMenuRequested,
  (requested) => {
    if (!requested) return;
    const selected = view.navigateSelection;
    view.clearNavigateMenuRequest();
    if (!selected) return;
    // 見出しを選んでいればグループのメニュー（行は `data-workspace-row-key="group:<id>"`）。
    const groupId = groupIdOfNavigateKey(selected);
    // 別の画面で消されたグループが選択に残っていたら、メニューは開かず選択を外す。
    if (groupId !== null && !session.groups.has(groupId)) {
      view.setNavigateSelection(null);
      return;
    }
    const rowEl = el.value?.querySelector<HTMLElement>(groupId !== null ? `[data-workspace-row-key="${selected}"]` : `[data-drop-workspace-id="${selected}"]`);
    const rect = rowEl?.getBoundingClientRect();
    const at = { x: rect?.left ?? 0, y: rect?.top ?? 0 };
    if (groupId !== null) actions?.openContextMenu({ kind: "group", groupId }, at);
    else actions?.openContextMenu({ kind: "workspace", workspaceId: selected }, at);
  },
);

/** 折りたたみの印のボタンの読み上げ名（グループと worktree グループを区別する）。 */
function toggleLabel(row: SpaceRow): string {
  const noun = row.kind === "group" ? "グループ" : "worktree グループ";
  return row.collapsed ? `${noun}を展開` : `${noun}を折りたたむ`;
}

/** グループの頭の折りたたみアイコン。グループはサーバに永続化（RPC）、worktree グループは
 *  ブラウザだけ（`view.toggleAutoGroupCollapsed`。20260923-workspace-grouping）。 */
function onToggleCollapse(row: SpaceRow): void {
  if (!row.groupTargetId) return;
  if (row.groupKind === "manual") actions?.toggleGroupCollapsed(row.groupTargetId);
  else view.toggleAutoGroupCollapsed(row.groupTargetId);
}

/**
 * ボタンの Enter/Space を `main.ts` の window keydown（prefix・直接のキーの経路）へ二重に
 * 渡さない（20260925-focus-trapped-keybindings。design「設計方針」）。`preventDefault()`
 * はしない——ネイティブな活性化（`click`）は妨げない。他のキー（修飾付き・矢印・Tab 等）は
 * 何もせず bubble させ、`main.ts` へ届かせる。
 */
function onButtonKeydown(ev: KeyboardEvent): void {
  if ((ev.key === "Enter" || ev.key === " ") && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
    ev.stopPropagation();
  }
}

/** 新しい workspace を作る。キーの `prefix+shift+n` と同じ経路（`ActionDispatcher.run`）を通す。 */
function onNewWorkspace(): void {
  actions?.run({ type: "newWorkspace" });
}

/** 全体のメニューを、押したボタンの位置に開く（`ContextMenu` が中身と操作を引き受ける）。 */
function onOpenGlobalMenu(ev: MouseEvent): void {
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  actions?.openContextMenu({ kind: "global" }, { x: rect.left, y: rect.top });
}

// --- workspace 行の D&D（20260923-workspace-grouping。`PaneFrame.vue` の名前ラベルの D&D と同じ形）---

const WORKSPACE_DRAG_THRESHOLD_PX = 6;
let workspaceDragStart: { x: number; y: number; pointerId: number; row: SpaceRow } | null = null;

function onEscapeDuringWorkspaceDrag(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  cancelWorkspaceDrag();
}

function cancelWorkspaceDrag(): void {
  workspaceDragStart = null;
  if (view.workspaceDrag) view.endWorkspaceDrag();
  window.removeEventListener("keydown", onEscapeDuringWorkspaceDrag);
}

/**
 * `document.elementFromPoint` から最も近い `[data-workspace-row-key]` 祖先の行 key を求める
 * （`PaneFrame.vue` の `dropTargetAt` と同じ形の `closest` 探索）。**`row.key` を使う**（タスク点検の指摘）——
 * `dropAnchorId`（workspace id）は、グループのヘッダー行とその先頭メンバー行で同じ値に
 * なりうる（ヘッダーの `dropAnchorId` は先頭メンバーの id をそのまま使うため）ので、ホバー中の
 * 行を一意に特定できない。`row.key` は常に一意（`group:<id>` または workspace id そのもの）。
 */
function workspaceRowKeyAt(x: number, y: number): string | null {
  const target = document.elementFromPoint(x, y);
  return (target?.closest("[data-workspace-row-key]") as HTMLElement | null)?.dataset.workspaceRowKey ?? null;
}

function sameItem(a: ItemTarget, b: ItemTarget): boolean {
  if (a.kind === "group") return b.kind === "group" && a.groupId === b.groupId;
  if (a.kind === "ungrouped") return b.kind === "ungrouped";
  return b.kind === "workspace" && a.workspaceId === b.workspaceId;
}

/**
 * ホバー中の行の上へ落とせるか（20261004-group-worktree-items。design「画面」のドラッグ）。動くのは掴んだ行の項目
 * （子を掴めばその worktree グループ）で、落とせるのは**同じ入れ物**（一番上・同じグループの中）の項目の間だけ。
 * 自分の項目の上は何も起きない（`self`。印も出さない）。名前順のときの一番上は並べ替えを受け付けない
 * （見た目が名前で決まり、送っても変わらないため。グループの中は並べ替えられる）。
 * `reason` は離したときの知らせ（落とせる・自分の上のときは null）。
 */
function dropStateFor(dragged: SpaceRow, key: string | null): { row: SpaceRow; self: boolean; reason: string | null } | null {
  if (!key) return null;
  const row = spaces.value.find((r) => r.key === key);
  if (!row) return null;
  // 古いサーバ（`layout` が無い）は落とし先の workspace が要る。無い行（メンバーのいない空のグループ）は落とし先にならない（印も出さず、離しても何も起きない）。
  if (!session.hasServerLayout && row.dropAnchorId === null) return null;
  // 自分の項目の上（掴んだグループの中の行も含む）は何も起きない。
  if (sameItem(row.item, dragged.item) || (dragged.item.kind === "group" && row.container === dragged.item.groupId)) return { row, self: true, reason: null };
  if (row.container !== dragged.container) return { row, self: false, reason: "同じグループの中、または一番上の項目の間でだけ並べ替えできます" };
  if (dragged.container === null && view.workspaceSort === "name") return { row, self: false, reason: "名前順では並べ替えできません" };
  return { row, self: false, reason: null };
}

function onRowPointerDown(ev: PointerEvent, row: SpaceRow): void {
  workspaceDragStart = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId, row };
  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
}

function onRowPointerMove(ev: PointerEvent): void {
  if (!workspaceDragStart || ev.pointerId !== workspaceDragStart.pointerId) return;
  if (!view.workspaceDrag) {
    const dx = ev.clientX - workspaceDragStart.x;
    const dy = ev.clientY - workspaceDragStart.y;
    if (Math.hypot(dx, dy) < WORKSPACE_DRAG_THRESHOLD_PX) return;
    // 古いサーバで空のグループは動かす workspace が無く、`workspace.move_to` に空の配列を送ってしまう。掴めない。
    if (!session.hasServerLayout && workspaceDragStart.row.dragIds.length === 0) return;
    view.startWorkspaceDrag(workspaceDragStart.row.dragIds);
    window.addEventListener("keydown", onEscapeDuringWorkspaceDrag);
  }
  const state = dropStateFor(workspaceDragStart.row, workspaceRowKeyAt(ev.clientX, ev.clientY));
  if (!state || state.self) view.setWorkspaceDragOver(null);
  else view.setWorkspaceDragOver(state.row.key, state.reason !== null);
}

/**
 * 離した：ドラッグ済みならドロップを確定、閾値未満ならクリック（行を押したのと同じ扱い）。
 * **動かす対象は `workspaceDragStart.row.dragIds`（ドラッグ開始時点のスナップショット）を使う**
 * （タスク点検の指摘）——引数の `row` はテンプレートの束縛から来る現在の値で、ドラッグ中に
 * `spaces` が再計算される（他クライアントの操作でグループ構成が変わる等）と、ハイライトで
 * 見せていた対象と実際に動かす対象がずれうる。
 */
function onRowPointerUp(ev: PointerEvent, row: SpaceRow): void {
  if (!workspaceDragStart || ev.pointerId !== workspaceDragStart.pointerId) return;
  const wasDragging = !!view.workspaceDrag;
  const draggedRow = workspaceDragStart.row;
  const drop = wasDragging ? dropStateFor(draggedRow, workspaceRowKeyAt(ev.clientX, ev.clientY)) : null;
  workspaceDragStart = null;
  if (wasDragging) {
    view.endWorkspaceDrag();
    window.removeEventListener("keydown", onEscapeDuringWorkspaceDrag);
    // 行の外・自分の項目の上で離したときは取り消し（何も送らず、知らせない）。落とせない行の上では送らず知らせる。
    if (drop && !drop.self) {
      if (drop.reason !== null) view.toast(drop.reason);
      else {
        actions?.moveItemByDrag(draggedRow.item, drop.row.item, { workspaceIds: draggedRow.dragIds, beforeWorkspaceId: drop.row.dropAnchorId });
        // ドラッグした対象にフォーカスを残す（AC-I4）。頭に own workspace があるときだけ
        // （グループのヘッダー行はどの workspace でもないので、focus は動かさない）。
        if (draggedRow.workspace) focusWorkspace(draggedRow.workspace.id);
      }
    }
  } else if (row.workspace) {
    focusWorkspace(row.workspace.id);
  } else {
    onToggleCollapse(row); // グループのヘッダー行のクリックは折りたたみを切り替える
  }
}

function onRowPointerCancel(ev: PointerEvent): void {
  if (workspaceDragStart && ev.pointerId !== workspaceDragStart.pointerId) return;
  cancelWorkspaceDrag();
}

/*
 * 幅は `view.sidebarWidth`（このブラウザに残る。20260921-herdr-settings-gaps の AC1）。
 * **ドラッグ中は反映だけ**（`setSidebarWidth`）で、**保存はドラッグを終えたときに 1 回**（`commitSidebarWidth`）——
 * `pointermove` ごとに `localStorage` へ書くと、毎フレーム同期の I/O が走る。
 */
function onDividerPointerDown(ev: PointerEvent): void {
  // **畳んでいる間は幅を動かさない**。幅が効くのは展開中だけ（`nav` の style）なので、畳んだまま動かすと
  // 利用者が一度も見ていない幅が保存され、展開したときにその幅で開く（タスク点検 T6 の指摘）。
  if (view.sidebarCollapsed) return;
  const now = Date.now();
  if (now - lastDividerClick < 350) {
    // ダブルクリックで既定幅へ戻す（D56 の訂正 11）。戻した幅も覚える。
    view.setSidebarWidth(SIDEBAR_WIDTH.default);
    view.commitSidebarWidth();
    lastDividerClick = 0;
    return;
  }
  lastDividerClick = now;
  dragging = true;
  dragStartX = ev.clientX;
  dragStartWidth = view.sidebarWidth;
  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
}

function onDividerPointerMove(ev: PointerEvent): void {
  if (!dragging) return;
  view.setSidebarWidth(dragStartWidth + (ev.clientX - dragStartX)); // 範囲に収めるのはストア
}

/**
 * ドラッグを終えて、**見えている幅を覚える**。`pointerup` だけでなく `pointercancel`・`lostpointercapture` でも
 * 呼ぶ——取り消されたドラッグでも見えている幅を保存する（戻す先の値を持っていないうえ、見えている幅と保存値が
 * 食い違うほうが分かりにくい）。`pointerup` の後にも `lostpointercapture` が来るが、2 回目は何もしない。
 */
function endDrag(): void {
  if (!dragging) return;
  dragging = false;
  view.commitSidebarWidth();
}

/*
 * **ドラッグ中にダイアログが開いたら、その時点で終えて保存する**（AC-I5）。`showModal()` で文書が inert になったとき、
 * ポインタの捕捉が外れるのか・捕捉先へ `pointerup` が届き続けるのかは確かめた出所が無い。分からない挙動に頼らない。
 * workspace の D&D も同じ理由で同じタイミングに取り消す（20260923-workspace-grouping）。
 */
watch(
  () => view.modalOpen, // グラフ画面（20260927-agent-graph）も同じ
  (open) => {
    if (open) {
      endDrag();
      if (view.workspaceDrag) cancelWorkspaceDrag();
    }
  },
);
</script>

<template>
  <nav ref="el" class="sidebar" :class="{ 'sidebar-collapsed': view.sidebarCollapsed }" :style="view.sidebarCollapsed ? {} : { width: `${view.sidebarWidth}px` }">
    <div v-if="sessionLabel !== null" class="sidebar-session">
      <button
        type="button"
        class="sidebar-btn sidebar-session-btn"
        aria-haspopup="dialog"
        :aria-label="`session: ${sessionLabel}（押すと session の一覧）`"
        :title="`session: ${sessionLabel}`"
        @click="actions?.openSessionSwitcher()"
        @keydown="onButtonKeydown"
      >
        <template v-if="view.sidebarCollapsed">⇄</template>
        <template v-else>session: {{ sessionLabel }} ⇄</template>
      </button>
    </div>
    <section class="sidebar-spaces" aria-label="spaces">
      <div v-if="!view.sidebarCollapsed" class="sidebar-section-header">
        <span class="sidebar-section-title">spaces</span>
        <button type="button" class="sidebar-btn sidebar-sort-btn" :aria-label="`並び順: ${WORKSPACE_SORT_LABEL[view.workspaceSort]}（押すと切り替え）`" @click="view.toggleWorkspaceSort()" @keydown="onButtonKeydown">
          {{ WORKSPACE_SORT_LABEL[view.workspaceSort] }}
        </button>
      </div>
      <template v-for="section in machineSections" :key="section.id">
        <MachineHeader v-if="machines.hasMachines" :machine-id="section.id" :label="section.label" :compact="view.sidebarCollapsed" />
        <template v-if="!machines.hasMachines || !machines.collapsed[section.id]">
          <template v-if="section.id === machines.selectedId">
            <div
              v-for="row in spaces"
              :key="row.key"
              class="sidebar-row"
              :class="{
                'sidebar-row-current': row.isCurrent,
                'sidebar-row-depth-2': row.depth === 2,
                'sidebar-row-selected': view.mode === 'navigate' && view.navigateSelection === row.key,
                'sidebar-row-indent': row.indent,
                'sidebar-row-drop-target': view.workspaceDrag?.overRowKey === row.key && !view.workspaceDrag.overInvalid,
                'sidebar-row-drop-invalid': view.workspaceDrag?.overRowKey === row.key && view.workspaceDrag.overInvalid,
                'sidebar-row-pane-drop-target': !!row.workspace && view.paneDrag?.overWorkspaceId === row.workspace.id,
              }"
              :data-workspace-row-key="row.key"
              :data-drop-workspace-id="row.workspace?.id"
              :aria-current="row.isCurrent ? 'true' : undefined"
              @contextmenu="onRowContextMenu($event, row)"
              @pointerdown="onRowPointerDown($event, row)"
              @pointermove="onRowPointerMove($event)"
              @pointerup="onRowPointerUp($event, row)"
              @pointercancel="onRowPointerCancel($event)"
              @lostpointercapture="onRowPointerCancel($event)"
            >
              <!-- 畳んだサイドバーとグループの見出し行は今までどおりの 1 行（行の並びの設定は展開した workspace 行だけ。herdr と同じ。
                   20260927-sidebar-row-tokens）。 -->
              <div v-for="(line, i) in view.sidebarCollapsed || !row.workspace ? [null] : row.lines" :key="i" :class="i === 0 ? 'sidebar-row-line1' : 'sidebar-row-line2'">
                <!-- pointerdown/pointerup を `.stop` で止める（タスク点検の指摘）——止めないと行の
                     onRowPointerDown/onRowPointerUp にも伝播し、`onToggleCollapse` が二重に呼ばれる
                     （グループの頭）か、意図せず focusWorkspace が呼ばれる（worktree グループの
                     頭）。`@click.stop` だけでは pointerup 側の伝播は止まらない。 -->
                <button
                  v-if="i === 0 && row.isGroupHead"
                  type="button"
                  class="sidebar-group-toggle"
                  :aria-label="toggleLabel(row)"
                  :aria-expanded="!row.collapsed"
                  @pointerdown.stop
                  @pointerup.stop
                  @click.stop="onToggleCollapse(row)"
                  @keydown="onButtonKeydown"
                >
                  {{ row.collapsed ? "▸" : "▾" }}
                </button>
                <!-- 種類の印（グループの見出し・worktree グループの先頭）。畳んだサイドバーではアイコンだけ。 -->
                <SidebarKindIcon v-if="i === 0 && (row.kind === 'group' || row.kind === 'worktreeHead')" :kind="row.kind === 'group' ? 'group' : 'worktreeGroup'" :compact="view.sidebarCollapsed" />
                <template v-if="line === null">
                  <StateIcon v-if="row.workspace" class="sidebar-state-icon" :state="row.state" />
                  <span v-if="!view.sidebarCollapsed" class="sidebar-label">{{ row.workspace ? row.workspace.label : row.groupLabel }}</span>
                </template>
                <!-- 値はテキストの差し込み（{{ }}）だけで描く（外から報告された独自トークンを HTML にしない）。style は検証済みの色と固定の値だけ。 -->
                <template v-for="(t, j) in line ?? []" v-else :key="j">
                  <StateIcon v-if="t.kind === 'state_icon'" class="sidebar-state-icon" :state="row.state" :style="tokenStyleAttr(t.style)" />
                  <template v-else-if="t.kind === 'git'">
                    <span :style="tokenStyleAttr(t.style)">{{ t.branch }}</span>
                    <span class="sidebar-git-counts" :style="tokenStyleAttr(t.style)">{{ t.counts }}</span>
                  </template>
                  <span v-else-if="t.kind === 'git_status'" class="sidebar-git-counts" :style="tokenStyleAttr(t.style)">{{ t.counts }}</span>
                  <span v-else v-bind="textTokenAttrs(t, i)">{{ t.text }}</span>
                </template>
              </div>
            </div>
          </template>
          <MachineRows v-else :machine-id="section.id" :compact="view.sidebarCollapsed" />
        </template>
      </template>

      <div v-if="!view.sidebarCollapsed" class="sidebar-section-footer">
        <button type="button" class="sidebar-btn" @click="onNewWorkspace" @keydown="onButtonKeydown">＋ 新規</button>
        <button
          type="button"
          class="sidebar-btn sidebar-btn-right"
          aria-haspopup="menu"
          :aria-expanded="globalMenuOpen ? 'true' : 'false'"
          @click="onOpenGlobalMenu"
          @keydown="onButtonKeydown"
        >
          メニュー
        </button>
      </div>
    </section>

    <section class="sidebar-agents" aria-label="agents">
      <div v-if="!view.sidebarCollapsed" class="sidebar-section-header">
        <span class="sidebar-section-title">agents</span>
        <button type="button" class="sidebar-btn sidebar-sort-btn" :aria-label="`並び順: ${AGENT_SORT_LABEL[view.agentSort]}（押すと切り替え）`" @click="view.toggleAgentSort()" @keydown="onButtonKeydown">
          {{ AGENT_SORT_LABEL[view.agentSort] }}
        </button>
      </div>
      <div v-for="{ pane, workspace, state, lines } in agents" :key="pane.id" class="sidebar-row" @click="focusPane(pane.id, pane.tabId, workspace?.id ?? '')">
        <!-- 畳んだサイドバーは今までどおり状態の印だけ（20260927-sidebar-row-tokens）。 -->
        <div v-if="view.sidebarCollapsed" class="sidebar-row-line1">
          <StateIcon class="sidebar-state-icon" :state="state" />
        </div>
        <template v-else>
          <div v-for="(line, i) in lines" :key="i" :class="i === 0 ? 'sidebar-row-line1' : 'sidebar-row-line2'">
            <template v-for="(t, j) in line" :key="j">
              <StateIcon v-if="t.kind === 'state_icon'" class="sidebar-state-icon" :state="state" :style="tokenStyleAttr(t.style)" />
              <span v-else-if="t.kind === 'text'" v-bind="textTokenAttrs(t, i)">{{ t.text }}</span>
            </template>
          </div>
        </template>
      </div>
    </section>

    <div class="sidebar-footer">
      <button
        type="button"
        class="sidebar-btn sidebar-collapse-btn"
        :aria-expanded="!view.sidebarCollapsed"
        :aria-label="view.sidebarCollapsed ? 'サイドバーを開く' : 'サイドバーを畳む'"
        @click="actions?.run({ type: 'toggleSidebar' })"
        @keydown="onButtonKeydown"
      >
        {{ view.sidebarCollapsed ? "»" : "«" }}
      </button>
    </div>

    <div
      class="sidebar-divider"
      @pointerdown="onDividerPointerDown"
      @pointermove="onDividerPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
    />
  </nav>
</template>

<style scoped>
/* 05-e2e-docs T3 の E2E で発見：この component にも `<style>` が一度も存在しなかった（PaneLayout.vue・
 * Splitter.vue・TabBar.vue と同様の欠落。D92）。状態の印の見た目は `StateIcon.vue` だけが持つ
 * （20260921-herdr-settings-gaps の D2。ここに `.sidebar-state-icon` の規則を書くと、子の根要素に効いて
 * 字形の後ろに丸が描かれる）。 */
.sidebar {
  flex: none;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* `overflow-y` を指定すると `overflow-x` も `auto` に計算されるので、横は明示して止める（AC3）。 */
  overflow-x: hidden;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border-right: 1px solid var(--soda-menu-border, #44475a);
}
.sidebar-collapsed {
  width: 3em !important;
}
.sidebar-spaces,
.sidebar-agents {
  padding: 0.5em 0;
}
.sidebar-agents {
  border-top: 1px solid var(--soda-menu-border, #44475a);
}
.sidebar-row {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  padding: 0.4em 0.8em;
  cursor: pointer;
  touch-action: none; /* D&D のポインタ操作をブラウザのスクロール・ズームに奪われないため（20260923-workspace-grouping）。 */
  /* 行の文字列（`.sidebar-label`）が D&D の掴み手を兼ねる——`PaneFrame.vue` の `.pane-frame-name` と
   * 同じ理由で選択（ハイライト）を止める（タスク点検の指摘。無いとドラッグのたびに文字が選択される）。 */
  user-select: none;
}
/* グループのメンバー・子行のインデント（20260923-workspace-grouping。herdr と同じ並び）。 */
.sidebar-row-indent {
  padding-left: calc(0.8em + 1.2em);
}
/* 入れ子の worktree グループの子（グループ → worktree グループ → 子。字下げ 2）。 */
.sidebar-row.sidebar-row-depth-2 {
  padding-left: calc(0.8em + 2.4em);
}
/* 畳んだサイドバー（3em）：印が増えた行（折りたたみ・種類・状態）は折り返して切らない。 */
.sidebar-collapsed .sidebar-row-line1 {
  flex-wrap: wrap;
  gap: 0.2em;
}
/* 字下げは 1 段まで（畳んだ幅に収まらないので、2 段目は 1 段目と同じ）。 */
.sidebar-collapsed .sidebar-row.sidebar-row-depth-2 {
  padding-left: calc(0.8em + 1.2em);
}
/* 3 つの状態を別の表し方に分ける（20260920-ui-selection-visuals の AC2）。以前は hover と
 * navigate の選択が同じ宣言で、しかもタブのアクティブと同じ色だったので見分けが付かなかった。
 * 持続する状態（表示中）は面、一時的なカーソル（navigate）は線にして、重なっても両方読めるようにする。 */
.sidebar-row:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
/* `.sidebar-row:hover` と詳細度をそろえ、後に置くことで表示中を勝たせる（一時的な状態で上書きしない）。 */
.sidebar-row.sidebar-row-current {
  background: var(--soda-menu-active-bg, #44475a);
}
.sidebar-row-selected {
  outline: 1px solid var(--soda-fg, #f8f8f2);
  outline-offset: -1px;
}
/* D&D のドロップ候補（20260923-workspace-grouping。`PaneFrame.vue` の `.pane-frame-edge-drop-target` と同じ考え方）。 */
.sidebar-row.sidebar-row-drop-target {
  outline: 2px solid var(--soda-fg, #f8f8f2);
  outline-offset: -2px;
}
/* 落とせない行（別の入れ物の上・名前順の一番上。20261004-group-worktree-items）。色に頼らず、破線と「落とせない」カーソルで示す。 */
.sidebar-row.sidebar-row-drop-invalid {
  outline: 2px dotted var(--soda-warn-fg, #ffb86c);
  outline-offset: -2px;
  cursor: not-allowed;
}
/* pane を D&D でこの workspace へ移す（20260924-pane-move-cross-tab。design「クライアント側:
 * ドロップ先の拡張」）。上の workspace 並べ替え用のドロップ候補とは別の見た目にする
 * （`PaneFrame.vue`/`TabBar.vue` と同じ accent 色）。 */
.sidebar-row.sidebar-row-pane-drop-target {
  outline: 2px dashed var(--soda-accent, #8be9fd);
  outline-offset: -2px;
}
.sidebar-row-line1 {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.sidebar-row-line2 {
  display: flex;
  gap: 0.6em;
  /*
   * 1 行目のラベルにそろえる：状態の印の箱（1em。StateIcon.vue）＋ 1 行目の間隔（0.5em）＝ 行の 1.5em。
   * この行は `font-size: 0.85em` なので、`em` はその小さい文字で数えられる——割り戻す（以前の 1.1em はこれを
   * 忘れていて 2.3px ずれていた）。
   */
  padding-left: calc(1.5em / 0.85);
  font-size: 0.85em;
}
/* 長いブランチ名・エージェント名を省略記号で切る（AC3）。flex アイテムに overflow があると
 * main 軸の自動最小サイズが 0 になって縮む——1 行目の `.sidebar-label` と同じ仕組み。 */
.sidebar-row-line2 > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 補足（ブランチ・エージェント名）は薄く描く。薄めるのは行ではなく 1 つずつ——警告（未検証）まで薄めると、明るいテーマなどで
   * agents の行の下地（menu-bg・hover）の上で WCAG 1.4.3 の 4.5:1 を割る。規則は全テーマ同じで、dracula でも警告は薄めない
   * （20260921-theme-settings の review ラウンド 2・3、decisions D16）。 */
  opacity: 0.75;
}
.sidebar-row-line2 > .sidebar-unverified {
  opacity: 1;
}
/* 利用者が付けた名前（agent rename）は、どのエージェントかを見分ける主な手がかりなので薄めない。 */
.sidebar-row-line2 > .sidebar-agent-name {
  opacity: 1;
}
/* 縮めると意味を失うので縮ませない。 */
.sidebar-git-counts {
  flex: none;
}
.sidebar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-unverified {
  flex: none;
  color: var(--soda-warn-fg, #ffb86c);
}
/* グループの折りたたみアイコン（20260923-workspace-grouping）。行のクリック領域とは別にする
 * （`@click.stop`）——アイコンを押しても行全体のクリック（フォーカス/折りたたみ）を二重に起こさない。 */
.sidebar-group-toggle {
  flex: none;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  width: 1em;
  cursor: pointer;
}
/* 以前は `right: -3px` で外へ 3px はみ出しており、文字が 1 つも無くても横スクロールバーが出ていた
 * （decisions.md D3）。幅の変更は移動量の差分で決まるので、内側へ寄せても操作感は変わらない。 */
/* ボタンの帯（20260920-sidebar-tabbar-controls）。`.sidebar-divider` が右端 6px を縦一杯に覆うので、
 * その分だけ内側に寄せてボタンがつまみの下に潜らないようにする。 */
.sidebar-section-footer,
.sidebar-section-header,
.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 0.4em;
  flex: none;
  padding: 0.2em 0.8em;
  padding-right: calc(0.8em + 6px);
}
.sidebar-section-header {
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
/* 内容が短いときは下端へ寄る。`.sidebar` の overflow は動かさない（decisions.md D3）。 */
.sidebar-footer {
  margin-top: auto;
  justify-content: flex-end;
}
.sidebar-section-title {
  font-size: 0.85em;
  opacity: 0.75;
}
.sidebar-btn {
  font: inherit;
  font-size: 0.85em;
  color: var(--soda-fg, #f8f8f2);
  background: none;
  border: none;
  padding: 0.2em 0.4em;
  border-radius: 2px;
  cursor: pointer;
  white-space: nowrap;
}
.sidebar-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.sidebar-btn-right,
.sidebar-sort-btn {
  margin-left: auto;
}
.sidebar-session {
  flex: none;
  padding: 0.2em 0.8em;
  /* 右端のつまみ（.sidebar-divider）の分を空ける（.sidebar-section-header と同じ）。 */
  padding-right: calc(0.8em + 6px);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
/* 畳んだ幅（3em）では左右の余白を詰めて ⇄ が … に切れないようにする。 */
.sidebar-collapsed .sidebar-session {
  padding-inline: 0.2em;
}
.sidebar-session-btn {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-collapse-btn {
  padding: 0.2em 0.5em;
}
.sidebar-divider {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}
</style>
