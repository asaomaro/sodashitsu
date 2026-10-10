<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ActionDispatcherKey, TerminalHostKey, TerminalRegistryKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useGraphStore } from "../store/graph.js";
import type { NodeKey } from "@sodashitsu/protocol";
import { paneMoveBlock, paneMoveBlockMessage } from "@sodashitsu/client-core";
import { linksTouching, paneIdsOfTargets } from "./graph/closeLinks.js";
import { forkReasonText, forkUnavailableReason } from "./agentFork.js";
import { mobileViewportQuery } from "../mobile/detect.js";
import { useGraphSpacesStore } from "../store/graphSpaces.js";
import { useSessionStore } from "../store/session.js";
import { itemGroupIdOf } from "../store/sidebarTree.js";
import { useViewStore } from "../store/view.js";
import { dismissWithFocus, headFocusTarget, openDisplayMenu, trayFocusTarget, withDisplayChange } from "../display/displayOps.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useUiStyle } from "../composables/useUiStyle.js";

/**
 * 右クリックのメニュー（M3。APG の Menu。D56 の訂正 10）。`view.contextMenu` が開閉を持つ
 * （`ui.openContextMenu` で開く。`ActionDispatcher` が `UiPort` として実装）。
 * Esc・項目の選択で閉じたら、開く前にフォーカスしていた要素（右クリックした端末・tab、キーボードで開いた pane の枠）へ
 * フォーカスを戻す（APG の Menu。D110：以前は戻さず、閉じるとフォーカスが body に落ちて、端末へ打てなくなっていた）。
 * 項目の処理がフォーカスを移すもの（ダイアログ・新しい pane）は、戻した後に処理が移し直す。戻す先がもう文書に無ければ
 * （閉じた pane の端末・枠）、選ばれている pane の端末へ移す（独立点検 #4。戻した先が後で消えるとき——「閉じる」で、選ばれて
 * いない pane を閉じたとき——は `PaneFrame` が同じように移す）。
 */
interface MenuItem {
  label: string;
  run: () => void;
  /** 選べない理由（20261008-graph-first PR4）。あれば薄く出し、理由を添える。押すと、理由をトーストで出すだけ。 */
  disabledReason?: string;
}

/** 移せない理由の文言（移せるなら null）。判定は D&D・サーバと同じ `paneMoveBlock`。 */
function paneMoveBlockMessageFor(source: Parameters<typeof paneMoveBlock>[0], target: Parameters<typeof paneMoveBlock>[1]): string | null {
  const block = paneMoveBlock(source, target, { lenient: true });
  return block === null ? null : paneMoveBlockMessage(block);
}

const session = useSessionStore();
const view = useViewStore();
const displays = useDisplayStore();
const graphStore = useGraphStore();
const graphSpaces = useGraphSpacesStore();
const { modernLayout } = useUiStyle();
const actions = inject(ActionDispatcherKey);
if (!actions) throw new Error("ContextMenu: ActionDispatcherKey が provide されていません");
const displayController = inject(DisplayControllerKey, null);
const displayHost = inject(DisplayHostKey, undefined);
/** 戻す先が無いときに、選ばれている pane の端末へフォーカスする（無ければ何もしない）。 */
const registry = inject(TerminalRegistryKey, undefined);
const terminalHost = inject(TerminalHostKey, undefined);

const menuEl = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

/** メニューを開く前にフォーカスしていた要素（閉じたら戻す先。D110）。 */
let returnFocusTo: HTMLElement | null = null;

function close(): void {
  view.closeContextMenu();
}

/** 開く前にフォーカスしていた要素へ戻す。もう文書に無ければ（閉じた pane の端末等）、選ばれている pane の端末へ移す。 */
function restoreFocus(): void {
  const el = returnFocusTo;
  returnFocusTo = null;
  if (el?.isConnected) el.focus();
  else if (view.focusedPaneId) registry?.focus(view.focusedPaneId);
}

/** メニューを開いた pane が、焦点の pane と入れ替えられるか（焦点の pane そのものでなく、同じ tab にある）。 */
function swappableWithFocused(paneId: string): boolean {
  const focused = view.focusedPaneId;
  if (!focused || focused === paneId) return false;
  const tabId = session.panes.get(paneId)?.tabId;
  return tabId !== undefined && tabId === session.panes.get(focused)?.tabId;
}

