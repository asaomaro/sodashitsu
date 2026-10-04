import type {
  AgentInfo,
  AgentIntegrationKind,
  AgentSessionRef,
  Dir,
  GitInfo,
  GroupId,
  HostInfo,
  IdKind,
  ItemRef,
  NextIdCounters,
  Pane,
  PaneId,
  PaneStatus,
  RightClickTarget,
  SessionFocus,
  SessionLimits,
  SessionSnapshot,
  SidebarLayout,
  SplitDirection,
  SplitId,
  Tab,
  TabId,
  Workspace,
  WorkspaceGroup,
  WorkspaceId,
} from "@sodashitsu/protocol";
import { formatId } from "@sodashitsu/protocol";
import {
  addItemToGroup,
  deleteGroupFromLayout,
  flattenWorkspaceIds,
  insertItem,
  itemRefOf,
  layoutFromLegacy,
  removeItem,
  removeItemFromGroup,
} from "@sodashitsu/client-core";
import * as Layout from "./LayoutTree.js";
import type { SessionFileGroup, SessionFileWorkspace } from "../persist/SessionFile.js";

/** 新しい pane を作るときに、呼び出し側（SessionService）が用意して渡す実行時の情報。 */
export interface NewPaneInit {
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  label?: string | null;
  status?: PaneStatus;
  failure?: string | null;
}

export interface CreateWorkspaceResult {
  workspace: Workspace;
  tab: Tab;
  pane: Pane;
}
export interface CreateTabResult {
  tab: Tab;
  pane: Pane;
}
export interface SplitPaneResult {
  pane: Pane;
}
/** pane/tab/workspace を閉じたときに、実際に消えた id を呼び出し側へ返す（PTY の破棄・購読の後始末に使う）。
 *  workspace が 0 個になったときの自動作成（D24）は、PTY の起動を伴うため `SessionService` の責務にした
 *  （SessionModel は副作用なし。「はじめに作りかけた版で SessionModel に持たせたのは層の越境だった」ので直した）。 */
export interface RemovalResult {
  removedPaneIds: PaneId[];
  /** 連鎖で一緒に消えた tab の id（閉じた順）。要求した pane/tab/workspace 自身の閉鎖で消えた tab も含む
   *  （D42：直接 `closeWorkspace` した場合は複数になりうるため、単数の `closedTabId` から複数形に直した）。 */
  removedTabIds: TabId[];
  closedWorkspaceId: WorkspaceId | null;
  /**
   * 削除された pane に focus していたクライアントが選ぶべき後継 pane（20260925-pane-replace-
   * focus-hint）。`replacePane`（生存した pane が常に後継）と、`closePane` に後継の希望を渡して
   * それが残っていたとき（20260926-edit-scrollback）だけが埋める。他の操作は設定しない——キーごと無く、
   * クライアント側は既存の DFS-first-leaf の規則にフォールバックする。
   */
  successorPaneId?: PaneId;
}

/**
 * 1 回の操作の間に変わった、サイドバーまわりの状態（20261004-group-worktree-items）。`SessionModel.takeChanges()` が返し、
 * `SessionService` の共通の出口がイベント（`workspace.updated`・`sidebar.layout_changed`・`workspace.order_changed`）にして配る。
 */
export interface ModelChanges {
  /** 実効の `groupId` が変わった workspace（新しく入った・消えたものは含めない。それぞれ `workspace.created`・`workspace.closed` が運ぶ）。 */
  updated: Workspace[];
  /** レイアウトが変わったときだけ、新しいレイアウト。 */
  layout: SidebarLayout | null;
  /** workspace の平らな順が変わったときだけ、新しい全順序。 */
  order: WorkspaceId[] | null;
}

/** 変わる前の状態の控え（`beginChange`）。 */
interface ChangeBaseline {
  layout: SidebarLayout;
  order: WorkspaceId[];
  groupIds: Map<WorkspaceId, GroupId | null>;
}

/** 項目が今いる入れ物（`null` は一番上、無ければ undefined）。 */
function containerOf(layout: SidebarLayout, ref: ItemRef): GroupId | null | undefined {
  if (layout.top.includes(ref)) return null;
  for (const [groupId, list] of Object.entries(layout.groups)) if (list.includes(ref)) return groupId;
  return undefined;
}

/** 入れ物の `index` 番目へ項目を入れる（範囲外は末尾）。すでにその入れ物にあれば何もしない。 */
function insertAt(layout: SidebarLayout, ref: ItemRef, container: GroupId | null, index: number): SidebarLayout {
  const list = container === null ? layout.top : layout.groups[container];
  if (!list || list.includes(ref)) return layout;
  const next = [...list];
  next.splice(index < 0 || index > next.length ? next.length : index, 0, ref);
  return container === null ? { top: next, groups: layout.groups } : { top: layout.top, groups: { ...layout.groups, [container]: next } };
}

/** 判定の 3 つの結果（`GitInfoPoller.probe`）。`unknown` は取れなかった（直前の判定を保つ）。 */
export type GitJudgement = { kind: "git"; git: GitInfo } | { kind: "unmanaged" } | { kind: "unknown" };

/** 項目の判定（`repoKey`・`isLinkedWorktree`）が変わったか。ブランチ・件数だけの変化は含めない。 */
export function gitIdentityChanged(a: GitInfo | null, b: GitInfo | null): boolean {
  return (a?.repoKey ?? null) !== (b?.repoKey ?? null) || (a?.isLinkedWorktree ?? null) !== (b?.isLinkedWorktree ?? null);
}

