<script setup lang="ts">
import { collectAsk, initialAskState, isAskColor, type AskFormState, type AskPending, type AskQuestion } from "@sodashitsu/protocol";
import { paneNameOf } from "@sodashitsu/client-core";
import { computed, inject, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { focusPaneIfShown } from "../actions/paneFocus.js";
import { AskControllerKey, TerminalRegistryKey } from "../injection.js";
import { useAskStore } from "../store/ask.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）。pane のプログラムが出した質問を、画面の上のダイアログに出す。
 * 形は他のダイアログと同じネイティブ `<dialog>` ＋ `showModal()` だが、**既存の単一の枠（`view.openDialog`）は使わない**——サーバから届く質問が、
 * 開いている設定・確認を潰さないため（`view.askOpen` で `modalOpen` に入り、キーは端末へ流れない）。
 *
 * - 最上部の「どの pane からの質問か」の行は**アプリが描く固定の行**（定義の外）。定義の文字は全て文字として出す（`v-html` を使わない）。
 * - 開いたときのフォーカスは操作部品ではなく見出し（打っている途中の `Space`・`Enter` が回答として効かない。APG の「内容が長いとき」と同じ）。
 * - 背景のクリックでは閉じない（選びかけの回答を守る）。`Esc`・［キャンセル］で取り消す。決定は［決定］・`Ctrl/Cmd+Enter`・1 行の入力欄の `Enter`（IME の変換中は除く）。
 * - 質問が 1 つだけ・`single`・`note: false` のときは、選択肢を**クリック・タップ・`Space`・`Enter`** で選んだときだけ確定する（矢印キーで移っただけでは確定しない）。
 */
const store = useAskStore();
const view = useViewStore();
const session = useSessionStore();
const controller = inject(AskControllerKey, undefined);
const registry = inject(TerminalRegistryKey, undefined);

const dialogEl = ref<HTMLDialogElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);
const mainEl = ref<HTMLElement | null>(null);

const ask = computed<AskPending | null>(() => store.current);
const spec = computed(() => ask.value?.spec ?? null);

/** 入力の状態。質問が替わるたびに既定から作り直す。 */
const form = reactive<AskFormState>({ picked: {}, otherPicked: {}, otherText: {}, text: {}, note: "" });
function resetForm(a: AskPending): void {
  const fresh = initialAskState(a.spec);
  form.picked = fresh.picked;
  form.otherPicked = fresh.otherPicked;
  form.otherText = fresh.otherText;
  form.text = fresh.text;
  form.note = "";
  missing.value = new Set();
  statusWarn.value = false;
  sending.value = false;
}

const missing = ref<Set<string>>(new Set());
const statusWarn = ref(false);
const sending = ref(false);

const collected = computed(() => (spec.value ? collectAsk(spec.value, form) : { answers: {}, custom: [], visible: [], lacking: [] as string[] }));
/** 表示する質問と、振り直した番号。 */
const shown = computed(() => {
  const s = spec.value;
  if (!s) return [] as { q: AskQuestion; index: number; no: number }[];
  const visible = new Set(collected.value.visible);
  let no = 0;
  return s.questions.flatMap((q, index) => (visible.has(q.id) ? [{ q, index, no: ++no }] : []));
});
const statusText = computed(() => {
  const n = collected.value.lacking.length;
  if (statusWarn.value && n > 0) return `未回答 ${n} 件 — 選んでから決定してください`;
  return n > 0 ? `未回答 ${n} 件` : "すべて回答済み";
});

/** 「どの pane からの質問か」（定義の外。pane の名前・workspace・tab）。 */
const origin = computed(() => {
  const a = ask.value;
  if (!a) return "";
  const pane = session.panes.get(a.paneId);
  const name = pane ? paneNameOf(pane) : `pane ${a.paneId}`;
  const tab = pane ? session.tabs.get(pane.tabId) : undefined;
  const ws = tab ? session.workspaces.get(tab.workspaceId) : undefined;
  const where = [ws?.label, tab?.label].filter((v): v is string => typeof v === "string" && v !== "");
  return `pane「${name}」${where.length > 0 ? `（${where.join("／")}）` : ""}のプログラムからの質問`;
});

/** 質問が 1 つだけ・`single`・補足なし（選んだ時点で確定する形）。 */
const instant = computed(() => {
  const s = spec.value;
  return s !== null && s.questions.length === 1 && s.questions[0]!.type === "single" && !s.note;
});

// --- 開閉・フォーカス ------------------------------------------------------------------

let previousFocus: Element | null = null;
let previousPaneId: string | null = null;