/** 表示のメニューは 2 段（面の一覧 → 面のメニュー）。選んだ項目の処理が、同じ位置に次のメニューを開く。 */
function openDisplaysMenu(paneId: string, _from?: unknown): void {
  void _from;
  openDisplayMenu((t, p) => view.openContextMenu(t, p), { kind: "displays", paneId }, menuAt, displayHost, paneId);
}
/** 項目を選んで閉じる直前の、メニューの位置（次のメニューを同じ位置に開く）。 */
let menuAt: { x: number; y: number } = { x: 8, y: 8 };
const KIND_LABEL = { panel: "パネル", band: "帯" } as const;
const DOCK_LABEL: Record<string, string> = { right: "右", left: "左", top: "上", bottom: "下", float: "浮いた窓" };
function displaysItems(paneId: string): MenuItem[] {
  const auto = new Set(displays.layoutByPane.get(paneId)?.auto ?? []);
  return displays.all
    .filter((d) => d.paneId === paneId)
    .map((d) => {
      const f = displays.effectiveOf(d);
      const where = d.kind === "band" ? (f.edge === "bottom" ? "下" : "上") : (DOCK_LABEL[f.dock ?? "right"] ?? "右");
      const state = auto.has(d.id) ? "出せない" : f.collapsed ? "たたんでいる" : "開いている";
      return { label: `${KIND_LABEL[d.kind]} ${d.name} — ${where}・${state}`, run: () => openDisplayMenu((t, at) => view.openContextMenu(t, at), { kind: "display", id: d.id }, menuAt, displayHost, paneId) };
    });
}
function displayItems(id: string): MenuItem[] {
  const d = displays.infos.get(id);
  if (!d) return [];
  const f = displays.effectiveOf(d);
  const focusToHead = (): HTMLElement | null => headFocusTarget(d.id);
  const focusToTray = (): HTMLElement | null => trayFocusTarget(d.id);
  const list: MenuItem[] = [];
  // 浮いた窓は、窓の動ける領域が分かっている間だけ開く操作を受ける（無ければ「開く」を出さない）。
  if (f.collapsed && f.dock === "float" && !displays.canOpenFloat(d.paneId)) {
    // 開けない（pane が小さい）
  } else if (f.collapsed) list.push({ label: "開く", run: () => void withDisplayChange(d, () => displays.setFaceCollapsed(d, false), focusToHead, displayHost) });
  else list.push({ label: "たたむ", run: () => void withDisplayChange(d, () => displays.setFaceCollapsed(d, true), focusToTray, displayHost) });
  if (d.kind === "band") {
    if (f.edge !== "top") list.push({ label: "上に置く", run: () => void withDisplayChange(d, () => displays.setFaceEdge(d, "top"), focusToHead, displayHost) });
    if (f.edge !== "bottom") list.push({ label: "下に置く", run: () => void withDisplayChange(d, () => displays.setFaceEdge(d, "bottom"), focusToHead, displayHost) });
  }
  if (d.kind === "panel") {
    // 今と違う側だけ。移った先で開いて出る（`setFaceDock` が `collapsed: false` も書く）。枠は作り直し。
    for (const side of ["right", "left", "top", "bottom"] as const) {
      if (f.dock !== side) list.push({ label: `${DOCK_LABEL[side]}に置く`, run: () => void withDisplayChange(d, () => displays.setFaceDock(d, side), focusToHead, displayHost) });
    }
    // 浮いた窓にする: 窓の動ける領域があるときだけ。矩形は渡さない（`writeFace` が、記憶に矩形が無いときだけ初めの矩形を書く＝前の位置を上書きしない）。
    if (f.dock !== "float" && displays.canOpenFloat(d.paneId)) {
      list.push({ label: "浮いた窓にする", run: () => void withDisplayChange(d, () => displays.setFaceDock(d, "float"), focusToHead, displayHost) });
    }
    if (f.dock === "float" && !f.collapsed) {
      list.push({ label: "キーで動かす", run: () => displays.startFloatKeys(d, "move") });
      list.push({ label: "キーで大きさを変える", run: () => displays.startFloatKeys(d, "resize") });
    }
  }
  if (displays.hasPref(d)) list.push({ label: "プログラムの指定に戻す", run: () => void withDisplayChange(d, () => displays.resetFace(d), focusToHead, displayHost) });
  list.push({ label: "この表示を閉じる", run: () => dismissWithFocus(d, () => displayController?.dismiss({ id: d.id }), displayHost) });
  return list;
}

