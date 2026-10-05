<script setup lang="ts">
import type { AskAnswerBody, AskPending } from "@sodashitsu/protocol";
import { shortId } from "@sodashitsu/protocol";
import { paneNameOf } from "@sodashitsu/client-core";
import { computed, inject, nextTick, onBeforeUnmount, ref, toRaw, watch } from "vue";
import { focusPaneIfShown } from "../actions/paneFocus.js";
// 副作用: `<ask-form>` を登録する（型だけの import は消えるので、別に書く）。
import "../ask/askFormElement.js";
import type { AskFormElement, AskFormSubmitDetail } from "../ask/askFormElement.js";
import { AskControllerKey, TerminalRegistryKey } from "../injection.js";
import AskViewer, { type AskViewKey } from "./AskViewer.vue";
import { useAskStore, type AskEntry } from "../store/ask.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）。pane のプログラムが出した質問を、画面の上のダイアログに出す。
 * 形は他のダイアログと同じネイティブ `<dialog>` ＋ `showModal()` だが、**既存の単一の枠（`view.openDialog`）は使わない**——サーバから届く質問が、
 * 開いている設定・確認を潰さないため（`view.askOpen` で `modalOpen` に入り、キーは端末へ流れない）。
 *
 * ここは**枠だけ**（20261003-ask-form-component）。質問・選択肢・入力欄・質問の目次・下のボタン・未回答の表示・キーは、部品 `<ask-form>`
 * （`third_party/ask-form/ask-form.js`。Shadow DOM）が描いて扱う。枠が持つのは、固定の行・開閉・フォーカス・取り消し・高さ・通信への取り次ぎ。
 *
 * - 最上部の「どの pane からの質問か」の行は**アプリが描く固定の行**（定義の外・部品の外）。定義の文字は部品が全て文字として出す（`innerHTML` を使わない）。
 * - 開いたときのフォーカスは操作部品ではなく見出し（打っている途中の `Space`・`Enter` が回答として効かない。APG の「内容が長いとき」と同じ）。
 * - 背景のクリックでは閉じない（選びかけの回答を守る）。`Esc`・部品の［キャンセル］で取り消す。決定は部品（［決定］・`Ctrl/Cmd+Enter`・1 行の入力欄の `Enter`）。
 * - 部品のキーは部品の中にフォーカスがあるときだけ効く。固定の行にフォーカスがある間の `Ctrl/Cmd+Enter`・`Alt+PageDown/Up` は、枠が部品へ取り次ぐ。
 * - 定義（`spec`）は Vue の束縛では渡さない——入れるたびに部品が全部描き直して入力が消えるので、質問が替わったときに**命令的に 1 回だけ**入れる。
 */
const store = useAskStore();
const view = useViewStore();
const session = useSessionStore();
const controller = inject(AskControllerKey, undefined);
const registry = inject(TerminalRegistryKey, undefined);

const dialogEl = ref<HTMLDialogElement | null>(null);
const headerEl = ref<HTMLElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);
const formEl = ref<AskFormElement | null>(null);

const ask = computed<AskEntry | null>(() => store.current);

/** 質問を出した pane の名前（固定の行・成果物の枠のラベルに使う。アプリが持つ値）。 */
const paneName = computed(() => {
  const a = ask.value;
  if (!a) return "";
  const pane = session.panes.get(a.paneId);
  return pane ? paneNameOf(pane) : `pane ${shortId(a.paneId)}`;
});
/** 成果物（`view`）つきか。つきなら左（モバイルは上）に枠を置き、ダイアログを広く・高く固定する。 */
const views = computed(() => ask.value?.resolved?.views ?? []);
const hasView = computed(() => views.value.length > 0);
/**
 * 成果物の枠へ渡す配色（アプリのテーマの明暗）。`ThemeController` が root に当てた `color-scheme`（`light`／`dark`）に合わせ、
 * 当たっていないときだけ OS の設定を見る。質問が替わるたびに読み直す（開いている間のテーマ変更には追従しない）。
 */