watch(
  () => ask.value?.askId ?? null,
  (id, oldId) => {
    const a = ask.value;
    if (a && id !== oldId) {
      resetForm(a);
      void nextTick(() => {
        const el = dialogEl.value;
        if (!el) return;
        if (oldId === null || oldId === undefined) previousFocus = document.activeElement;
        // 前の質問でネイティブに閉じられていても（`cancel` を取り消せないブラウザの 2 回目の Esc 等）、次の質問のために必ず開き直す——
        // でないと見えない質問に `view.askOpen` だけが残り、キーが端末へ流れなくなる。
        if (!el.open) el.showModal();
        view.setAskOpen(true);
        previousPaneId = a.paneId;
        if (mainEl.value) mainEl.value.scrollTop = 0;
        titleEl.value?.focus();
      });
    } else if (!a) {
      closeDialog();
    }
  },
  // 置き直されたとき（ログイン画面・切り離しから戻った等）も、待っている質問があれば描き直す——でないと `view.askOpen` だけが残り、見えない質問にキーを食われる。
  { immediate: true },
);

function closeDialog(): void {
  view.setAskOpen(false);
  dialogEl.value?.close();
  const paneId = previousPaneId;
  const back = previousFocus;
  previousPaneId = null;
  previousFocus = null;
  void nextTick(() => restoreFocus(paneId, back));
}

/**
 * フォーカスの戻し先: ほかのモーダルが開いていればその中（開く前の要素）、そうでなく質問の pane が表示中ならその pane の端末、
 * どちらでもなければ開く前の要素。表示（workspace・tab）は切り替えない。
 */
function restoreFocus(paneId: string | null, back: Element | null): void {
  const otherModal = view.openDialog !== null || view.graphOpen;
  if (!otherModal && paneId !== null && registry) {
    const done = focusPaneIfShown(
      {
        paneTab: (id) => session.panes.get(id)?.tabId,
        shownTab: () => view.tabId,
        focus: (id) => {
          view.focusPane(id);
          registry.focus(id);
        },
      },
      paneId,
    );
    if (done) return;
  }
  if (back instanceof HTMLElement && back.isConnected) back.focus();
}

onBeforeUnmount(() => view.setAskOpen(false));

// --- 操作 ------------------------------------------------------------------------------

function isChecked(q: AskQuestion, value: string): boolean {
  return (form.picked[q.id] ?? []).includes(value);
}
function pick(q: AskQuestion, value: string, on = true): void {
  if (q.type === "multi") {
    const cur = new Set(form.picked[q.id] ?? []);
    if (on) cur.add(value);
    else cur.delete(value);
    form.picked[q.id] = q.options.map((o) => o.value).filter((v) => cur.has(v));
  } else {
    form.picked[q.id] = [value];
    form.otherPicked[q.id] = false;
  }
}
function pickOther(q: AskQuestion, on = true): void {
  form.otherPicked[q.id] = on;
  if (on && q.type === "single") form.picked[q.id] = [];
}
function onOtherInput(q: AskQuestion, ev: Event): void {
  form.otherText[q.id] = (ev.target as HTMLInputElement).value;
  if (form.otherText[q.id] !== "") pickOther(q);
}

/**
 * 直前の操作がポインタ（マウス・タッチ）か。選択肢は `<label>` のカード全体なので、クリックは label から input へ転送された合成の `click` になり、`detail` では
 * 見分けられない——`pointerdown` と `keydown` の新しいほうで覚える。
 */
let lastInputWasPointer = false;
function onPointerdown(): void {
  lastInputWasPointer = true;
}
/** 選択肢が選ばれた（`change`）。即確定の形で、直前の操作がポインタなら確定する（矢印キーで移っただけの `change` は確定しない）。 */
function onOptionChange(q: AskQuestion, value: string, ev: Event): void {
  const checked = (ev.target as HTMLInputElement).checked;
  pick(q, value, checked);
  if (q.type === "single" && checked && instant.value && lastInputWasPointer) void submit();
}
/** 選択肢で `Space`・`Enter`。即確定の形なら選んで確定する。 */
function onOptionKeydown(q: AskQuestion, value: string, ev: KeyboardEvent): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  if (!instant.value || q.type !== "single") return;
  if (ev.key === " " || ev.key === "Enter") {
    if (ev.ctrlKey || ev.metaKey) return; // Ctrl/Cmd+Enter は通常の決定
    ev.preventDefault();
    pick(q, value);
    void submit();
  }
}