/** グラフから閉じる: 線が消えるときは、busy でなくても確認を出す（基本画面と同じダイアログ）。無ければ、基本画面と同じ道。 */
function closeFromGraph(t: { type: "pane" | "workspace"; id: string }): void {
  if (!actions) return;
  if (t.type === "workspace") {
    actions.closeWorkspaceById(t.id);
    return;
  }
  if (linksTouching(graphStore.links, paneIdsOfTargets([t], session)) > 0) view.openDialogWithContext({ kind: "confirmClose", targets: [t] });
  else actions.closePaneById(t.id);
}

/**
 * 「会話を fork…」（20261009-agent-fork PR2）。モバイルには出さない。fork できないときは押せない形で、理由を添える（`disabledReason`。メニューは pane が持つ値から同じ種類の理由を先に導き、
 * 確かめ切れないもの〔シェル・git〕はダイアログの確かめ〔`agent.fork_preview`〕が見せる）。
 */
function forkItem(paneId: string, local: boolean): MenuItem[] {
  if (mobileViewportQuery().matches) return [];
  const reason = forkUnavailableReason(session.panes.get(paneId), local);
  return [{ label: "会話を fork…", run: () => actions?.openAgentFork(paneId), ...(reason !== null ? { disabledReason: forkReasonText(reason) } : {}) }];
}

