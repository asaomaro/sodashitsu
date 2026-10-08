<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ActionDispatcherKey, TerminalRegistryKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useSessionStore } from "../store/session.js";
import { itemGroupIdOf } from "../store/sidebarTree.js";
import { useViewStore } from "../store/view.js";

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
}

const session = useSessionStore();
const view = useViewStore();
const displays = useDisplayStore();
const actions = inject(ActionDispatcherKey);
if (!actions) throw new Error("ContextMenu: ActionDispatcherKey が provide されていません");
/** 戻す先が無いときに、選ばれている pane の端末へフォーカスする（無ければ何もしない）。 */
const registry = inject(TerminalRegistryKey, undefined);

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

const items = computed<MenuItem[]>(() => {
  const target = view.contextMenu?.target;
  if (!target) return [];
  if (target.kind === "pane") {
    const pane = session.panes.get(target.paneId);
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
      // 表示の面（パネル・帯）があるときだけ（20261007-soda-extensions）。
      ...(displays.hasAny(target.paneId) ? [{ label: "表示をすべて閉じる", run: () => actions.dismissDisplays(target.paneId) }] : []),
      { label: "閉じる", run: () => actions.closePaneById(target.paneId) },
    ];
    return list;
  }
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
      { label: "新しいグループを作る…", run: () => actions.createGroupForWorkspace(target.workspaceId) },
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
    // 連携のグラフ画面（20260927-agent-graph の design「入口」。キーの open_graph と同じ操作）。
    { label: "連携（グラフ）", run: () => actions.run({ type: "openGraph" }) },
    { label: "設定", run: () => actions.run({ type: "settings" }) },
    { label: "切り離し", run: () => actions.run({ type: "detach" }) },
  ];
});

function activate(index: number): void {
  const item = items.value[index];
  if (!item) return;
  close();
  restoreFocus();
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
    activate(activeIndex.value);
  }
}

function onOutsideClick(ev: MouseEvent): void {
  if (menuEl.value && !menuEl.value.contains(ev.target as Node)) {
    // 外側のクリックでは戻さない（フォーカスはクリックした先へ移る）。
    returnFocusTo = null;
    close();
  }
}

watch(
  () => view.contextMenu,
  (menu) => {
    if (menu) {
      // 開いたままほかの対象で開き直したとき（フォーカスはメニューの中）は、最初に開く前の要素を戻す先のままにする。
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !menuEl.value?.contains(active)) returnFocusTo = active;
      activeIndex.value = 0;
      void nextTick(() => menuEl.value?.focus());
    }
  },
);

onMounted(() => document.addEventListener("mousedown", onOutsideClick, true));
onBeforeUnmount(() => document.removeEventListener("mousedown", onOutsideClick, true));
</script>

<template>
  <ul
    v-if="view.contextMenu"
    ref="menuEl"
    role="menu"
    tabindex="-1"
    class="context-menu"
    :style="{ left: `${view.contextMenu.at.x}px`, top: `${view.contextMenu.at.y}px` }"
    @keydown="onKeydown"
  >
    <li
      v-for="(item, index) in items"
      :key="item.label"
      role="menuitem"
      :class="{ 'context-menu-active': index === activeIndex }"
      @mouseenter="activeIndex = index"
      @click="activate(index)"
    >
      {{ item.label }}
    </li>
  </ul>
</template>

<style scoped>
.context-menu {
  position: fixed;
  list-style: none;
  margin: 0;
  padding: 0.25em 0;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  min-width: 12em;
  z-index: 1000;
}
.context-menu li {
  padding: 0.35em 1em;
  cursor: pointer;
}
.context-menu-active {
  background: var(--soda-menu-active-bg, #44475a);
}
</style>