const dark = computed(() => {
  void ask.value;
  const scheme = document.documentElement.style.colorScheme;
  if (scheme === "dark") return true;
  if (scheme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
});

/** 「どの pane からの質問か」（定義の外。pane の名前・workspace・tab）。 */
const origin = computed(() => {
  const a = ask.value;
  if (!a) return "";
  const pane = session.panes.get(a.paneId);
  const name = paneName.value;
  const tab = pane ? session.tabs.get(pane.tabId) : undefined;
  const ws = tab ? session.workspaces.get(tab.workspaceId) : undefined;
  const where = [ws?.label, tab?.label].filter((v): v is string => typeof v === "string" && v !== "");
  return `pane「${name}」${where.length > 0 ? `（${where.join("／")}）` : ""}のプログラムからの質問`;
});

// --- 開閉・フォーカス ------------------------------------------------------------------

let previousFocus: Element | null = null;
let previousPaneId: string | null = null;
/** 部品が最後に答えた「中身の高さ」。0 は「大きさが取れていない」（描けなかった・単体テストの環境）。下の `watch` は `immediate` なので、その前に置く。 */
let contentHeight = 0;
/** いま部品に入っている定義の質問（`askId`）。部品が遅れて出す `ask-unsupported` を、その時点の先頭ではなく、定義を入れた質問に結び付ける。 */
let loadedAskId: string | null = null;

watch(
  () => ask.value?.askId ?? null,
  (id, oldId) => {
    const a = ask.value;
    if (a && id !== oldId) {
      void nextTick(() => {
        const el = dialogEl.value;
        if (!el) return;
        if (oldId === null || oldId === undefined) previousFocus = document.activeElement;
        // 前の質問でネイティブに閉じられていても（`cancel` を取り消せないブラウザの 2 回目の Esc 等）、次の質問のために必ず開き直す——
        // でないと見えない質問に `view.askOpen` だけが残り、キーが端末へ流れなくなる。
        if (!el.open) el.showModal();
        view.setAskOpen(true);
        previousPaneId = a.paneId;
        titleEl.value?.focus();
        // 開いた後（大きさが取れるようになってから）に入れる。同じ `askId` のままの再描画ではここを通らない＝入力が消えない。
        window.addEventListener("resize", onResize);
        loadSpec(a);
      });
    } else if (!a) {
      closeDialog();
    }
  },
  // 置き直されたとき（ログイン画面・切り離しから戻った等）も、待っている質問があれば描き直す——でないと `view.askOpen` だけが残り、見えない質問にキーを食われる。
  { immediate: true },
);

function closeDialog(): void {
  window.removeEventListener("resize", onResize);
  contentHeight = 0;
  loadedAskId = null; // 質問が無くなった後に遅れて届く ask-unsupported で、古い質問を取り消さない
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

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  view.setAskOpen(false);
});

// --- 部品へ定義を入れる・高さ ----------------------------------------------------------

/**
 * 部品に与えられる最大の高さ。ダイアログは `max-height: calc(100% - 16px)`（枠線を含む）で、その中に固定の行と部品が縦に並ぶ。
 */
function maxFormHeight(): number {
  const el = dialogEl.value;
  if (!el) return 0;
  const style = getComputedStyle(el);
  const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const header = headerEl.value?.getBoundingClientRect().height ?? 0;
  return Math.max(0, Math.floor(window.innerHeight - 16 - border - header));
}

/** 部品の高さを「中身」に合わせる（最大は超えない）。大きさが取れていなければ与えた高さを消し、中身に任せる。 */
function applyHeight(): void {
  const el = formEl.value;
  if (!el) return;
  if (hasView.value) {
    // 成果物つきは、ダイアログの高さを使える最大に固定し、部品はその残りを埋める（中身に縮めない。成果物を広く見せる）。
    el.style.removeProperty("height");
    return;
  }
  if (contentHeight > 0) el.style.height = `${Math.min(maxFormHeight(), contentHeight)}px`;
  else el.style.removeProperty("height");
}

/**
 * 目次が出ているとき、その幅の分だけダイアログの幅を広げる（質問の並びの幅を 720px のときと同じに保つ。画面の幅 − 16px は超えない。CSS 側の `min()`）。
 * 目次が出ていない（出さない定義・幅 768px 未満で部品が隠している）ときは 0。部品の `indexWidth` は、目次を出すかを決めた後（`relayout()` の後）に読む。
 */
