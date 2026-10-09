<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ACTIONS, type ActionGroup } from "@sodashitsu/client-core";
import { navigateKeyDef, type NavigateKeyId } from "@sodashitsu/client-core";
import { COMMAND_GROUP } from "@sodashitsu/client-core";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";

/**
 * キー一覧（T24。design「ダイアログ」「ヘルプ」。herdr `src/input/keybind_help.rs`
 * `keybind_help_groups()`/`filter_keybind_help_groups()` を移植——群（全体・移動・workspace / tab・pane）
 * ごとの一覧。`custom` 群は、独自コマンド（20260927-custom-command-keys）のうち割り当てのあるものを群「独自コマンド」として出す
 * （それまでは独自コマンドが無く常に出さなかった。D56 の訂正 8）。
 * **キーは現在の割り当て（`settings.keymap`）から作る**（20260921-keybinding-customization。design「案内の追従」・D8）——prefix の後のキーは `prefix+v`、直接のキーは
 * `ctrl+alt+d`、割り当てなしは「なし」。**移動の群（navigate モードの中の操作。当初6つの移動操作
 * のみだったが、20260925-sidebar-keyboard-menu で `navigate_open_menu`〔移動ではなくメニューを
 * 開く操作〕が7つ目として加わった）も現在の割り当て（`settings.navigateKeymap`）から作る**
 * （20260923-navigate-mode-keys。design「HelpDialog.vue『移動』群の動的化」で「固定の表記」から
 * 変更）——`esc`（戻る）・`enter`（決定）はこの動的な一覧に含まれないため固定のまま、
 * `←`/`→` は予約キーで表に無いため pane 左右移動の固定フォールバックとして常に併記する（decisions D3）。
 * 絞り込みは herdr と同じくキー表記・説明の部分一致（大小無視）で、一致 0 件の群は丸ごと消える。
 *
 * Esc/Enter/スクロールの分岐は herdr の `route_overlay_key`（`overlay_input.rs:773-873`）を実測して
 * 確定した（D76）：**絞り込み中**は Esc で絞り込みの文字を消して検索欄から離れる（閉じない）・Enter は
 * 絞り込み中でも閉じる・↑↓/PageUp/PageDown はスクロールするが `j`/`k` は文字として入力欄へ入るだけ
 * （スクロールしない。ブラウザの `<input>` の既定動作にまかせる）。**絞り込んでいないとき**は
 * Esc・Enter・`?` で閉じ、`j/k`・PageUp/PageDown・Home/End でスクロールする。
 */
interface HelpEntry {
  keys: string;
  label: string;
  grayed?: boolean;
}
interface HelpGroup {
  name: string;
  entries: HelpEntry[];
}

const settings = useSettingsStore();

/**
 * 操作の行。表記は現在の割り当て。割り当てなしは「なし」（灰色）。
 * H/J/K/L（swap）は herdr のヘルプにも出てこないので、ここでも出さない（`helpHidden`。D76。編集は設定の節「キー」でできる）。
 */
function actionEntries(group: ActionGroup): HelpEntry[] {
  return ACTIONS.filter((d) => d.group === group && !("helpHidden" in d)).map((d) => {
    const list = settings.keymap.bindingsOf(d.id);
    return list.length === 0 ? { keys: "なし", label: d.label, grayed: true } : { keys: list.join(" / "), label: d.label };
  });
}

/** navigate モードの操作の現在の割り当て表記（20260923-navigate-mode-keys）。割り当てなしは「なし」。 */
function navigateBindingText(id: NavigateKeyId): string {
  const list = settings.navigateKeymap.bindingsOf(id);
  return list.length === 0 ? "なし" : list.join(" / ");
}
/**
 * 素の行（表の割り当てが無ければ灰色）。navigate_pane_left/right はこれを使わず、下の
 * `navigateEntries` で別途組み立てる（矢印の固定フォールバックがあるので灰色にしない。design
 * 「HelpDialog.vue『移動』群の動的化」のスケッチどおり）。
 */