const items = computed<MenuItem[]>(() => {
  const target = view.contextMenu?.target;
  if (!target) return [];
  if (target.kind === "pane") {
    const pane = session.panes.get(target.paneId);
    // グラフの上の端末の窓の中では、その pane への操作だけ（貼り付け・右クリックの送り先）。分割・閉じる・拡大表示・名前・入れ替えは、窓の下の見えない基本画面を変えるので出さない
    // （20261008-graph-first PR2a のレビュー指摘 4。キーの絞り〔D75〕と同じ線）。
    if (terminalHost?.heldByWindow(target.paneId)) {
      return [
        { label: pane?.rightClick === "pane" ? "herdr のメニューを使う" : "右クリックを pane に送る", run: () => actions.setRightClickTarget(target.paneId, pane?.rightClick === "pane" ? "herdr" : "pane") },
        { label: "貼り付け", run: () => actions.pasteIntoPane(target.paneId) },
      ];
    }
    const list: MenuItem[] = [
      { label: "名前の変更", run: () => actions.renamePaneById(target.paneId) },
      ...(pane?.label ? [{ label: "名前の消去", run: () => actions.clearPaneName(target.paneId) }] : []),
      // herdr の「Swap with focused pane」（20260927-cli-mode の design D-7）。焦点の pane 以外の、同じ tab の pane のメニューにだけ出す。
      ...(swappableWithFocused(target.paneId) ? [{ label: "焦点の pane と入れ替え", run: () => actions.swapWithFocused(target.paneId) }] : []),
      { label: "右へ分割", run: () => actions.splitPane(target.paneId, "right") },
      { label: "下へ分割", run: () => actions.splitPane(target.paneId, "down") },
      { label: "拡大表示", run: () => actions.zoomPane(target.paneId) },
      { label: pane?.rightClick === "pane" ? "herdr のメニューを使う" : "右クリックを pane に送る", run: () => actions.setRightClickTarget(target.paneId, pane?.rightClick === "pane" ? "herdr" : "pane") },
      { label: "貼り付け", run: () => actions.pasteIntoPane(target.paneId) },
      ...forkItem(target.paneId, true),
      // そのセッションの利用状況（20261010-agent-usage PR4。エージェントの居る pane だけ。クラシック・モダンとも）。
      ...(pane?.agent ? [{ label: "利用状況…", run: () => actions.showPaneInfo(target.paneId) }] : []),
      // 表示の面（パネル・帯）があるときだけ（20261007-soda-extensions）。
      ...(displays.hasAny(target.paneId)
        ? [
            { label: "表示のメニュー…", run: () => openDisplaysMenu(target.paneId, target) },
            { label: "表示をすべて閉じる", run: () => actions.dismissDisplays(target.paneId) },
          ]
        : []),
      { label: "閉じる", run: () => actions.closePaneById(target.paneId) },
    ];
    return list;
  }
  if (target.kind === "displays") return displaysItems(target.paneId);
  if (target.kind === "display") return displayItems(target.id);
  if (target.kind === "tab") {
    const tab = session.tabs.get(target.tabId);
    return [
      { label: "新規", run: () => tab && actions.newTabInWorkspace(tab.workspaceId) },
      { label: "名前の変更", run: () => actions.renameTabById(target.tabId) },
      { label: "閉じる", run: () => actions.closeTabById(target.tabId) },
    ];
  }
  if (target.kind === "workspace") {
    // herdr は worktree の状態で 4 パターンに変える。本製品は削除が対象外なので「git リポジトリか」
    // の 2 パターンだけ（20260920-git-worktree-actions。元は D56 の訂正 10 で 2 項目固定だった）。
    // グルーピングは 20260923-workspace-grouping で対応した（手動グループの項目を下に追加）。
    // 判定は `workspace.git`（`GitInfoPoller` が 5 秒周期で埋める）。**作った直後は間に合わない**ので、
    // その間は `prefix+G` から始められるようにしてある（decisions.md D3）。
    const ws = session.workspaces.get(target.workspaceId);
    const isGit = ws?.git != null;
    // 所属は項目で見る（worktree の子の行でも、操作は項目の全体に働く）。
    const currentGroupId = itemGroupIdOf(session, target.workspaceId);
    const inGroup = currentGroupId !== null;
    // 移し先に選べるグループがあるか（所属ありのときは今のグループを除く）。
    const hasOtherGroup = session.groups.size - (inGroup && session.groups.has(currentGroupId) ? 1 : 0) > 0;
    return [
      { label: "名前の変更", run: () => actions.renameWorkspaceById(target.workspaceId) },
      { label: "閉じる", run: () => actions.closeWorkspaceById(target.workspaceId) },
      ...(isGit
        ? [
            { label: "新しい worktree", run: () => actions.newWorktree(target.workspaceId) },
            { label: "worktree を開く…", run: () => actions.openWorktree(target.workspaceId) },
          ]
        : []),
      // 20260923-workspace-grouping（herdr に前例が無い独自拡張）。項目の並びは design「画面」のとおり
      // （所属なし: 追加・新規／所属あり: 移す・外す・新規）。
      ...(inGroup
        ? [
            ...(hasOtherGroup ? [{ label: "別のグループへ移す…", run: () => actions.openGroupPicker(target.workspaceId) }] : []),
            { label: "グループから外す", run: () => actions.removeWorkspaceFromGroup(target.workspaceId) },
          ]
        : hasOtherGroup
          ? [{ label: "グループへ追加…", run: () => actions.openGroupPicker(target.workspaceId) }]
          : []),
      // モダンの配置では、グループは「新規」のメニューから作る（20261008-ui-style AC16）。
      ...(modernLayout.value ? [] : [{ label: "新しいグループを作る…", run: () => actions.createGroupForWorkspace(target.workspaceId) }]),
    ];
  }
  if (target.kind === "group") {
    return [
      { label: "名前の変更", run: () => actions.renameGroupById(target.groupId) },
      // 「上へ／下へ移動」は `item.move_by` が要る。`layout` の無い古いサーバには出さない（design「古いサーバ・古い画面」）。
      ...(session.hasServerLayout
        ? [
            { label: "上へ移動", run: () => actions.moveGroupBy(target.groupId, "previous") },
            { label: "下へ移動", run: () => actions.moveGroupBy(target.groupId, "next") },
          ]
        : []),
      { label: "グループを削除", run: () => actions.deleteGroupById(target.groupId) },
    ];
  }
  if (target.kind === "graphMore") {
    const paused = graphStore.graph?.paused === true;
    return [
      { label: paused ? "全体を再開" : "全体を一時停止", run: () => graphSpaces.requestCommand("pause") },
      { label: "履歴", run: () => graphSpaces.requestCommand("history") },
      { label: "別のマシンの pane を載せる", run: () => graphSpaces.requestCommand("checklist") },
    ];
  }
  if (target.kind === "graphAdd") {
    // ツールバーの「＋ workspace」（PR3 T14e）。基本画面の操作を、そのまま呼ぶ。
    const wid = view.workspaceId;
    return [
      { label: "新しい workspace", run: () => graphSpaces.requestCommand("newWorkspace") },
      ...(wid
        ? [
            { label: "worktree を作る…", run: () => actions.newWorktree(wid) },
            { label: "worktree を開く…", run: () => actions.openWorktree(wid) },
          ]
        : []),
    ];
  }
  if (target.kind === "graphNode") {
    // ノードの右クリック（PR3 T14e）。手元で、いま在る pane だけ閉じられる。線が残るときは、必ず確認する。
    const info = graphStore.nodeInfo(target.key as NodeKey);
    if (!info.local || info.exists !== true || !session.panes.has(info.paneId)) return [];
    return [
      { label: "pane を閉じる", run: () => closeFromGraph({ type: "pane", id: info.paneId }) },
      ...forkItem(info.paneId, info.local && info.exists === true),
      ...(session.panes.get(info.paneId)?.agent ? [{ label: "利用状況…", run: () => actions.showPaneInfo(info.paneId) }] : []),
      { label: "別の workspace へ移す…", run: () => view.openContextMenu({ kind: "graphMoveTo", key: target.key }, menuAt) },
    ];
  }
  if (target.kind === "graphMoveTo") {
    // ノードのメニューの「別の workspace へ移す…」（PR4 T15c。キーだけの道）。落とせる先は選べ、落とせない先は理由つきで薄く出す（判定は D&D と同じ `paneMoveBlock`）。
    const info = graphStore.nodeInfo(target.key as NodeKey);
    const pane = info.local && info.exists === true ? session.panes.get(info.paneId) : undefined;
    const sourceTab = pane ? session.tabs.get(pane.tabId) : undefined;
    const source = sourceTab ? session.workspaces.get(sourceTab.workspaceId) : undefined;
    if (!pane || !sourceTab || !source) return [];
    const out: MenuItem[] = [];
    const seen = new Map<string, number>();
    const unique = (label: string): string => {
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      return n === 1 ? label : `${label} (${n})`;
    };
    for (const ws of session.workspaces.values()) {
      const title = graphSpaces.infoMap.get(ws.id)?.title ?? ws.label;
      const reason = ws.id === source.id ? null : paneMoveBlockMessageFor(source, ws);
      const tabs = graphSpaces.infoMap.get(ws.id)?.tabs ?? [];
      const move = (tabId: string) => (): void => graphSpaces.requestCommand("moveNode", JSON.stringify({ key: target.key, workspaceId: ws.id, tabId }));
      if (ws.id !== source.id) {
        out.push({ label: unique(title), run: move(ws.activeTabId), ...(reason ? { disabledReason: reason } : {}) });
      }
      // tab が複数ある workspace は、tab も選べる（いまの tab は除く）。
      if (tabs.length > 1) {
        for (const t of tabs) {
          if (t.id === sourceTab.id) continue;
          out.push({ label: unique(`${title} › ${t.label}`), run: move(t.id), ...(reason ? { disabledReason: reason } : {}) });
        }
      }
    }
    return out;
  }
  if (target.kind === "graphFrame") {
    const info = graphSpaces.infoMap.get(target.workspaceId);
    const inWorktreeGroup = info?.parentId != null; // worktree グループの中の workspace だけを移す操作は出さない
    const groupId = itemGroupIdOf(session, target.workspaceId);
    return [
      { label: "pane を足す", run: () => graphSpaces.requestCommand("addPane", target.workspaceId) },
      ...(inWorktreeGroup
        ? []
        : [
            { label: "別のグループへ移す…", run: () => actions.openGroupPicker(target.workspaceId) },
            ...(groupId !== null ? [{ label: "グループから外す", run: () => void actions.moveItemToGroup(target.workspaceId, null) }] : []),
          ]),
      { label: "workspace を閉じる", run: () => closeFromGraph({ type: "workspace", id: target.workspaceId }) },
    ];
  }
  if (target.kind === "graphGroupFrame") {
    // worktree グループの外側の囲いの見出し（PR4 T15b）。ひとかたまりで動く（中の workspace だけを移す操作は出さない）。
    const groupId = itemGroupIdOf(session, target.workspaceId);
    return [
      { label: "別のグループへ移す…", run: () => actions.openGroupPicker(target.workspaceId) },
      ...(groupId !== null ? [{ label: "グループから外す", run: () => void actions.moveItemToGroup(target.workspaceId, null) }] : []),
    ];
  }
  if (target.kind === "ungrouped") {
    // 「グループなし」の見出し（追補 01 B）：名前の変更・削除は無い。並べ替えは `item.move_by` が要るので、`layout` の無い古いサーバには何も出さない
    // （そのときはメニュー自体を開かない。`Sidebar.vue`）。
    return session.hasServerLayout
      ? [
          { label: "上へ移動", run: () => actions.moveUngroupedBy("previous") },
          { label: "下へ移動", run: () => actions.moveUngroupedBy("next") },
        ]
      : [];
  }
  if (target.kind === "new") {
    // サイドバーの「新規」（モダンの配置。20261008-ui-style AC15）。どれも今ある操作を呼ぶだけ（新しい操作は作らない）。
    const workspaceId = view.workspaceId;
    return [
      { label: "workspace", run: () => actions.run({ type: "newWorkspace" }) },
      // 基本画面の「分割」の既定（`split_vertical`＝右へ）と同じ。グラフの画面では、見えない基本画面を変えるので出さない。
      ...(view.screen === "base" ? [{ label: "pane", run: () => actions.run({ type: "split", dir: "right" }) }] : []),
      ...(workspaceId ? [{ label: "グループ…", run: () => actions.createGroupForWorkspace(workspaceId) }] : []),
    ];
  }
  // global：どこにも属さない全体の操作。**「設定」は入れる**（20260920-agent-notifications で通知の設定として足し、
  // 20260921-herdr-settings-gaps で通知・表示・端末の設定全体に広げた）。herdr の `reload config` / `what's new` は
  // 引き続き入れない。
  // 切り離しは押し間違えると接続が切れるので最後。
  // 最後の分岐は `target` の中身を見ないので、種類が増えてもここへ黙って落ちてしまう。
  // それを防ぐために網羅性を明示する（5 つ目を足したらここで型エラーになる）。
  target satisfies { kind: "global" };
  return [
    { label: "キー割り当て", run: () => actions.run({ type: "help" }) },
    { label: "移動", run: () => actions.run({ type: "goto" }) },
    // 連携のグラフ画面（20260927-agent-graph の design「入口」。キーの open_graph と同じ操作）。モダンの配置では、サイドバーの上の切り替えとキーで足りるので出さない（AC12）。
    ...(modernLayout.value ? [] : [{ label: "連携（グラフ）", run: () => actions.run({ type: "openGraph" }) }]),
    { label: "設定", run: () => actions.run({ type: "settings" }) },
    { label: "切り離し", run: () => actions.run({ type: "detach" }) },
  ];
});