function applyWidth(): void {
  const el = formEl.value;
  const dlg = dialogEl.value;
  if (!el || !dlg) return;
  if (hasView.value) {
    dlg.style.removeProperty("--ask-index-width"); // 成果物つきは幅が固定（目次の幅の分だけ広げない）
    return;
  }
  const w = el.indexWidth;
  if (w > 0) dlg.style.setProperty("--ask-index-width", `${w}px`);
  else dlg.style.removeProperty("--ask-index-width");
}

/**
 * 新しい質問の定義を部品へ入れる（ask-form の単独ウィンドウ `form.html` と同じ手順）: 先に最大の高さを与える → `spec`（部品は高さが付いていれば、
 * 入れた直後に目次を出すかを決める）→ `relayout()`（高さがまだ 0 だった場合の保険。同じ高さなので決め方は変わらない）→ 目次の幅の分だけ幅を広げる
 * → 広げた幅での中身の高さに合わせる（幅が変わると文の折り返しで高さが変わるので、幅を先に決める）。
 * 渡すのは写し——部品は定義に書き込む（`_image` 等）ので、store の定義（リアクティブ）をそのまま渡さない。
 */
function loadSpec(a: AskEntry): void {
  const el = formEl.value;
  if (!el) return;
  contentHeight = 0;
  loadedAskId = a.askId;
  el.style.height = `${maxFormHeight()}px`;
  el.busy = false;
  // メディアの参照（`media:<id>`）は、サーバから取り終えた `data:` の URL だけに解く（それ以外の参照・URL は渡さない）。`spec` を入れた時に同期で呼ばれる。
  const urls = a.resolved?.urls ?? {};
  el.resolveMedia = (ref: string) => (Object.hasOwn(urls, ref) ? (urls[ref] ?? null) : null);
  // 前の質問で広げた幅を外してから入れる——部品は入れた直後に、今の幅で目次を出すかを決める（広いままだと、収まるとみなして出さない）
  dialogEl.value?.style.removeProperty("--ask-index-width");
  try {
    el.spec = structuredClone(toRaw(a.spec));
  } catch (err) {
    // 起きない見込み（定義は JSON 由来）。前の質問の中身を残さず、描けない定義と同じに扱う。
    el.spec = null;
    applyHeight();
    unsupported(a.askId, `clone failed: ${String(err)}`);
    return;
  }
  el.relayout();
  applyWidth();
  contentHeight = el.contentHeight;
  applyHeight();
}

/**
 * 画面の大きさが変わった。幅・高さを当て直すだけ（目次を出すかは決め直さない——入力中の欄を見失わせない、部品の決まり）。
 * 目次が出ているかは、部品が画面の幅（768px 未満で隠す）で決めるので、幅は読み直す。
 */
function onResize(): void {
  applyWidth();
  if (contentHeight > 0 && formEl.value) contentHeight = formEl.value.contentHeight;
  applyHeight();
}

/**
 * 自由記述のボタンが押された（部品の中の `click` は `composed` で Shadow DOM の外へ届く。部品のボタン自身のリスナーが先に走り、欄は開閉済み）。
 * 欄の開閉で中身の高さが変わるので、その場で（同期で。1 フレームだけ中がスクロールして戻るのを避ける）読み直して当て直す。
 * 反応するのはこのボタンの `click` だけ——絞り込みの入力や表示条件の出し入れで高さが変わっても、今までどおりダイアログの高さは変えない（打っている欄が動かないように）。
 * 幅・目次は決め直さない。枠が部品の内部の属性（`data-ask-comment-toggle`）を読む唯一の例外（`third_party/ask-form/README.md`）。
 */
function onFormClick(ev: Event): void {
  const t = ev.composedPath()[0];
  if (!(t instanceof Element) || !t.matches("[data-ask-comment-toggle]")) return;
  if (loadedAskId === null || loadedAskId !== ask.value?.askId || contentHeight <= 0 || !formEl.value) return;
  contentHeight = formEl.value.contentHeight;
  applyHeight();
}