function navigateEntry(id: NavigateKeyId): HelpEntry {
  const list = settings.navigateKeymap.bindingsOf(id);
  return { keys: navigateBindingText(id), label: navigateKeyDef(id)?.label ?? id, grayed: list.length === 0 };
}
/**
 * 移動の群：navigate モード（`prefix+w`）の中の、`NAVIGATE_KEYS` カタログにある操作は現在の
 * 割り当てから作る（AC7）。当初は移動6操作のみだったが、20260925-sidebar-keyboard-menu で
 * `navigate_open_menu`（移動ではなくメニューを開く操作）がカタログの7つ目として加わった——
 * `navigateEntry()` で他の操作と同じ形で組み立てる。`esc`（戻る）・`enter`（決定）は
 * `NAVIGATE_KEYS` カタログに無い（`NavigateMode` 自身の固定 case）ため、この群の配列の中では
 * 引き続き固定の表記のまま。`←`/`→` は予約キーで表に無いが、
 * `NavigateMode` の固定 case として常に pane 左右移動に効くため、表の割り当てに関わらず常に併記する
 * （decisions D3）。**pane 左右の2行は `grayed` を立てない**——表の割り当て（`h`/`l` 等）を外しても
 * 矢印キーが常に効くため、「使えない」ように見せない（design のスケッチどおり。workspace 上下・
 * pane 上下の4行は矢印の固定フォールバックが無いので、割り当てなしのとき灰色にする）。
 */
const navigateEntries = computed<HelpEntry[]>(() => [
  { keys: "esc", label: "戻る" },
  navigateEntry("navigate_workspace_up"),
  navigateEntry("navigate_workspace_down"),
  navigateEntry("navigate_open_menu"),
  navigateEntry("navigate_toggle_collapse"),
  { keys: `${navigateBindingText("navigate_pane_left")} ・ ←`, label: navigateKeyDef("navigate_pane_left")!.label },
  navigateEntry("navigate_pane_down"),
  navigateEntry("navigate_pane_up"),
  {
    keys: `${navigateBindingText("navigate_pane_right")} ・ →`,
    label: navigateKeyDef("navigate_pane_right")!.label,
  },
  { keys: "enter", label: "選んだ workspace を開く" },
]);

/** 独自コマンドの行（割り当てのあるものだけ）。 */
const commandEntries = computed<HelpEntry[]>(() =>
  settings.keymap.commands
    .map((c) => ({ keys: settings.keymap.bindingsOf(c.id).join(" / "), label: c.label }))
    .filter((e) => e.keys !== ""),
);

// herdr の keybind_help_groups() の群分けに合わせる（D76）。先頭に prefix 自身の行（herdr の「prefix mode」の行と同じ）。
const helpGroups = computed<HelpGroup[]>(() => [
  {
    name: "全体",
    entries: [
      { keys: settings.keymap.prefix, label: "prefix（押したあと、次のキーで操作します）" },
      ...actionEntries("全体"),
    ],
  },
  { name: "移動", entries: navigateEntries.value },
  { name: "workspace / tab", entries: actionEntries("workspace / tab") },
  { name: "pane", entries: actionEntries("pane") },
  // 独自コマンド（20260927-custom-command-keys。herdr の custom 群）。割り当てのあるものだけ、名前（説明か id）とキーで。無ければ群ごと出さない。
  ...(commandEntries.value.length > 0 ? [{ name: COMMAND_GROUP, entries: commandEntries.value }] : []),
]);

const SCROLL_LINE = 32;
const SCROLL_PAGE = 240;

const view = useViewStore();

const dialogEl = ref<HTMLDialogElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const queryInputEl = ref<HTMLInputElement | null>(null);
const query = ref("");

const filteredGroups = computed<HelpGroup[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return helpGroups.value;
  return helpGroups.value.map((g) => ({ name: g.name, entries: g.entries.filter((e) => e.keys.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)) })).filter(
    (g) => g.entries.length > 0,
  );
});