function activate(index: number): void {
  const item = items.value[index];
  if (!item) return;
  menuAt = view.contextMenu?.at ?? menuAt;
  close();
  restoreFocus();
  if (item.disabledReason) {
    view.toast(item.disabledReason);
    return;
  }
  item.run();
}

/**
 * `main.ts` の window の keydown（端末外のキーを `KeyRouter`/`NavigateMode` へ流す経路）に
 * 二重に渡さない（`PaneFrame.vue:238-246` と同じパターン。20260925-sidebar-keyboard-menu
 * review round1 must——`stopPropagation()` が無かったため、navigate モード中にメニューを
 * 開いた状態で矢印キー・Space を押すと、メニュー内の操作と同時に `navigateSelection` が
 * 動く・`openMenu` action が再発火する実害があった。decisions D4）。
 */
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    close();
    restoreFocus();
    return;
  }
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    ev.stopPropagation();
    activeIndex.value = (activeIndex.value + 1) % items.value.length;
    return;
  }
  if (ev.key === "ArrowUp") {
    ev.preventDefault();
    ev.stopPropagation();
    activeIndex.value = (activeIndex.value - 1 + items.value.length) % items.value.length;
    return;
  }
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat) return; // 押しっぱなしで、2 段のメニューの先頭の項目（開く／たたむ）まで実行しない
    activate(activeIndex.value);
  }
}