// --- 操作 ------------------------------------------------------------------------------

/** 部品の決定（`ask-submit`。未回答があるときは出ない）。回答を送り、送れなかったらもう一度決定できるように戻す（知らせるのは `AskController` のトースト）。 */
async function onSubmit(ev: Event): Promise<void> {
  const a = ask.value;
  const el = formEl.value;
  if (!a || !el || !controller) return;
  // 部品は ask-form の単独ウィンドウと共用で、`detail` にはここで使わない項目（`edited` 等）が入りうる。サーバが知っている項目だけを送る。
  const detail = (ev as CustomEvent<AskFormSubmitDetail>).detail;
  const body: AskAnswerBody = { answers: detail.answers };
  if (detail.custom !== undefined) body.custom = detail.custom;
  if (detail.edited !== undefined) body.edited = detail.edited;
  if (detail.note !== undefined) body.note = detail.note;
  if (detail.comments !== undefined) body.comments = detail.comments;
  el.busy = true;
  const ok = await controller.answer(a.askId, body);
  if (!ok && ask.value?.askId === a.askId) el.busy = false;
}

/** 取り消す（部品の［キャンセル］・`Esc`）。送信中でも取り消せる（`busy` を見ない）。 */
async function cancel(): Promise<void> {
  const a = ask.value;
  if (!a || !controller) return;
  if (formEl.value) formEl.value.busy = true;
  await controller.cancel(a.askId);
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault(); // 既定の close は `ask` ストアを更新しないので、こちらで取り消す
  void cancel();
}

/**
 * 部品が描けない（`ask-unsupported`。検査済みの定義では、部品の中の例外でしか起きない）。部品にはボタンが無く利用者は答えられないので、
 * 取り消して知らせる（sodactl には `cancelled`）。理由は定義に由来する文字列（質問の id・型の名前・例外の文）を含むので、画面には出さない。
 * 部品はこのイベントをマイクロタスクで遅らせて出すので、届いた時点の先頭の質問ではなく、**定義を入れた質問**を取り消す
 * （その間に先頭が替わっていても、描けなかった質問でないものを取り消さない）。
 */
function unsupported(askId: string, reason: string): void {
  console.warn(`[ask] cannot render the form (askId=${askId}): ${reason}`);
  view.toast("このフォームは、この画面では出せません（質問は取り消しました）");
  void controller?.cancel(askId);
}
function onUnsupported(ev: Event): void {
  if (loadedAskId === null) return;
  unsupported(loadedAskId, String((ev as CustomEvent<{ reason?: unknown }>).detail?.reason));
}

/**
 * 枠が部品へ取り次ぐキー。部品の中のキーは部品が扱い、扱ったものは外へ流さない（ここへは届かない）。ここで扱うのは、**固定の行にフォーカスがあるとき**
 * （開いた直後）だけ——部品が扱わずに流したキー（`target` は `<ask-form>`）や、Teleport でこの dialog の中へ移されたトースト・再接続の表示のキーは扱わない
 * （トーストのボタンで Ctrl+Enter を押しても決定しない）。
 */
function onKeydown(ev: KeyboardEvent): void {
  const el = formEl.value;
  if (!el || !(ev.target as HTMLElement | null)?.closest?.(".ask-header, .ask-viewer")) return;
  if (ev.isComposing || ev.keyCode === 229) return;
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    el.submit();
  } else if (ev.altKey && (ev.key === "PageDown" || ev.key === "PageUp")) {
    // 部品の公開のメソッドで次・前の質問へ移る（端の質問では何も起きない。表示条件で隠れている質問は部品が飛ばす）。
    ev.preventDefault();
    el.step(ev.key === "PageUp" ? -1 : 1);
  }
}

/** 成果物の枠の中で押されたキー（枠が `postMessage` で渡す。`AskViewer` が `event.source` を確かめた後）。枠の外のキーと同じ処理を呼ぶ。 */
function onViewKey(key: AskViewKey): void {
  const el = formEl.value;
  if (key === "cancel") void cancel();
  // 決定は枠からの知らせだけでは確定しない（成果物のスクリプトは本物のキー操作と同じ知らせを送れる）。質問側の固定の行へフォーカスを移し、利用者がもう一度
  // Ctrl/Cmd+Enter（`onKeydown`）か［決定］で確定する。
  else if (key === "submit") titleEl.value?.focus();
  else el?.step(key === "prev" ? -1 : 1);
}
</script>