function sameLayout(a: SidebarLayout, b: SidebarLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class NotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

/** `tokens` を差し替えた写し（null なら項目ごと除く）。元のオブジェクトは変えない（model は置き換えで更新する）。 */
function withTokens<T extends { tokens?: Record<string, string> }>(obj: T, tokens: Record<string, string> | null): T {
  const next = { ...obj };
  if (tokens === null) delete next.tokens;
  else next.tokens = tokens;
  return next;
}

/**
 * workspace / tab / pane の保持と操作（architecture.md「SessionModel」）。
 * **副作用なし**：PTY の起動・破棄、イベントの発行、永続化はここでは行わない（`SessionService` の責務。T17）。
 * ここが持つのは、レイアウト木（`LayoutTree`。純関数）を使ったデータの整合性だけ。
 */
export class SessionModel {
  private readonly workspaces = new Map<WorkspaceId, Workspace>();
  private readonly tabs = new Map<TabId, Tab>();
  private readonly panes = new Map<PaneId, Pane>();
  private readonly groups = new Map<GroupId, WorkspaceGroup>();
  /**
   * サイドバーの項目の並び（サーバが正。20261004-group-worktree-items）。`null` は**仮の状態**（`layout` を持たない保存から復元した直後）:
   * 並びは持たず、読むたびに `layoutFromLegacy` で導く（`getLayout`）。最初に書き換える操作の前に `confirmLayout` で確定する。
   * 新しく始めたサーバは空のレイアウトを持つ。
   */
  private layout: SidebarLayout | null = { top: [], groups: {} };
  /** リポジトリの所属（`repoKey` → グループ）。開いていないリポジトリの分も残す。`Workspace.groupId`（実効の所属）はここから計算する。 */
  private readonly repoGroups = new Map<string, GroupId>();
  private baseline: ChangeBaseline | null = null;
  private nextIdCounters: NextIdCounters = { w: 1, t: 1, p: 1, s: 1, a: 1, g: 1 };
  private focus: SessionFocus | null = null;

  // --- id -----------------------------------------------------------------

  nextId(kind: IdKind): string {
    const n = this.nextIdCounters[kind];
    this.nextIdCounters = { ...this.nextIdCounters, [kind]: n + 1 };
    return formatId(kind, n);
  }

  getNextIdCounters(): NextIdCounters {
    return { ...this.nextIdCounters };
  }

  /** 復元時に、保存されていた `nextId` を引き継ぐ（新規採番と衝突しないように）。 */
  setNextIdCounters(counters: NextIdCounters): void {
    this.nextIdCounters = { ...counters };
  }

  // --- lookups --------------------------------------------------------------

  getWorkspace(id: WorkspaceId): Workspace | undefined {
    return this.workspaces.get(id);
  }
  getTab(id: TabId): Tab | undefined {
    return this.tabs.get(id);
  }
  getPane(id: PaneId): Pane | undefined {
    return this.panes.get(id);
  }
  listWorkspaces(): Workspace[] {
    return [...this.workspaces.values()];
  }
  getGroup(id: GroupId): WorkspaceGroup | undefined {
    return this.groups.get(id);
  }
  listGroups(): WorkspaceGroup[] {
    return [...this.groups.values()];
  }
  listTabs(): Tab[] {
    return [...this.tabs.values()];
  }
  listPanes(): Pane[] {
    return [...this.panes.values()];
  }
  getFocus(): SessionFocus | null {
    return this.focus;
  }

  private requireWorkspace(id: WorkspaceId): Workspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new NotFoundError("workspace", id);
    return ws;
  }
  private requireTab(id: TabId): Tab {
    const tab = this.tabs.get(id);
    if (!tab) throw new NotFoundError("tab", id);
    return tab;
  }
  private requirePane(id: PaneId): Pane {
    const pane = this.panes.get(id);
    if (!pane) throw new NotFoundError("pane", id);
    return pane;
  }
  private requireGroup(id: GroupId): WorkspaceGroup {
    const group = this.groups.get(id);
    if (!group) throw new NotFoundError("group", id);
    return group;
  }

  // --- creation ---------------------------------------------------------------

  /** `Pane` オブジェクトの組み立て（`createWorkspace`/`createTab`/`splitPane`/`restoreWorkspace` で共通）。 */
  private makePane(id: PaneId, tabId: TabId, init: NewPaneInit): Pane {
    return {
      id,
      tabId,
      label: init.label ?? null,
      cwd: init.cwd,
      shell: init.shell,
      cols: init.cols,
      rows: init.rows,
      status: init.status ?? "running",
      failure: init.failure ?? null,
      busy: false,
      title: "",
      rightClick: "herdr",
      agent: null,
      agentSession: null,
    };
  }

  /**
   * `workspace.create` の前半：id を払い出しオブジェクトを組み立てるだけで、まだ Map には入れない
   * （呼び出し側が PTY の起動を確認してから `commitWorkspace` で入れる。D37「成功を確認してから
   * モデルを更新する順にする」——`splitPane` の `reserveNextPaneId` と同じ考え方を workspace/tab にも揃えた）。
   */
  reserveWorkspace(cwd: string, label: string, autoLabel: boolean, init: NewPaneInit): CreateWorkspaceResult {
    const workspaceId = this.nextId("w");
    const tabId = this.nextId("t");
    const paneId = this.nextId("p");

    const pane = this.makePane(paneId, tabId, init);
    const tab: Tab = {
      id: tabId,
      workspaceId,
      label: "1",
      layout: { type: "pane", paneId },
      focusedPaneId: paneId,
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    };
    const workspace: Workspace = {
      id: workspaceId,
      label,
      cwd,
      tabIds: [tabId],
      activeTabId: tabId,
      groupId: null,
      git: null,
      autoLabel,
    };
    return { workspace, tab, pane };
  }

  /** `reserveWorkspace` が組み立てたオブジェクトを実際に Map へ入れ、focus する。 */
  commitWorkspace(result: CreateWorkspaceResult): void {
    this.beginChange();
    this.workspaces.set(result.workspace.id, result.workspace);
    // 判定前の workspace は `w:<id>` を一番上の末尾へ（仮の状態なら導くので何もしない）。
    if (this.layout) this.layout = insertItem(this.layout, `w:${result.workspace.id}`, null);
    this.tabs.set(result.tab.id, result.tab);
    this.panes.set(result.pane.id, result.pane);
    this.focus = { workspaceId: result.workspace.id, tabId: result.tab.id, paneId: result.pane.id };
  }

  /** workspace を、最初の tab・pane ごと作る（`workspace.create`）。PTY の起動確認が要らない
   *  呼び出し元（テスト等）向けの一括版。実運用の `SessionService` は `reserveWorkspace`/`commitWorkspace` を使う。
   *  名前は既定で付けた名前（`autoLabel: false`。テストが名前を渡して作るため）。 */
  createWorkspace(cwd: string, label: string, init: NewPaneInit, autoLabel = false): CreateWorkspaceResult {
    const result = this.reserveWorkspace(cwd, label, autoLabel, init);
    this.commitWorkspace(result);
    return result;
  }

  /** `autoLabel` は省略できない——入れ忘れると自動の名前が付けた名前として固定される（20260921-workspace-auto-label の design D2）。 */
  renameWorkspace(id: WorkspaceId, label: string, autoLabel: boolean): Workspace {
    const ws = this.requireWorkspace(id);
    const updated = { ...ws, label, autoLabel };
    this.workspaces.set(id, updated);
    return updated;
  }

  focusWorkspace(id: WorkspaceId): void {
    const ws = this.requireWorkspace(id);
    const tab = this.requireTab(ws.activeTabId);
    this.setFocus(ws.id, tab.id, tab.focusedPaneId);
  }

  /** `tab.create` の前半。workspace を省略すると、直近にフォーカスした workspace を使う。
   *  まだ Map には入れない（`commitTab` で入れる。`reserveWorkspace` と同じ理由）。 */
  reserveTab(workspaceId: WorkspaceId | undefined, label: string | undefined, init: NewPaneInit): CreateTabResult {
    const wsId = workspaceId ?? this.focus?.workspaceId;
    if (!wsId) throw new NotFoundError("workspace", "(none focused)");
    const ws = this.requireWorkspace(wsId); // 予約時点では存在を確認するだけ（実際に生きているかは commit 時に取り直す）

    const tabId = this.nextId("t");
    const paneId = this.nextId("p");
    const pane = this.makePane(paneId, tabId, init);
    const tab: Tab = {
      id: tabId,
      workspaceId: ws.id,
      label: label ?? String(ws.tabIds.length + 1),
      layout: { type: "pane", paneId },
      focusedPaneId: paneId,
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    };
    return { tab, pane };
  }

  /**
   * `reserveTab` が組み立てたオブジェクトを実際に Map へ入れる。
   * PTY の起動確認の間（`await`）に workspace が閉じられている可能性があるので、workspace の存在を
   * ここで**取り直して**確認する（`reserveTab` 時点の参照を使い回さない）。無ければ `NotFoundError`
   * ——呼び出し側（`SessionService`）は孤児化した PTY を破棄する。
   */
  commitTab(result: CreateTabResult): void {
    const ws = this.requireWorkspace(result.tab.workspaceId);
    this.tabs.set(result.tab.id, result.tab);
    this.panes.set(result.pane.id, result.pane);
    this.workspaces.set(ws.id, { ...ws, tabIds: [...ws.tabIds, result.tab.id], activeTabId: result.tab.id });
    this.setFocus(ws.id, result.tab.id, result.pane.id);
  }

  /** `tab.create`。PTY の起動確認が要らない呼び出し元（テスト等）向けの一括版。
   *  実運用の `SessionService` は `reserveTab`/`commitTab` を使う。 */
  createTab(workspaceId: WorkspaceId | undefined, label: string | undefined, init: NewPaneInit): CreateTabResult {
    const result = this.reserveTab(workspaceId, label, init);
    this.commitTab(result);
    return result;
  }

  renameTab(id: TabId, label: string): Tab {
    const tab = this.requireTab(id);
    const updated = { ...tab, label };
    this.tabs.set(id, updated);
    return updated;
  }

  focusTab(id: TabId): void {
    const tab = this.requireTab(id);
    const ws = this.requireWorkspace(tab.workspaceId);
    this.workspaces.set(ws.id, { ...ws, activeTabId: tab.id });
    this.setFocus(ws.id, tab.id, tab.focusedPaneId);
  }

  /** `pane.split`。`newPaneId` は呼び出し側が発行済みの id（`SessionService` が spawn 前に確保する）。 */
  splitPane(paneId: PaneId, direction: SplitDirection, ratio: number | undefined, newPaneId: PaneId, init: NewPaneInit): SplitPaneResult {
    const target = this.requirePane(paneId);
    const tab = this.requireTab(target.tabId);
    const splitId = this.nextId("s");

    const newPane = this.makePane(newPaneId, tab.id, init);
    const layout = Layout.split(tab.layout, paneId, direction, newPaneId, splitId, ratio ?? 0.5);
    this.panes.set(newPaneId, newPane);
    // 分割したら zoom を解除する（herdr の `Tab::split_pane_with_runtime` が `zoomed = false` にするのと同じ。D100）。
    // 解除しないと、新しい pane は zoom 中の別の pane に隠れたまま焦点だけが移る。
    this.tabs.set(tab.id, { ...tab, layout, zoomedPaneId: null });
    this.setFocus(tab.workspaceId, tab.id, newPaneId, { setTabFocusedPane: true });
    return { pane: newPane };
  }

  /** 新しい pane の id を、split の前に確保したいとき用（spawn の cwd 決定などで先に id が要る場合）。 */
  reserveNextPaneId(): PaneId {
    return this.nextId("p");
  }

  /** `preferredSuccessor`: 閉じた後の tab に残っていれば、焦点の後継と `successorPaneId` にする（20260926-edit-scrollback）。 */
  closePane(paneId: PaneId, preferredSuccessor?: PaneId): RemovalResult {
    const pane = this.requirePane(paneId);
    const tab = this.requireTab(pane.tabId);
    const newLayout = Layout.remove(tab.layout, paneId);
    if (newLayout === null) {
      // 最後の pane だった → tab を閉じる（D18 の連鎖）。closeTabInternal が tab.layout から
      // 改めて葉を数えるので、ここでは pane をまだ消さない（二重カウントを避ける）。
      return this.closeTabInternal(tab.id);
    }
    this.panes.delete(paneId);
    const leaves = Layout.leaves(newLayout);
    const successor = preferredSuccessor !== undefined && leaves.includes(preferredSuccessor) ? preferredSuccessor : undefined;
    const nextFocused = tab.focusedPaneId === paneId ? successor ?? leaves[0] ?? paneId : tab.focusedPaneId;
    this.tabs.set(tab.id, {
      ...tab,
      layout: newLayout,
      focusedPaneId: nextFocused,
      zoomedPaneId: null, // pane を閉じたら zoom を解除する（herdr の `Tab::detach_pane` と同じ。D100）
    });
    if (nextFocused !== tab.focusedPaneId) this.setFocus(tab.workspaceId, tab.id, nextFocused);
    const result: RemovalResult = { removedPaneIds: [paneId], removedTabIds: [], closedWorkspaceId: null };
    if (successor !== undefined) result.successorPaneId = successor;
    return result;
  }

  closeTab(id: TabId): RemovalResult {
    return this.closeTabInternal(id);
  }

  /**
   * `tab.move`（20260923-missing-keybinding-actions。herdr の move_tab_previous/move_tab_next 相当）。
   * 対象 tab を1つ隣へ動かす（巡回込み）。`tabIds` が1個以下なら意味の無い変化なので `null` を返す
   * （design「エラー処理 / 異常系」。SessionService はこのとき `workspace.updated` を発行しない）。
   *
   * **単純な2要素 swap ではない**（coding 中に見つけた design/research の誤り。decisions.md D10）。
   * 先頭の tab を「前へ」・末尾の tab を「後ろへ」動かすときは、対象を配列の反対の端へ移し、
   * 間の要素は1つずつ詰める（herdr の `Workspace::move_tab`＝`remove(source)` して `insert(target)` と
   * 同じ結果。`herdr:src/workspace.rs:591-611`）。内側（先頭/末尾以外）のときは結果的に隣接swapと
   * 一致する。`splice` の remove→insert がこの両方を同じ式で表す。
   * `activeTabId` は id で指しているので、並べ替えでは変わらない（herdr の `active_tab`〔インデックス〕
   * を都度引き直す必要が無い。design「検討した代替案」）。
   */
  moveTab(id: TabId, direction: "previous" | "next"): Workspace | null {
    const tab = this.requireTab(id);
    const ws = this.requireWorkspace(tab.workspaceId);
    if (ws.tabIds.length <= 1) return null;
    const idx = ws.tabIds.indexOf(id);
    const last = ws.tabIds.length - 1;
    const newIdx = direction === "next" ? (idx === last ? 0 : idx + 1) : idx === 0 ? last : idx - 1;
    const tabIds = [...ws.tabIds];
    tabIds.splice(idx, 1);
    tabIds.splice(newIdx, 0, id);
    const updated = { ...ws, tabIds };
    this.workspaces.set(ws.id, updated);
    return updated;
  }

  // --- groups & workspace ordering (20260923-workspace-grouping) --------------

  /**
   * グループを作る。`target` があればその workspace の**項目**を新しいグループへ入れる（リポジトリなら丸ごと）。位置は design の決まり:
   * 対象が一番上にあればその位置にグループを置いて項目を中へ／対象がグループ G の中なら G の直後に置いて項目を移す／
   * 対象が無ければ一番上の末尾。
   */
  createGroup(label: string, target?: WorkspaceId): WorkspaceGroup {
    const ws = target !== undefined ? this.requireWorkspace(target) : undefined;
    this.beginChange();
    const layout = this.confirmedLayout();
    const id = this.nextId("g");
    const group: WorkspaceGroup = { id, label, collapsed: false };
    this.groups.set(id, group);
    const gref: ItemRef = `g:${id}`;
    const base: SidebarLayout = { top: layout.top, groups: { ...layout.groups, [id]: [] } };
    const ref = ws ? itemRefOf(ws) : null;
    const container = ref === null ? undefined : containerOf(layout, ref);
    if (ref !== null && container === null) {
      this.layout = { top: base.top.map((r) => (r === ref ? gref : r)), groups: { ...base.groups, [id]: [ref] } };
    } else if (ref !== null && container !== undefined) {
      const without = removeItem(base, ref);
      const top = [...without.top];
      const at = top.indexOf(`g:${container}`);
      top.splice(at === -1 ? top.length : at + 1, 0, gref);
      this.layout = { top, groups: { ...without.groups, [id]: [ref] } };
    } else {
      this.layout = insertItem(base, gref, null);
    }
    if (ws) this.setItemGroup(ws, id);
    this.settle();
    return group;
  }

  renameGroup(id: GroupId, label: string): WorkspaceGroup {
    const group = this.requireGroup(id);
    const updated = { ...group, label };
    this.groups.set(id, updated);
    return updated;
  }

  /** decisions.md D7：design のデータ構造（`collapsed`）にはあったが、design には変更用の
   *  メソッドが無かったための追加。**値ではなく反転を返す**（タスク点検の指摘：クライアントに
   *  今の値を読ませて反転させて送らせる形だと、応答前に連続で呼ばれたとき両方が同じ古い値から
   *  同じ結果を送ってしまう。サーバが最新の値から反転するのでその競合が起きない）。 */
  toggleGroupCollapsed(id: GroupId): WorkspaceGroup {
    const group = this.requireGroup(id);
    const updated = { ...group, collapsed: !group.collapsed };
    this.groups.set(id, updated);
    return updated;
  }

  /**
   * グループを消す。中の項目はグループのあった位置へ順に出し、`repoGroups` のそのグループ行きを全部消す
   * （メンバーの `groupId` は null に戻る）。`Workspace` は消えない。
   */
  deleteGroup(id: GroupId): void {
    this.requireGroup(id);
    this.beginChange();
    const layout = this.confirmedLayout();
    this.groups.delete(id);
    this.layout = deleteGroupFromLayout(layout, id);
    for (const [repoKey, groupId] of [...this.repoGroups]) if (groupId === id) this.repoGroups.delete(repoKey);
    this.settle();
  }

  /** workspace の**項目**（リポジトリなら丸ごと）をグループの末尾へ入れる（別のグループに居れば移す）。 */
  addToGroup(workspaceId: WorkspaceId, groupId: GroupId): Workspace {
    const ws = this.requireWorkspace(workspaceId);
    this.requireGroup(groupId);
    this.beginChange();
    const layout = this.confirmedLayout();
    this.layout = addItemToGroup(layout, itemRefOf(ws), groupId);
    this.setItemGroup(ws, groupId);
    this.settle();
    return this.workspaces.get(workspaceId)!;
  }

  /** 項目をグループから出し、一番上の、そのグループの直後へ置く。既にどのグループにも属していなくても無害（同じ結果を返すだけ）。 */
  removeFromGroup(workspaceId: WorkspaceId): Workspace {
    const ws = this.requireWorkspace(workspaceId);
    this.beginChange();
    const layout = this.confirmedLayout();
    this.layout = removeItemFromGroup(layout, itemRefOf(ws));
    this.setItemGroup(ws, null);
    this.settle();
    return this.workspaces.get(workspaceId)!;
  }

  /**
   * id が worktree 自動グループの本体（親）なら、束ねられた linked worktree の id 一覧を返す
   * （副作用なしの問い合わせ）。一括クローズ（`closeLinkedWorktrees`）の対象を求めるのに使う
   * （design「振る舞いの詳細（一括クローズ）」）。本体でなければ・git 情報が無ければ・束ねられた
   * worktree が無ければ `[]`。
   *
   * **`packages/web/src/store/workspaceGrouping.ts` の `autoGroupsOf` と全く同じ判定を行う**
   * （cross-check の指摘：以前は `groupId`（手動グループ優先。design「設計方針」）を見ておらず、
   * `ConfirmDialog` が表示する「束ねた worktree」の件数〔クライアント側の計算〕と、実際にここが
   * 閉じる件数〔サーバ側の計算〕が食い違っていた。GitInfoPoller の周期の谷間で本体が候補に
   * 無いときに先頭を暫定的に親にするフォールバックも、クライアント側にしか無く、サーバ側は
   * `isLinkedWorktree` を理由に本体でないと判定して空を返していた——`closeLinkedWorktrees` の
   * チェックが実際には何も束ねずに終わる無言の不整合になっていた）。サーバとクライアントは別
   * ランタイムで実装を共有できないので、**判定のロジック自体をここに書き写して揃える**。
   */
  linkedWorktreeGroupMembers(id: WorkspaceId): WorkspaceId[] {
    const ws = this.workspaces.get(id);
    const repoKey = ws?.git?.repoKey;
    if (!ws || !repoKey || ws.groupId !== null) return [];
    const allWorkspaces = [...this.workspaces.values()];
    // 手動グループが優先（design「設計方針」）——groupId が付いている workspace は候補から外す。
    const candidates = allWorkspaces.filter((w) => w.groupId === null && w.git?.repoKey === repoKey);
    if (candidates.length < 2) return [];
    const explicitParent = candidates.find((w) => w.git!.isLinkedWorktree === false);
    if (!explicitParent) {
      // 本体は実在するが候補から外れている（手動グループに入っている等）——誤って暫定親の
      // フォールバックへ進まない（client 側 `autoGroupsOf` と同じガード。cross-check round2 の
      // 指摘：ここが抜けていて「候補の中に本体が無ければ無条件に先頭へフォールバック」していた
      // ため、本体が手動グループにあるケースで client は「束ねるものは無い」と判断するのに
      // server 単体は「束ねるものがある」と答える食い違いが残っていた）。
      const realMainExistsElsewhere = allWorkspaces.some((w) => w.git?.repoKey === repoKey && w.git.isLinkedWorktree === false);
      if (realMainExistsElsewhere) return [];
    }
    const parentId = explicitParent ? explicitParent.id : candidates[0]!.id;
    if (parentId !== id) return []; // id は本体（親）ではない
    return candidates.filter((w) => w.id !== id).map((w) => w.id);
  }

  /**
   * 対象 workspace を1つ隣へ（巡回込み）。`moveTab`（直上）と同じ splice remove→insert
   * （decisions.md D10 と同じ理由）。workspace が1個以下なら意味の無い変化なので null
   * （design「エラー処理 / 異常系」。SessionService はこのとき配布しない）。
   */
  moveWorkspace(id: WorkspaceId, direction: "previous" | "next"): Workspace[] | null {
    this.requireWorkspace(id);
    const ids = [...this.workspaces.keys()];
    if (ids.length <= 1) return null;
    const idx = ids.indexOf(id);
    const last = ids.length - 1;
    const newIdx = direction === "next" ? (idx === last ? 0 : idx + 1) : idx === 0 ? last : idx - 1;
    ids.splice(idx, 1);
    ids.splice(newIdx, 0, id);
    this.beginChange();
    this.reorderWorkspaces(ids);
    this.syncLayoutFromOrder();
    return this.listWorkspaces();
  }

  /**
   * `workspaceIds` をまとめて `beforeWorkspaceId` の直前へ（null なら末尾）。相対順序は保つ
   * （herdr の `WorkspaceMoveBlockParams` 相当。design「振る舞いの詳細（D&D）」）。
   * `beforeWorkspaceId` が動かす対象自身を指す場合（グループの一括移動で、ドロップ先が
   * そのグループ自身のメンバーだった等）は意味の無い要求として null（design には無い
   * エッジケース——`moveTab`/`moveWorkspace` の「無変化なら null」と同じ扱いに揃えた）。
   */
  moveWorkspacesTo(workspaceIds: WorkspaceId[], beforeWorkspaceId: WorkspaceId | null): Workspace[] | null {
    for (const id of workspaceIds) this.requireWorkspace(id);
    if (beforeWorkspaceId !== null) this.requireWorkspace(beforeWorkspaceId);
    const moving = new Set(workspaceIds);
    if (beforeWorkspaceId !== null && moving.has(beforeWorkspaceId)) return null;
    const before = [...this.workspaces.keys()];
    const rest = before.filter((id) => !moving.has(id));
    const insertAt = beforeWorkspaceId === null ? rest.length : rest.indexOf(beforeWorkspaceId);
    const after = [...rest.slice(0, insertAt), ...workspaceIds, ...rest.slice(insertAt)];
    // 実質無変化（ドロップ先が既に今の位置と同じ）なら null（`moveTab`/`moveWorkspace` と同じ規約。
    // タスク点検の指摘——揃っていないと、意味の無い `workspace.order_changed` 配布と永続化書き込みが起きる）。
    if (after.every((id, i) => id === before[i])) return null;
    this.beginChange();
    this.reorderWorkspaces(after);
    this.syncLayoutFromOrder();
    return this.listWorkspaces();
  }

  /** `[...map.entries()]` を並べ替えてから作り直す（design「設計方針」）。個々の `Workspace`
   *  オブジェクトは変えない——Map の反復順（＝「開いた順」の実体）だけを変える。 */
  private reorderWorkspaces(order: WorkspaceId[]): void {
    const entries = order.map((id) => [id, this.workspaces.get(id)!] as const);
    this.workspaces.clear();
    for (const [id, ws] of entries) this.workspaces.set(id, ws);
  }

  /**
   * 平らな順の入れ替え（`moveWorkspace`・`moveWorkspacesTo`）の後に、レイアウトを今の平らな順から導き直す。
   * T8 で、この 2 つがレイアウトの操作（`item.move`・`item.move_by`）へ委ねる形になるまでのつなぎ
   * （今は平らな順が先に動くので、レイアウトを後から合わせる）。
   */
  private syncLayoutFromOrder(): void {
    if (this.layout) this.layout = layoutFromLegacy(this.listWorkspaces(), this.listGroups());
  }

  // --- サイドバーのレイアウト（20261004-group-worktree-items） -------------------------------

  /** 今のレイアウト。仮の状態（`layout` を持たない保存から復元した直後）なら、今の平らな順と `groupId` から導く。 */
  getLayout(): SidebarLayout {
    return this.layout ?? layoutFromLegacy(this.listWorkspaces(), this.listGroups());
  }

  /** レイアウトを持っているか（false は仮の状態）。 */
  hasLayout(): boolean {
    return this.layout !== null;
  }

  getRepoGroups(): ReadonlyMap<string, GroupId> {
    return this.repoGroups;
  }

  /**
   * 仮の状態を確定する（既に確定していれば何もしない）。そのときの `layoutFromLegacy` の結果をレイアウトにし、
   * グループに入っているリポジトリの所属を `repoGroups` に書く。以後は表の決まりで保つ。
   */
  confirmLayout(): void {
    if (this.layout) return;
    this.beginChange();
    this.confirmedLayout();
    this.settle();
  }

  /** 書き換える操作の入口。仮の状態なら先に確定してから、そのレイアウトを返す。 */
  private confirmedLayout(): SidebarLayout {
    if (this.layout) return this.layout;
    const layout = layoutFromLegacy(this.listWorkspaces(), this.listGroups());
    this.layout = layout;
    for (const [groupId, refs] of Object.entries(layout.groups)) {
      for (const ref of refs) if (ref.startsWith("r:")) this.repoGroups.set(ref.slice(2), groupId);
    }
    return layout;
  }

  /** workspace の項目の所属を書く。リポジトリなら `repoGroups`、そうでなければ workspace の `groupId`。`null` は所属なし。 */
  private setItemGroup(ws: Workspace, groupId: GroupId | null): void {
    const repoKey = ws.git?.repoKey;
    if (repoKey) {
      if (groupId === null) this.repoGroups.delete(repoKey);
      else this.repoGroups.set(repoKey, groupId);
    } else {
      this.workspaces.set(ws.id, { ...ws, groupId });
    }
  }

  /** 実効の `groupId`（リポジトリなら `repoGroups`、そうでなければ自分の値。無いグループは null）を全 workspace に保つ。 */
  private recomputeGroupIds(): void {
    for (const ws of this.workspaces.values()) {
      const repoKey = ws.git?.repoKey;
      const own = ws.groupId !== null && this.groups.has(ws.groupId) ? ws.groupId : null;
      const effective = repoKey ? (this.repoGroups.get(repoKey) ?? null) : own;
      if (effective !== ws.groupId) this.workspaces.set(ws.id, { ...ws, groupId: effective });
    }
  }

  /** 書き換えの後始末: 実効の `groupId` を合わせ、Map を平らな順（レイアウトを平らにしたもの）へ並べ直す。仮の状態では何もしない。 */
  private settle(): void {
    if (!this.layout) return;
    this.recomputeGroupIds();
    const order = flattenWorkspaceIds(this.layout, this.listWorkspaces());
    const current = [...this.workspaces.keys()];
    if (order.some((id, i) => id !== current[i])) this.reorderWorkspaces(order);
  }

  /** 変わる前の状態を控える（1 回の `takeChanges` までに最初の 1 回だけ）。書き換える操作は、書き換える前に呼ぶ。 */
  private beginChange(): void {
    if (this.baseline) return;
    this.baseline = {
      layout: this.getLayout(),
      order: [...this.workspaces.keys()],
      groupIds: new Map([...this.workspaces.values()].map((w) => [w.id, w.groupId])),
    };
  }

  /**
   * 前回の `takeChanges` からの変わったものを返して、控えを捨てる（副作用なしの問い合わせではなく、1 回で消える）。
   * 何も変わらなければ null。呼び出し側（`SessionService`）が共通の出口で配る。
   */
  takeChanges(): ModelChanges | null {
    const base = this.baseline;
    if (!base) return null;
    this.baseline = null;
    const layout = this.getLayout();
    const order = [...this.workspaces.keys()];
    // 順の比較は、前後どちらにも居る workspace だけで行う（作った・消したは、それぞれのイベントが運ぶ）。
    const after = new Set(order);
    const before = new Set(base.order);
    const was = base.order.filter((id) => after.has(id));
    const now = order.filter((id) => before.has(id));
    const updated = [...this.workspaces.values()].filter((w) => base.groupIds.has(w.id) && base.groupIds.get(w.id) !== w.groupId);
    const layoutChanged = !sameLayout(base.layout, layout);
    const orderChanged = was.some((id, i) => id !== now[i]);
    if (updated.length === 0 && !layoutChanged && !orderChanged) return null;
    return { updated, layout: layoutChanged ? layout : null, order: orderChanged ? order : null };
  }

  private closeTabInternal(id: TabId): RemovalResult {
    const tab = this.requireTab(id);
    const ws = this.requireWorkspace(tab.workspaceId);
    const removedPaneIds = Layout.leaves(tab.layout);
    for (const pid of removedPaneIds) this.panes.delete(pid);
    this.tabs.delete(id);

    const remainingTabIds = ws.tabIds.filter((t) => t !== id);
    if (remainingTabIds.length === 0) {
      // 最後の tab だった → workspace を閉じる（D18 の連鎖）。
      const wsResult = this.closeWorkspaceInternal(ws.id, { skipTabCleanup: true });
      return this.mergeRemoval({ removedPaneIds, removedTabIds: [id], closedWorkspaceId: null }, wsResult);
    }
    const activeTabId = ws.activeTabId === id ? remainingTabIds[0]! : ws.activeTabId;
    this.workspaces.set(ws.id, { ...ws, tabIds: remainingTabIds, activeTabId });
    if (activeTabId !== ws.activeTabId) {
      const nextTab = this.requireTab(activeTabId);
      this.setFocus(ws.id, activeTabId, nextTab.focusedPaneId);
    }
    return { removedPaneIds, removedTabIds: [id], closedWorkspaceId: null };
  }

  /** workspace が 0 個になったときの自動作成（D24）は SessionService の責務（PTY を起動できるのはそちら）。
   *  `SessionModel` はここでは何もせず、0 個で終わっても構わない。焦点が消えたら null にするだけ。 */
  closeWorkspace(id: WorkspaceId): RemovalResult {
    return this.closeWorkspaceInternal(id, { skipTabCleanup: false });
  }

  private closeWorkspaceInternal(id: WorkspaceId, opts: { skipTabCleanup: boolean }): RemovalResult {
    const ws = this.requireWorkspace(id);
    const removedPaneIds: PaneId[] = [];
    const removedTabIds: TabId[] = [];
    if (!opts.skipTabCleanup) {
      for (const tabId of ws.tabIds) {
        const tab = this.tabs.get(tabId);
        if (!tab) continue;
        removedPaneIds.push(...Layout.leaves(tab.layout));
        for (const pid of Layout.leaves(tab.layout)) this.panes.delete(pid);
        this.tabs.delete(tabId);
        removedTabIds.push(tabId);
      }
    }
    this.beginChange();
    this.workspaces.delete(id);
    this.removeFromLayout(ws);
    if (this.focus?.workspaceId === id) {
      this.focus = null;
      const first = this.workspaces.values().next();
      if (!first.done) {
        const w = first.value;
        const t = this.requireTab(w.activeTabId);
        this.focus = { workspaceId: w.id, tabId: t.id, paneId: t.focusedPaneId };
      }
    }
    return { removedPaneIds, removedTabIds, closedWorkspaceId: id };
  }

  /**
   * 消えた workspace をレイアウトから外す（モデルの削除の 1 か所。`workspace.closed` を出す 5 経路はすべてここを通る）。
   * リポジトリの項目は、同じリポジトリの workspace が他に残っていれば残す。空になった項目は外す（`repoGroups` は残す）。
   */
  private removeFromLayout(ws: Workspace): void {
    if (!this.layout) return;
    let layout = removeItem(this.layout, `w:${ws.id}`);
    const ref = itemRefOf(ws);
    if (!ref.startsWith("w:") && ![...this.workspaces.values()].some((w) => itemRefOf(w) === ref)) layout = removeItem(layout, ref);
    this.layout = layout;
    this.settle();
  }

  /** tab を閉じた結果（a）に、それが引き起こした workspace の閉鎖の結果（b）を重ねる。 */
  private mergeRemoval(a: RemovalResult, b: RemovalResult): RemovalResult {
    return {
      removedPaneIds: [...a.removedPaneIds, ...b.removedPaneIds],
      removedTabIds: [...a.removedTabIds, ...b.removedTabIds],
      closedWorkspaceId: b.closedWorkspaceId ?? a.closedWorkspaceId,
    };
  }

  /**
   * tab の器だけを消す（pane は削除しない）。`closeTabInternal` の変種
   * （20260924-pane-move-cross-tab。design「サーバ側: SessionModel」。research.md R1）——
   * `closeTabInternal` は tab の全ての葉を `this.panes` から削除するため、移動系の後始末に
   * そのまま使うと移動中の pane 自体を消してしまう。**呼び出し側が、この tab の全ての pane を
   * 既に別の場所へ移し終えていることが前提**（この関数自身は空かどうかを検査しない）。
   */
  private closeEmptyTabShell(tabId: TabId): { removedTabId: TabId; closedWorkspaceId: WorkspaceId | null } {
    const tab = this.requireTab(tabId);
    const ws = this.requireWorkspace(tab.workspaceId);
    this.tabs.delete(tabId);
    const remainingTabIds = ws.tabIds.filter((t) => t !== tabId);
    if (remainingTabIds.length === 0) {
      // 最後の tab だった → workspace も閉じる（closeTabInternal と同じ規則）。
      // `skipTabCleanup: true` を渡すため、closeWorkspaceInternal 側の pane 削除ループ自体が
      // 実行されない（「pane が残っていないから安全」ではなく、そもそもそこを通らない——
      // このメソッドが pane を一切削除しないという R1 の契約を保つのはこの skip による）。
      this.closeWorkspaceInternal(ws.id, { skipTabCleanup: true });
      return { removedTabId: tabId, closedWorkspaceId: ws.id };
    }
    const activeTabId = ws.activeTabId === tabId ? remainingTabIds[0]! : ws.activeTabId;
    this.workspaces.set(ws.id, { ...ws, tabIds: remainingTabIds, activeTabId });
    if (activeTabId !== ws.activeTabId) {
      const nextTab = this.requireTab(activeTabId);
      this.setFocus(ws.id, activeTabId, nextTab.focusedPaneId);
    }
    return { removedTabId: tabId, closedWorkspaceId: null };
  }

  /**
   * 既存の pane（`paneId`）を、別の tab（`targetTabId`）へ移す（20260924-pane-move-cross-tab。
   * design「振る舞いの詳細」）。対象 tab の focus 中の pane の右へ split で加わる。新しい pane は
   * 作らない。移動元の tab が空になったら `closeEmptyTabShell` で自動的に閉じる。
   */
  moveToTab(paneId: PaneId, targetTabId: TabId): boolean {
    const pane = this.requirePane(paneId);
    if (pane.tabId === targetTabId) return false; // 自分自身の tab（AC9）
    const targetTab = this.tabs.get(targetTabId); // 未検証のドロップ先。requireTab ではなく .get()
    if (!targetTab) return false;
    const sourceTab = this.requireTab(pane.tabId);

    const withoutPane = Layout.remove(sourceTab.layout, paneId);
    const splitId = this.nextId("s");
    const newLayout = Layout.insertAtEdge(targetTab.layout, targetTab.focusedPaneId, "right", paneId, splitId);
    this.panes.set(paneId, { ...pane, tabId: targetTabId });
    this.tabs.set(targetTabId, { ...targetTab, layout: newLayout, focusedPaneId: paneId, zoomedPaneId: null });

    if (withoutPane === null) {
      this.closeEmptyTabShell(sourceTab.id);
    } else {
      const nextFocused = sourceTab.focusedPaneId === paneId ? Layout.leaves(withoutPane)[0]! : sourceTab.focusedPaneId;
      this.tabs.set(sourceTab.id, { ...sourceTab, layout: withoutPane, focusedPaneId: nextFocused, zoomedPaneId: null });
    }
    // グローバル focus を移動先へ（20260925-pane-move-global-focus。design「設計方針」）。
    // `closeEmptyTabShell` の後に置く——先に置くと、移動元 tab が移動元 workspace の
    // activeTabId だった場合、closeEmptyTabShell 内の救済の setFocus に上書きされる。
    this.setFocus(targetTab.workspaceId, targetTabId, paneId);
    return true;
  }

  /**
   * 既存の pane（`paneId`）を、別の workspace（`targetWorkspaceId`）の新しい tab へ移す
   * （20260924-pane-move-cross-tab。design「振る舞いの詳細」）。`reserveTab`/`commitTab` と
   * 同じ label 既定値ロジックを使うが、新しい pane は作らない（既存の pane をそのまま運ぶ）。
   */
  moveToNewTab(paneId: PaneId, targetWorkspaceId: WorkspaceId): { tab: Tab } | null {
    const pane = this.requirePane(paneId);
    const ws = this.workspaces.get(targetWorkspaceId); // 未検証のドロップ先
    if (!ws) return null;
    const sourceTab = this.requireTab(pane.tabId);

    const withoutPane = Layout.remove(sourceTab.layout, paneId);
    const newTabId = this.nextId("t");
    const newTab: Tab = {
      id: newTabId,
      workspaceId: targetWorkspaceId,
      label: String(ws.tabIds.length + 1),
      layout: { type: "pane", paneId },
      focusedPaneId: paneId,
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    };
    this.panes.set(paneId, { ...pane, tabId: newTabId });
    this.tabs.set(newTabId, newTab);
    this.workspaces.set(targetWorkspaceId, { ...ws, tabIds: [...ws.tabIds, newTabId], activeTabId: newTabId });

    if (withoutPane === null) {
      this.closeEmptyTabShell(sourceTab.id);
    } else {
      const nextFocused = sourceTab.focusedPaneId === paneId ? Layout.leaves(withoutPane)[0]! : sourceTab.focusedPaneId;
      this.tabs.set(sourceTab.id, { ...sourceTab, layout: withoutPane, focusedPaneId: nextFocused, zoomedPaneId: null });
    }
    // グローバル focus を移動先へ（20260925-pane-move-global-focus。design「設計方針」）。
    // `closeEmptyTabShell` の後に置く——先に置くと（元の実装のとおり）、移動元 tab が
    // 移動元 workspace の activeTabId だった場合、closeEmptyTabShell 内の救済の setFocus に
    // 上書きされる（decisions.md 参照）。
    this.setFocus(targetWorkspaceId, newTabId, paneId);
    return { tab: newTab };
  }

  // --- pane operations --------------------------------------------------------

  focusPane(paneId: PaneId): void {
    const pane = this.requirePane(paneId);
    const tab = this.requireTab(pane.tabId);
    this.tabs.set(tab.id, { ...tab, focusedPaneId: paneId });
    const ws = this.requireWorkspace(tab.workspaceId);
    this.workspaces.set(ws.id, { ...ws, activeTabId: tab.id });
    this.setFocus(ws.id, tab.id, paneId);
  }

  renamePane(id: PaneId, label: string | null): Pane {
    const pane = this.requirePane(id);
    const updated = { ...pane, label };
    this.panes.set(id, updated);
    return updated;
  }

  setRightClick(id: PaneId, target: RightClickTarget): void {
    const pane = this.requirePane(id);
    this.panes.set(id, { ...pane, rightClick: target });
  }

  focusDirection(paneId: PaneId, direction: Dir): PaneId {
    const pane = this.requirePane(paneId);
    const tab = this.requireTab(pane.tabId);
    const neighbor = Layout.neighbor(tab.layout, paneId, direction);
    const target = neighbor ?? paneId;
    if (target !== paneId) this.focusPane(target);
    return target;
  }

  swapPane(paneId: PaneId, direction: Dir): PaneId {
    const pane = this.requirePane(paneId);
    const tab = this.requireTab(pane.tabId);
    const neighbor = Layout.neighbor(tab.layout, paneId, direction);
    if (!neighbor) return paneId;
    const newLayout = Layout.swap(tab.layout, paneId, neighbor);
    this.tabs.set(tab.id, { ...tab, layout: newLayout });
    return neighbor;
  }

  /**
   * 任意の2つの pane を入れ替える（20260923-pane-name-dnd-swap。ドラッグでの入れ替え用。
   * `swapPane` と違い隣接である必要は無い。design D4）。同一 tab の別 pane でなければ何もせず false。
   */
  swapPaneWith(paneId: PaneId, otherPaneId: PaneId): boolean {
    if (paneId === otherPaneId) return false;
    const pane = this.requirePane(paneId);
    const other = this.panes.get(otherPaneId);
    if (!other || other.tabId !== pane.tabId) return false;
    const tab = this.requireTab(pane.tabId);
    this.tabs.set(tab.id, { ...tab, layout: Layout.swap(tab.layout, paneId, otherPaneId) });
    // グローバル focus を動かした pane（paneId）へ（20260925-pane-move-global-focus。design「設計方針」）。
    this.setFocus(tab.workspaceId, tab.id, paneId);
    return true;
  }

  /**
   * 既存の pane（`paneId`）を、別の pane（`targetPaneId`）の縁へ移して分割する
   * （20260924-pane-dnd-split-move。design「振る舞いの詳細 > サーバ側」）。新しい pane は作らない。
   * 自分自身・同一 tab でない pane への要求は何もせず false（`swapPaneWith` と同じ方針）。
   */
  moveToEdge(paneId: PaneId, targetPaneId: PaneId, edge: Layout.Edge): boolean {
    if (paneId === targetPaneId) return false;
    const pane = this.requirePane(paneId);
    const target = this.panes.get(targetPaneId);
    if (!target || target.tabId !== pane.tabId) return false;
    const tab = this.requireTab(pane.tabId);
    const withoutSource = Layout.remove(tab.layout, paneId);
    // `paneId` が tab で唯一の pane なら `targetPaneId` は同じ tab に存在しえない（上のガードで
    // 既に弾かれているはず）。念のための防御。
    if (withoutSource === null) return false;
    const splitId = this.nextId("s");
    const newLayout = Layout.insertAtEdge(withoutSource, targetPaneId, edge, paneId, splitId);
    this.tabs.set(tab.id, { ...tab, layout: newLayout });
    // グローバル focus を動かした pane（paneId）へ（20260925-pane-move-global-focus。design「設計方針」）。
    this.setFocus(tab.workspaceId, tab.id, paneId);
    return true;
  }

  /**
   * `paneId`（ドラッグした pane。生き残る）が `targetPaneId`（ドロップ先。閉じる）の位置と
   * スペースを引き継ぐ（20260924-pane-dnd-split-move。design「振る舞いの詳細 > サーバ側」。
   * research.md F5：`swap` で位置を入れ替えてから `remove` で畳む）。プロセスの破棄は呼び出し側
   * （`SessionService`）の責務——`closePane` と同じ層分け。
   */
  replacePane(paneId: PaneId, targetPaneId: PaneId): RemovalResult | null {
    if (paneId === targetPaneId) return null;
    const pane = this.requirePane(paneId);
    const target = this.panes.get(targetPaneId);
    if (!target || target.tabId !== pane.tabId) return null;
    const tab = this.requireTab(pane.tabId);
    const swapped = Layout.swap(tab.layout, paneId, targetPaneId);
    const newLayout = Layout.remove(swapped, targetPaneId);
    // 上のガードで `paneId`・`targetPaneId` は別々に同一 tab に存在することを確認済みなので、
    // tab には最低2枚あり、ここで null になることは無い。念のための防御。
    if (newLayout === null) return null;
    this.panes.delete(targetPaneId);
    const nextFocused = tab.focusedPaneId === targetPaneId ? paneId : tab.focusedPaneId;
    this.tabs.set(tab.id, {
      ...tab,
      layout: newLayout,
      focusedPaneId: nextFocused,
      zoomedPaneId: null, // pane を閉じたら zoom を解除する（closePane と同じ。D100）
    });
    // グローバル focus を生存した pane（paneId）へ（20260925-pane-move-global-focus。design「設計方針」）。
    // 削除された pane が tab のローカル focus だったかどうかに関わらず、常に paneId を指す。
    this.setFocus(tab.workspaceId, tab.id, paneId);
    // 後継ヒント（20260925-pane-replace-focus-hint。design「インターフェース / データ構造」）。
    return { removedPaneIds: [targetPaneId], removedTabIds: [], closedWorkspaceId: null, successorPaneId: paneId };
  }

  zoomPane(paneId: PaneId, mode: "toggle" | "on" | "off"): void {
    const pane = this.requirePane(paneId);
    const tab = this.requireTab(pane.tabId);
    const next = mode === "toggle" ? (tab.zoomedPaneId === paneId ? null : paneId) : mode === "on" ? paneId : null;
    this.tabs.set(tab.id, { ...tab, zoomedPaneId: next });
  }

  cyclePane(fromPaneId: PaneId, delta: 1 | -1): PaneId {
    const pane = this.requirePane(fromPaneId);
    const tab = this.requireTab(pane.tabId);
    const next = Layout.cycleOrder(tab.layout, fromPaneId, delta);
    this.focusPane(next);
    return next;
  }

  setSplitRatio(tabId: TabId, splitId: SplitId, ratio: number): void {
    const tab = this.requireTab(tabId);
    this.tabs.set(tabId, { ...tab, layout: Layout.setRatio(tab.layout, splitId, ratio) });
  }

  resizeByDirection(paneId: PaneId, direction: Dir, amount: number): void {
    const pane = this.requirePane(paneId);
    const tab = this.requireTab(pane.tabId);
    this.tabs.set(tab.id, { ...tab, layout: Layout.resizeBy(tab.layout, paneId, direction, amount) });
  }

  /** pane の文字セル数（PTY・ミラーの resize と対にする。cols/rows の実値そのものの変更）。 */
  setPaneSize(paneId: PaneId, cols: number, rows: number): void {
    const pane = this.requirePane(paneId);
    this.panes.set(paneId, { ...pane, cols, rows });
  }

  /** サイズ権限を持つクライアントの id（design「サイズ権限」）。 */
  setTabSizeOwner(tabId: TabId, clientId: string | null): void {
    const tab = this.requireTab(tabId);
    this.tabs.set(tabId, { ...tab, sizeOwnerClientId: clientId });
  }

  updatePaneRuntime(paneId: PaneId, patch: { busy?: boolean; cwd?: string; title?: string; agent?: AgentInfo | null; agentSession?: AgentSessionRef | null }): Pane {
    const pane = this.requirePane(paneId);
    const updated: Pane = {
      ...pane,
      busy: patch.busy ?? pane.busy,
      cwd: patch.cwd ?? pane.cwd,
      title: patch.title ?? pane.title,
      agent: patch.agent !== undefined ? patch.agent : pane.agent,
      agentSession: patch.agentSession !== undefined ? patch.agentSession : pane.agentSession,
    };
    this.panes.set(paneId, updated);
    return updated;
  }

  /** 公式フック連携（20260923-agent-session-resume）が報告した会話参照を反映する。 */
  setAgentSession(paneId: PaneId, agentSession: AgentSessionRef | null): Pane {
    const pane = this.requirePane(paneId);
    const updated: Pane = { ...pane, agentSession };
    this.panes.set(paneId, updated);
    return updated;
  }

  markPaneFailed(paneId: PaneId, failure: string): Pane {
    const pane = this.requirePane(paneId);
    const updated: Pane = { ...pane, status: "failed", failure };
    this.panes.set(paneId, updated);
    return updated;
  }

  /**
   * 独自トークン（20260927-sidebar-row-tokens）を差し替える。null なら `tokens` の項目を除いた新しいオブジェクトにする（空の表を持たない）。
   * 帳簿・検査は `metadata/MetadataService.ts` が持ち、ここは写すだけ。
   */
  setWorkspaceTokens(workspaceId: WorkspaceId, tokens: Record<string, string> | null): Workspace {
    const updated = withTokens(this.requireWorkspace(workspaceId), tokens);
    this.workspaces.set(workspaceId, updated);
    return updated;
  }

  /** pane 版の `setWorkspaceTokens`。 */
  setPaneTokens(paneId: PaneId, tokens: Record<string, string> | null): Pane {
    const updated = withTokens(this.requirePane(paneId), tokens);
    this.panes.set(paneId, updated);
    return updated;
  }

  /**
   * 判定（`GitInfoPoller` の 3 つの結果）を反映する。`unknown` は何も変えない（`git` も書き換えない）。`git`・`unmanaged` は `git` を入れ、
   * 項目の判定（`repoKey`・`isLinkedWorktree`）が変わったときは design「レイアウトが変わる場面」の表のとおりレイアウトと所属を合わせる
   * （仮の状態ではレイアウトに触れない。導く結果が変わるだけ）。`workspace` の記録が変わったときだけ、その workspace を返す。
   */
  updateWorkspaceGit(workspaceId: WorkspaceId, result: GitJudgement): Workspace | null {
    const ws = this.requireWorkspace(workspaceId);
    if (result.kind === "unknown") return null;
    const git = result.kind === "git" ? result.git : null;
    if (!gitIdentityChanged(ws.git, git)) {
      if (ws.git === git) return null;
      const updated = { ...ws, git };
      this.workspaces.set(workspaceId, updated);
      return updated;
    }
    this.beginChange();
    const oldKey = ws.git?.repoKey ?? null;
    const newKey = git?.repoKey ?? null;
    const updated = { ...ws, git };
    this.workspaces.set(workspaceId, updated);
    if (this.layout) this.layout = this.reflectJudgement(this.layout, updated, ws.groupId, oldKey, newKey);
    this.settle();
    return this.workspaces.get(workspaceId)!;
  }

  /**
   * 判定の変わり目のレイアウトと所属（design「レイアウトが変わる場面」の「判定が付く」「判定が変わる」「管理外と確定」）。
   * `ws` は新しい `git` を入れた後の workspace、`ownGroupId` はそれまでの実効の `groupId`。`repoKey` が変わらないとき（`isLinkedWorktree` だけ）は
   * レイアウトを変えない（Map の並べ直しは `settle`）。
   */
  private reflectJudgement(layout: SidebarLayout, ws: Workspace, ownGroupId: GroupId | null, oldKey: string | null, newKey: string | null): SidebarLayout {
    if (oldKey === newKey) return layout;
    const own: ItemRef = `w:${ws.id}`;
    const hasMembers = (key: string) => [...this.workspaces.values()].some((w) => w.git?.repoKey === key);
    const liveGroup = (id: GroupId | null | undefined): GroupId | null => (id != null && this.groups.has(id) && id in layout.groups ? id : null);

    // 抜ける側（R1）: 他に居なければ項目を外す（`repoGroups[R1]` は残す）。居る間は「元の項目の位置」だけ控える。
    const leave = (key: string): { container: GroupId | null; index: number; removed: boolean } | null => {
      const ref: ItemRef = `r:${key}`;
      const container = containerOf(layout, ref);
      if (container === undefined) return null;
      const list = container === null ? layout.top : (layout.groups[container] ?? []);
      const index = list.indexOf(ref);
      const removed = !hasMembers(key);
      if (removed) layout = removeItem(layout, ref);
      return { container, index, removed };
    };

    if (newKey === null) {
      // 管理外と確定（R1 → なし）: 同じ入れ物の `r:R1` の直後（R1 が空なら同じ場所）へ `w:<id>`。`groupId` はその入れ物のグループ。
      const from = oldKey === null ? null : leave(oldKey);
      if (from) {
        layout = insertAt(layout, own, from.container, from.removed ? from.index : from.index + 1);
        this.workspaces.set(ws.id, { ...ws, groupId: from.container });
      } else {
        if (containerOf(layout, own) === undefined) layout = insertItem(layout, own, null);
        this.workspaces.set(ws.id, { ...ws, groupId: containerOf(layout, own) ?? null });
      }
      return layout;
    }

    const target: ItemRef = `r:${newKey}`;
    const exists = containerOf(layout, target) !== undefined;
    const repoGroup = liveGroup(this.repoGroups.get(newKey));

    if (oldKey !== null) {
      // 判定が変わる（R1 → R2）。
      const from = leave(oldKey);
      if (exists) return layout;
      if (repoGroup !== null) return addItemToGroup(layout, target, repoGroup);
      // 一番上の、元の項目の一番上のまとまりの直後（グループの外）。
      const anchor: ItemRef | null = from === null ? null : from.container === null ? `r:${oldKey}` : `g:${from.container}`;
      const at = anchor === null ? -1 : layout.top.indexOf(anchor);
      if (at !== -1) return insertAt(layout, target, null, at + 1);
      const topIndex = from !== null && from.container === null ? from.index : layout.top.length;
      return insertAt(layout, target, null, topIndex);
    }

    // 判定が付く（`w:<id>` → R2）。`repoGroups[R2]` を先に見る（届く順に依らない）。
    const replaceOwn = (base: SidebarLayout): SidebarLayout => {
      const container = containerOf(base, own);
      if (container === undefined) return insertItem(base, target, null);
      const list = container === null ? base.top : (base.groups[container] ?? []);
      return insertAt(removeItem(base, own), target, container, list.indexOf(own));
    };
    if (repoGroup !== null) {
      const without = removeItem(layout, own);
      return exists ? without : addItemToGroup(without, target, repoGroup);
    }
    const ownGroup = liveGroup(ownGroupId);
    if (ownGroup !== null) {
      this.repoGroups.set(newKey, ownGroup);
      if (exists) {
        const without = removeItem(layout, own);
        return containerOf(without, target) === ownGroup ? without : addItemToGroup(without, target, ownGroup);
      }
      return replaceOwn(layout);
    }
    return exists ? removeItem(layout, own) : replaceOwn(layout);
  }

  private setFocus(workspaceId: WorkspaceId, tabId: TabId, paneId: PaneId, opts?: { setTabFocusedPane?: boolean }): void {
    this.focus = { workspaceId, tabId, paneId };
    if (opts?.setTabFocusedPane) {
      const tab = this.tabs.get(tabId);
      if (tab) this.tabs.set(tabId, { ...tab, focusedPaneId: paneId });
    }
  }

  // --- snapshot / restore -----------------------------------------------------

  buildSnapshot(serverVersion: string, host: HostInfo, limits: SessionLimits): SessionSnapshot {
    return {
      protocol: 1,
      serverVersion,
      host,
      workspaces: this.listWorkspaces(),
      tabs: this.listTabs(),
      panes: this.listPanes(),
      groups: this.listGroups(),
      layout: this.getLayout(),
      focus: this.focus,
      limits,
    };
  }

  isEmpty(): boolean {
    return this.workspaces.size === 0;
  }

  /**
   * `session.json` から、保存されていた id をそのまま使って組み立てる（副作用なし。id は払い出さない）。
   * pane は既定で `status: 'running'` とし、実際にシェルを起動できたかどうかは `SessionService` が
   * `markPaneFailed` で反映する（design「再起動後の復元」）。
   */
  restoreWorkspace(data: SessionFileWorkspace, autoLabel: boolean): void {
    const workspace: Workspace = {
      id: data.id,
      label: data.label,
      cwd: data.cwd,
      tabIds: data.tabs.map((t) => t.id),
      activeTabId: data.activeTabId,
      // 以前の版の保存には無い——無ければ null（`autoLabel`/`agentSession` と同じ「optional 追加」方式。
      // 20260923-workspace-grouping）。
      groupId: data.groupId ?? null,
      git: null,
      autoLabel, // 呼ぶ側（`SessionService.restore`）が決める
    };
    this.workspaces.set(workspace.id, workspace);
    this.layout = null; // 復元した直後は仮の状態（`layout` の復元は T9。確定は `confirmLayout`）
    for (const tabData of data.tabs) {
      const tab: Tab = {
        id: tabData.id,
        workspaceId: workspace.id,
        label: tabData.label,
        layout: tabData.layout,
        focusedPaneId: tabData.focusedPaneId,
        zoomedPaneId: tabData.zoomedPaneId,
        sizeOwnerClientId: null,
      };
      this.tabs.set(tab.id, tab);
      for (const paneData of tabData.panes) {
        const pane = this.makePane(paneData.id, tab.id, {
          label: paneData.label,
          cwd: paneData.cwd,
          shell: paneData.shell,
          cols: 120,
          rows: 40,
        });
        // 会話参照は `makePane` の対象外（新規作成では持たない情報）なので、復元のときだけ載せる
        // （20260923-agent-session-resume design D2。無ければ以前の版の保存データ、または
        // そもそも報告が無かった pane で、null のままでよい）。
        if (paneData.agentSession) {
          pane.agentSession = {
            // 持続化は将来のエージェント種別も見越して `kind: string`（design D2）。ここでのキャストは
            // 表示・引き回し用のもので、実際に resume コマンドを引けるかどうかは復元処理側
            // （T5 の解決テーブル）が未知の kind を無害に無視することで安全側に倒す。
            kind: paneData.agentSession.kind as AgentIntegrationKind,
            sessionId: paneData.agentSession.sessionId,
            reportedAt: paneData.agentSession.reportedAt,
          };
        }
        this.panes.set(pane.id, pane);
      }
    }
  }

  /** `session.json` の `groups` から、保存されていた id をそのまま使って組み立てる（副作用なし。
   *  id は払い出さない。`restoreWorkspace` と同じ形。20260923-workspace-grouping）。 */
  restoreGroup(data: SessionFileGroup): void {
    this.groups.set(data.id, { id: data.id, label: data.label, collapsed: data.collapsed });
    this.layout = null; // 同上（仮の状態）
  }
}