function onOutsideClick(ev: Event): void {
  if (menuEl.value && !menuEl.value.contains(ev.target as Node)) {
    // 外側のクリックでは戻さない（フォーカスはクリックした先へ移る）。ただし、押してもフォーカスを取らない部品・覆いを押したときは、フォーカスは動かない（メニューが消えて `body` に落ちる）ので、
    // 開く前の場所へ戻してから閉じる。`pointerdown` を `preventDefault` する部品（つまみ）は互換の `mousedown` が出ないので、`pointerdown` の capture でも聞く。
    const t = ev.target;
    if (t instanceof Element && t.closest("[data-display-keepfocus], [data-display-cover]") !== null) {
      close();
      restoreFocus();
      return;
    }
    returnFocusTo = null;
    close();
  }
}

/** 画面の下・右にはみ出すとき、中に収まる位置へずらす（下の帯の［⋮］から開いても、項目が画面の外に出ない）。 */
const shift = ref({ x: 0, y: 0 });
function clampIntoViewport(): void {
  const el = menuEl.value;
  const menu = view.contextMenu;
  if (!el || !menu) return;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return;
  const dx = Math.min(0, window.innerWidth - 4 - (menu.at.x + r.width));
  // `flipUp`（最下部のボタンから開く）は、点の上に開く（下へ開くと、ボタンに重なる）。上に収まらなければ、今までの「はみ出す分だけずらす」。
  const up = menu.at.flipUp === true && menu.at.y - r.height >= 4 ? -r.height : null;
  const dy = up ?? Math.min(0, window.innerHeight - 4 - (menu.at.y + r.height));
  shift.value = { x: Math.max(dx, -menu.at.x), y: Math.max(dy, -menu.at.y) };
}
watch(
  () => view.contextMenu,
  (menu) => {
    shift.value = { x: 0, y: 0 };
    if (menu) {
      void nextTick(clampIntoViewport);
      // 開いたままほかの対象で開き直したとき（フォーカスはメニューの中）は、最初に開く前の要素を戻す先のままにする。
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !menuEl.value?.contains(active)) returnFocusTo = active;
      activeIndex.value = 0;
      void nextTick(() => menuEl.value?.focus());
    }
  },
);