<template>
  <dialog id="soda-ask-dialog" ref="dialogEl" class="ask-dialog" :class="{ 'has-view': hasView }" aria-labelledby="ask-origin" @cancel="onNativeCancel" @keydown="onKeydown">
    <template v-if="ask">
      <header ref="headerEl" class="ask-header">
        <h2 id="ask-origin" ref="titleEl" class="ask-origin" tabindex="-1" data-ask-origin>{{ origin }}</h2>
        <!-- 外部 URL の画像の取得に失敗して外した件数（アプリが描く固定の文。定義の文字は使わない）。 -->
        <p v-if="(ask.warnings ?? 0) > 0" class="ask-warn" data-ask-warnings>画像 {{ ask.warnings }} 件を取得できませんでした（プレビューなしで出しています）</p>
      </header>
      <div class="ask-body" :class="{ 'has-view': hasView }">
        <AskViewer v-if="hasView" class="ask-view" :items="views" :pane-name="paneName" :dark="dark" @key="onViewKey" />
        <ask-form ref="formEl" class="ask-form" @ask-submit="onSubmit" @ask-cancel="cancel" @ask-unsupported="onUnsupported" @click="onFormClick" />
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.ask-dialog {
  box-sizing: border-box;
  /* 目次が出ているとき（`applyWidth`）は、その幅の分だけ広げる。画面の幅 − 16px は超えない。 */
  width: min(calc(720px + var(--ask-index-width, 0px)), calc(100% - 16px));
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
/* 成果物つき: 広く・高く固定する（左に成果物・右に質問）。成果物の無い質問は今までどおり（`.ask-body` は箱を作らない）。 */
.ask-body:not(.has-view) {
  display: contents;
}
.ask-dialog.has-view {
  width: min(1400px, calc(100% - 16px));
  height: calc(100% - 16px);
}
.ask-body.has-view {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
.ask-body.has-view .ask-view {
  flex: 1 1 0;
}
.ask-body.has-view .ask-form {
  /* 質問の幅。下の行の［キャンセル］と［決定］（長い文言・幅の広いフォントでは 400px を超える）が、ボタンの中で折り返さず 1 行に収まるよう、430px より広げる（Windows の幅の広いフォントを想定）。
     成果物の枠が狭くなりすぎないよう、ダイアログの幅の 44% を 430〜560px の範囲にする。 */
  flex: 0 0 clamp(430px, 44%, 560px);
  min-width: 0;
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
.ask-warn {
  margin: 0.3em 0 0;
  font-size: 0.85em;
  opacity: 0.95;
}
.ask-origin:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
/* 部品（`<ask-form>`）。中身に合わせて伸び、枠の高さの上限に当たったら部品の中がスクロールする。配色は部品の 7 つの変数にテーマの変数を割り当てる
   （任意の 3 つは渡さない——部品が `color-mix` で作る）。 */
.ask-form {
  flex: 1 1 auto;
  min-height: 0;
  --ask-bg: var(--soda-menu-bg, #282a36);
  --ask-fg: var(--soda-fg, #f8f8f2);
  --ask-border: var(--soda-menu-border, #44475a);
  --ask-accent: var(--soda-accent, #6070a1);
  --ask-accent-fg: var(--soda-accent-fg, #f8f8f2);
  --ask-error: var(--soda-error-fg, #ff5555);
  --ask-warn: var(--soda-warn-fg, #ffb86c);
}
@media (max-width: 767px) {
  .ask-dialog {
    width: calc(100% - 16px);
  }
  /* 成果物つきは縦積み（成果物を上・質問を下）。 */
  .ask-body.has-view {
    flex-direction: column;
  }
  .ask-body.has-view .ask-view {
    flex: 0 0 42%;
  }
  .ask-body.has-view .ask-form {
    flex: 1 1 auto;
  }
}
</style>