watch(
  () => view.dialogContext,
  (ctx) => {
    if (ctx?.kind === "help") {
      query.value = "";
      void nextTick(() => {
        dialogEl.value?.showModal();
        listEl.value?.focus();
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

const close = (): void => {
  view.closeDialog();
};

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  close();
}

function scrollBy(delta: number): void {
  listEl.value?.scrollBy({ top: delta });
}
function scrollTo(top: number): void {
  if (!listEl.value) return;
  listEl.value.scrollTop = top;
}

const onDialogKeydown = (ev: KeyboardEvent): void => {
  const filtering = document.activeElement === queryInputEl.value;
  const key = ev.key;

  if (filtering) {
    if (key === "Escape") {
      ev.preventDefault();
      query.value = ""; // 絞り込みを消して検索欄から離れる。閉じない（D56 の訂正 8）。
      queryInputEl.value?.blur();
      return;
    }
    if (key === "Enter") {
      ev.preventDefault();
      close(); // 絞り込み中でも Enter は閉じる。
      return;
    }
    if (key === "ArrowUp") {
      ev.preventDefault();
      scrollBy(-SCROLL_LINE);
    } else if (key === "ArrowDown") {
      ev.preventDefault();
      scrollBy(SCROLL_LINE);
    } else if (key === "PageUp") {
      ev.preventDefault();
      scrollBy(-SCROLL_PAGE);
    } else if (key === "PageDown") {
      ev.preventDefault();
      scrollBy(SCROLL_PAGE);
    }
    // j/k・Home/End は絞り込み中は効かない（`<input>` への通常の文字入力・カーソル移動に任せる）。
    return;
  }

  if (key === "Escape" || key === "Enter" || key === "?") {
    ev.preventDefault();
    close();
    return;
  }
  if (key === "Home") {
    ev.preventDefault();
    scrollTo(0);
    return;
  }
  if (key === "End") {
    ev.preventDefault();
    scrollTo(Number.MAX_SAFE_INTEGER);
    return;
  }
  if (key === "/") {
    ev.preventDefault();
    queryInputEl.value?.focus();
    return;
  }
  if (key === "j" || key === "ArrowDown") {
    ev.preventDefault();
    scrollBy(SCROLL_LINE);
    return;
  }
  if (key === "k" || key === "ArrowUp") {
    ev.preventDefault();
    scrollBy(-SCROLL_LINE);
    return;
  }
  if (key === "PageDown") {
    ev.preventDefault();
    scrollBy(SCROLL_PAGE);
    return;
  }
  if (key === "PageUp") {
    ev.preventDefault();
    scrollBy(-SCROLL_PAGE);
  }
};
</script>

<template>
  <dialog ref="dialogEl" class="help-dialog" aria-label="キー一覧" @cancel="onNativeCancel" @click.self="close" @keydown="onDialogKeydown">
    <div class="help-dialog-search">
      <input ref="queryInputEl" v-model="query" type="text" placeholder="/ で絞り込み" aria-label="キー一覧を絞り込み" />
    </div>
    <div ref="listEl" class="help-dialog-list" tabindex="-1">
      <section v-for="group in filteredGroups" :key="group.name" class="help-dialog-group">
        <h3 class="help-dialog-group-name">{{ group.name }}</h3>
        <dl>
          <template v-for="entry in group.entries" :key="entry.keys + entry.label">
            <dt :class="{ 'help-dialog-grayed': entry.grayed }">{{ entry.keys }}</dt>
            <dd :class="{ 'help-dialog-grayed': entry.grayed }">{{ entry.label }}</dd>
          </template>
        </dl>
      </section>
      <p v-if="filteredGroups.length === 0" class="help-dialog-empty">一致するキーがありません</p>
    </div>
    <div class="help-dialog-actions">
      <button type="button" @click="close">閉じる</button>
    </div>
  </dialog>
</template>

<style scoped>
/* `display` は `[open]` に限定する——`<dialog>` は閉じている間 UA の既定スタイルで `display: none` に
   なるが、`.help-dialog { display: flex }` のように無条件に指定すると author 側の宣言が UA の既定
   （オリジンが低い）を上書きしてしまい、閉じていても描画されクリックを奪ってしまう
   （実機の Chromium を使う smoke（T26）で発見。単体テストは happy-dom で `<dialog>` の描画規則を
   再現しないため見つからなかった）。 */
.help-dialog {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  width: min(40em, 90vw);
  max-height: 80vh;
  padding: 1em;
}
.help-dialog[open] {
  display: flex;
  flex-direction: column;
  gap: 0.75em;
}
.help-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.help-dialog-search input {
  width: 100%;
  font: inherit;
  padding: 0.3em 0.5em;
  box-sizing: border-box;
}
.help-dialog-list {
  overflow-y: auto;
  min-height: 0;
}
.help-dialog-group-name {
  margin: 0.5em 0 0.25em;
  font-size: 0.9em;
  opacity: 0.8;
}
.help-dialog-list dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.15em 1em;
  margin: 0;
}
.help-dialog-list dt {
  font-family: monospace;
  white-space: nowrap;
}
.help-dialog-list dd {
  margin: 0;
}
.help-dialog-grayed {
  opacity: 0.5;
}
.help-dialog-empty {
  opacity: 0.7;
}
.help-dialog-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