async function submit(): Promise<void> {
  const a = ask.value;
  if (!a || !spec.value || sending.value) return;
  const c = collected.value;
  if (c.lacking.length > 0) {
    missing.value = new Set(c.lacking);
    statusWarn.value = true;
    const first = c.lacking[0]!;
    const index = spec.value.questions.findIndex((q) => q.id === first);
    void nextTick(() => document.getElementById(`ask-q-${index}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" }));
    return;
  }
  if (!controller) return;
  sending.value = true;
  const body: { answers: typeof c.answers; custom?: string[]; note?: string } = { answers: c.answers };
  if (c.custom.length > 0) body.custom = c.custom;
  if (c.note !== undefined) body.note = c.note;
  const ok = await controller.answer(a.askId, body);
  if (!ok && ask.value?.askId === a.askId) sending.value = false;
}

async function cancel(): Promise<void> {
  const a = ask.value;
  if (!a || !controller) return;
  sending.value = true;
  await controller.cancel(a.askId);
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault(); // 既定の close は `ask` ストアを更新しないので、こちらで取り消す
  void cancel();
}

function onKeydown(ev: KeyboardEvent): void {
  lastInputWasPointer = false;
  // Teleport でこの dialog の中へ移されたトースト・再接続の表示のキーは扱わない（トーストのボタンで Ctrl+Enter を押しても決定しない）。
  if (!(ev.target as HTMLElement | null)?.closest?.(".ask-header, .ask-main, .ask-footer")) return;
  if (ev.isComposing || ev.keyCode === 229) return;
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    void submit();
  } else if (ev.key === "Enter" && !ev.shiftKey && (ev.target as HTMLElement | null)?.matches?.("input[type=text]")) {
    ev.preventDefault();
    void submit();
  }
}

/** 色の帯（色として妥当なものだけ）。 */
function swatches(colors: readonly string[] | undefined): string[] {
  return (colors ?? []).filter(isAskColor);
}
function groupName(index: number): string {
  return `ask-${ask.value?.askId ?? ""}-${index}`;
}
</script>

<template>
  <dialog id="soda-ask-dialog" ref="dialogEl" class="ask-dialog" aria-labelledby="ask-origin" @cancel="onNativeCancel" @keydown="onKeydown" @pointerdown="onPointerdown">
    <template v-if="ask && spec">
      <header class="ask-header">
        <h2 id="ask-origin" ref="titleEl" class="ask-origin" tabindex="-1" data-ask-origin>{{ origin }}</h2>
      </header>
      <div ref="mainEl" class="ask-main" data-ask-main>
        <h3 class="ask-title" data-ask-title>{{ spec.title }}</h3>
        <p v-if="spec.intro" class="ask-intro">{{ spec.intro }}</p>
        <fieldset
          v-for="item in shown"
          :id="`ask-q-${item.index}`"
          :key="item.q.id"
          class="ask-q"
          :class="{ 'ask-missing': missing.has(item.q.id) && collected.lacking.includes(item.q.id) }"
          data-ask-question
        >
          <legend class="ask-legend">
            <span class="ask-num">{{ item.no }}</span> {{ item.q.label }}
            <span class="ask-kind">{{ item.q.type === "multi" ? "複数選べます" : item.q.type === "text" ? "自由記述" : "1 つ選ぶ" }}</span>
          </legend>
          <p v-if="item.q.help" class="ask-help">{{ item.q.help }}</p>
          <template v-if="item.q.type === 'text'">
            <textarea v-if="item.q.multiline" v-model="form.text[item.q.id]" class="ask-text" rows="4" :placeholder="item.q.placeholder" :maxlength="10000" :aria-label="item.q.label" />
            <input v-else v-model="form.text[item.q.id]" type="text" class="ask-text" :placeholder="item.q.placeholder" :maxlength="10000" :aria-label="item.q.label" />
          </template>
          <div v-else class="ask-options" :style="{ '--ask-min': `${item.q.minWidth ?? 180}px` }">
            <label v-for="o in item.q.options" :key="o.value" class="ask-opt">
              <input
                :type="item.q.type === 'multi' ? 'checkbox' : 'radio'"
                :name="groupName(item.index)"
                :value="o.value"
                :checked="isChecked(item.q, o.value) && !(item.q.type === 'single' && form.otherPicked[item.q.id])"
                @change="onOptionChange(item.q, o.value, $event)"
                @keydown="onOptionKeydown(item.q, o.value, $event)"
              />
              <span class="ask-opt-body">
                <span class="ask-opt-name">{{ o.label }}<span v-if="o.recommended" class="ask-rec">おすすめ</span></span>
                <span v-if="o.desc" class="ask-opt-desc">{{ o.desc }}</span>
                <span v-if="swatches(o.colors).length > 0" class="ask-swatches" aria-hidden="true">
                  <span v-for="(c, i) in swatches(o.colors)" :key="i" class="ask-swatch" :style="{ background: c }" />
                </span>
              </span>
            </label>
            <label v-if="item.q.allowOther" class="ask-opt ask-other">
              <input
                :type="item.q.type === 'multi' ? 'checkbox' : 'radio'"
                :name="groupName(item.index)"
                :checked="form.otherPicked[item.q.id] === true"
                @change="pickOther(item.q, ($event.target as HTMLInputElement).checked)"
              />
              <span class="ask-opt-body">
                <span class="ask-opt-name">{{ item.q.otherLabel ?? "その他" }}</span>
                <input
                  type="text"
                  class="ask-other-text"
                  :value="form.otherText[item.q.id] ?? ''"
                  :placeholder="item.q.otherPlaceholder ?? '自由に入力'"
                  :maxlength="10000"
                  :aria-label="`${item.q.label}（${item.q.otherLabel ?? 'その他'}）`"
                  @input="onOtherInput(item.q, $event)"
                  @focus="pickOther(item.q)"
                />
              </span>
            </label>
          </div>
        </fieldset>
        <fieldset v-if="spec.note" class="ask-q ask-note" data-ask-note>
          <legend class="ask-legend">補足 <span class="ask-kind">任意・選択肢に無い希望があれば</span></legend>
          <textarea v-model="form.note" class="ask-text" rows="3" :placeholder="spec.notePlaceholder" :maxlength="10000" aria-label="補足" />
        </fieldset>
      </div>
      <footer class="ask-footer">
        <span class="ask-status" :class="{ 'ask-warn': statusWarn && collected.lacking.length > 0 }" role="status" data-ask-status>{{ statusText }}</span>
        <button type="button" class="ask-btn" data-ask-cancel :disabled="sending" @click="cancel">キャンセル</button>
        <button type="button" class="ask-btn ask-primary" data-ask-submit :disabled="sending" @click="submit">{{ spec.submit }}</button>
      </footer>
    </template>
  </dialog>
</template>

<style scoped>
.ask-dialog {
  box-sizing: border-box;
  width: min(720px, calc(100% - 16px));
  max-height: calc(100% - 16px);
  padding: 0;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 6px;
  overscroll-behavior: contain;
}
.ask-dialog[open] {
  display: flex;
  flex-direction: column;
}
.ask-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.ask-header {
  flex: none;
  padding: 0.6em 1em;
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.ask-origin {
  margin: 0;
  font-size: 0.95em;
  font-weight: bold;
  overflow-wrap: anywhere;
}
.ask-origin:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.ask-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.8em 1em;
}
.ask-title {
  margin: 0 0 0.3em;
  font-size: 1.1em;
  overflow-wrap: anywhere;
}
.ask-intro,
.ask-help {
  margin: 0 0 0.6em;
  opacity: 0.85;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ask-q {
  margin: 0 0 0.8em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.4em 0.8em 0.7em;
  min-width: 0;
}
.ask-q.ask-missing {
  border-color: var(--soda-error-fg, #ff5555);
}
.ask-legend {
  padding: 0 0.3em;
  font-weight: bold;
  overflow-wrap: anywhere;
}
.ask-num {
  display: inline-block;
  min-width: 1.4em;
  text-align: center;
  border-radius: 999px;
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
  font-size: 0.85em;
}
.ask-kind {
  margin-left: 0.5em;
  font-weight: normal;
  font-size: 0.8em;
  opacity: 0.7;
}
.ask-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(var(--ask-min, 180px), 100%), 1fr));
  gap: 0.4em;
}
.ask-opt {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  min-height: 2rem;
  padding: 0.3em 0.5em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  cursor: pointer;
}
.ask-opt:has(input:checked) {
  border-color: var(--soda-accent, #6070a1);
  background: color-mix(in srgb, var(--soda-accent, #6070a1) 25%, transparent);
}
.ask-opt-body {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  min-width: 0;
  flex: 1;
}
.ask-opt-name {
  overflow-wrap: anywhere;
}
.ask-rec {
  margin-left: 0.5em;
  font-size: 0.75em;
  padding: 0 0.4em;
  border-radius: 3px;
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.ask-opt-desc {
  font-size: 0.8em;
  opacity: 0.75;
  overflow-wrap: anywhere;
}
.ask-swatches {
  display: flex;
  height: 0.6em;
  border-radius: 2px;
  overflow: hidden;
}
.ask-swatch {
  flex: 1;
}
.ask-text,
.ask-other-text {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
  /* iOS Safari は 16px 未満の入力欄へフォーカスすると画面を拡大する */
  font-size: max(16px, 1em);
}
.ask-note {
  margin-bottom: 0;
}
.ask-footer {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6em;
  padding: 0.6em 1em;
  border-top: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
}
.ask-status {
  margin-right: auto;
  font-size: 0.85em;
  opacity: 0.85;
}
.ask-status.ask-warn {
  color: var(--soda-warn-fg, #ffb86c);
  opacity: 1;
}
.ask-btn {
  font: inherit;
  min-height: 2rem;
  padding: 0 1em;
}
.ask-primary {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
  border: 1px solid transparent;
  border-radius: 4px;
}
@media (max-width: 767px) {
  .ask-dialog {
    width: calc(100% - 16px);
  }
  .ask-options {
    grid-template-columns: 1fr;
  }
}
</style>