onMounted(() => {
  document.addEventListener("mousedown", onOutsideClick, true);
  document.addEventListener("pointerdown", onOutsideClick, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onOutsideClick, true);
  document.removeEventListener("pointerdown", onOutsideClick, true);
});
</script>

<template>
  <ul
    v-if="view.contextMenu"
    ref="menuEl"
    role="menu"
    tabindex="-1"
    class="context-menu"
    :style="{ left: `${view.contextMenu.at.x + shift.x}px`, top: `${view.contextMenu.at.y + shift.y}px` }"
    @keydown="onKeydown"
  >
    <li
      v-for="(item, index) in items"
      :key="item.label"
      role="menuitem"
      :class="{ 'context-menu-active': index === activeIndex, 'context-menu-disabled': item.disabledReason }"
      :aria-disabled="item.disabledReason ? 'true' : undefined"
      :title="item.disabledReason"
      @mouseenter="activeIndex = index"
      @click="activate(index)"
    >
      {{ item.label }}<span v-if="item.disabledReason" class="context-menu-reason">　— {{ item.disabledReason }}</span>
    </li>
  </ul>
</template>

<style scoped>
.context-menu {
  box-shadow: var(--soda-shape-shadow, none);
  position: fixed;
  list-style: none;
  margin: 0;
  padding: var(--soda-shape-menu-pad-y, 0.25em) 0;
  border-radius: var(--soda-shape-menu-radius, 0);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  min-width: 12em;
  z-index: 1000;
}
.context-menu li {
  padding: 0.35em var(--soda-shape-pad-x, 1em);
  min-height: var(--soda-shape-control-h, auto);
  box-sizing: border-box;
  cursor: pointer;
}
/* 選べない行（理由つき。無効な部品として薄くする。`uiTokens.test.ts` の薄さの検査は `[aria-disabled="true"]` を除く） */
.context-menu li[aria-disabled="true"] {
  opacity: 0.55;
}
.context-menu-reason {
  font-size: 0.85em;
}
.context-menu-active {
  background: var(--soda-menu-active-bg, #44475a);
}
</style>
