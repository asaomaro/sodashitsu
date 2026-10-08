<script lang="ts">
// 枠の定数は `display/framePage.ts` にある。負の対照・テストが、この部品からも読めるよう再 export する。
export { DISPLAY_VIEW_SANDBOX, DISPLAY_VIEW_PAGE, DISPLAY_SCRIPT_VIEW_SANDBOX, DISPLAY_SCRIPT_VIEW_PAGE } from "../display/framePage.js";
/** 固定の文言（枠の外の DOM。枠の中身・題からは変えられない）。 */
export const DISPLAY_NOTE_UNSUPPORTED = "この画面では、この形式の表示を出せません";
export const DISPLAY_NOTE_LOAD_FAILED = "表示を読み込めませんでした";
export const DISPLAY_NOTE_CLOSED = "この表示は閉じられました";
export const DISPLAY_NOTE_CONTENT_FAILED = "表示の中身を取得できませんでした";
export const DISPLAY_NOTE_RENDER_FAILED = "この表示を描けませんでした（次の更新で直ることがあります）";
export const DISPLAY_NOTE_FOCUS_DETACHED = "この表示は、キー入力を取ろうとしたので、この画面では止めました";
</script>

<script setup lang="ts">
import { DISPLAY_PING_INTERVAL_MS, DISPLAY_UNRESPONSIVE_MS, type DisplayContent, type DisplayInfo } from "@sodashitsu/protocol";
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { coverStartsEngage, startFromButton, startFromCover, startFromKey } from "../display/engageEntry.js";
import { FocusGuard } from "../display/focusGuard.js";
import { installFocusOriginTracking, restoreFocus, tabPressedWithin } from "../display/focusOrigin.js";
import { frameKey, framePage } from "../display/framePage.js";
import { readFrameMessage } from "../display/frameMessages.js";
import { registerFrame, unregisterFrame, type RegisteredFrame } from "../display/frameRegistry.js";
import { readThemeVars } from "../display/themeVars.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";

/**
 * 表示の面の枠 1 つ（静的な形式 `text`・`markdown`・`html` と、スクリプトが動く形式 `script-html`。20261007-soda-extensions の design「枠とのやりとり」「スクリプトが動く形式」）。
 * 隔離した iframe（`allow-same-origin` なし）に、`MessageChannel` の port 経由で中身を渡す。
 * - 枠ごとの乱数の**合い札**（`?t=`）。`display-ready` は、**送り主がその iframe の窓**・状態が待ち・合い札が合う、の 1 回だけ受ける。
 *   通り道と中身を渡すのは、その合図と、**最初の `load`** の両方を見た後だけ。以後、枠の `window` の `message` は受けず、port だけを聞く。
 * - 移ったことは、**`load` の回数だけ**で決める（2 回目以降の `load` は必ず「移った」。どの形式でも同じ）。見回り（`ping`）は、画面が見えている間だけ数える。
 * - 知らない形式（`framePage` が `null`）と、スクリプトが動く形式を出せると名乗っていない画面は、枠を作らず、固定の文言を出す。
 * - **スクリプトが動く形式だけ**: 覆いと「操作を始める」（`engageEntry`）・フォーカスの番（`focusGuard`・`focusOrigin`）。利用者が操作を始めるまでは、枠がフォーカスを持つ
 *   ことを許さず、元の場所へ戻して、サーバへ「取られた」と知らせる（数えて閉じるのはサーバ）。`render` は 1 回だけ（版が替わったら、置く側が枠ごと作り直す）。
 */
const props = defineProps<{ info: DisplayInfo; content?: DisplayContent | undefined }>();

const controller = inject(DisplayControllerKey, null);
const host = inject(DisplayHostKey, null);
const store = useDisplayStore();

/** この画面が出せる枠の頁（スクリプトが動く形式は、この画面が出せると名乗っているときだけ）。 */
const page = computed(() => {
  const p = framePage(props.info.format);
  if (p?.kind === "script" && !store.scriptCapable) return null;
  return p;
});
const isScript = computed(() => page.value?.kind === "script");
const iframeEl = ref<HTMLIFrameElement | null>(null);
const phase = ref<"waiting" | "connected" | "closed">("waiting");
const note = ref<string | null>(null);
/** 枠が「描けなかった」と知らせた（次の `rendered` で消す。枠は残る）。 */
const renderFailed = ref(false);
const loads = ref(0);
const ticket = ref("");
/** iframe の作り直しの印（形式が替わったときなど）。 */
const gen = ref(0);
/** 利用者が操作を始めた（スクリプトが動く形式。`guard.engaged` の写し。覆いと表示が見る）。 */
const engagedRef = ref(false);
/** フォーカスを取り続けたので、この画面では枠を外した（［もう一度出す］を出す）。 */
const detached = ref(false);

const guard = new FocusGuard();
let readySeen = false;
let renderSent = false;
let port: MessagePort | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let patrolTimer: ReturnType<typeof setInterval> | null = null;
let focusTimer: ReturnType<typeof setInterval> | null = null;
let offMessage: (() => void) | null = null;
let lastReply = 0;
let pingN = 0;
let lastOwnFocusAt = -Infinity;
let handlingSteal = false;

/** 自分で枠へフォーカスを移した直後に、静的な枠が知らせる `foreign-focus` を無視する時間。 */
const OWN_FOCUS_IGNORE_MS = 800;
/** `Tab` で入ったと見なす時間。 */
const TAB_IGNORE_MS = 500;
/** スクリプトが動く枠の、フォーカスの見回り（イベントが起きないブラウザへの備え）。 */
const FOCUS_PATROL_MS = 250;

const src = computed(() => (page.value ? `${page.value.page}?t=${ticket.value}` : ""));
const visibleNote = computed<string | null>(() => {
  if (page.value === null) return DISPLAY_NOTE_UNSUPPORTED;
  return phase.value === "closed" ? (note.value ?? DISPLAY_NOTE_CLOSED) : null;
});
const showCover = computed(() => isScript.value && phase.value !== "closed" && !engagedRef.value);

function newTicket(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function clearTimers(): void {
  if (handshakeTimer !== null) clearTimeout(handshakeTimer);
  if (patrolTimer !== null) clearInterval(patrolTimer);
  handshakeTimer = null;
  patrolTimer = null;
}
function closePort(): void {
  if (port) {
    port.onmessage = null;
    port.close();
  }
  port = null;
}

/** 枠を（作り直して）最初の状態にする。 */
function start(): void {
  clearTimers();
  closePort();
  readySeen = false;
  renderSent = false;
  renderFailed.value = false;
  detached.value = false;
  loads.value = 0;
  note.value = null;
  phase.value = "waiting";
  guard.leave();
  syncGuardState();
  gen.value++;
  if (page.value === null) {
    syncFocusPatrol();
    return;
  }
  ticket.value = newTicket();
  syncFocusPatrol();
  handshakeTimer = setTimeout(() => {
    handshakeTimer = null;
    if (phase.value === "waiting") fail(DISPLAY_NOTE_LOAD_FAILED);
  }, DISPLAY_UNRESPONSIVE_MS);
}

/** 枠を外して固定の文言にする（知らせは送らない）。 */
function fail(text: string): void {
  clearTimers();
  closePort();
  phase.value = "closed";
  note.value = text;
  guard.leave();
  syncGuardState();
  releaseFocus();
}
/** 枠を外し、サーバへ知らせて面を閉じる。 */
function closeAndReport(problem: "navigated" | "unresponsive"): void {
  fail(DISPLAY_NOTE_CLOSED);
  void controller?.report(props.info.id, problem, { paneId: props.info.paneId, format: props.info.format });
}
/** フォーカスがこの枠にあったなら、その pane の端末へ戻す。 */
function releaseFocus(): void {
  if (store.focusedDisplayId === props.info.id) {
    store.setFocused(null);
    host?.focusTerminal(props.info.paneId);
  }
}

function onLoad(): void {
  if (phase.value === "closed") return;
  loads.value++;
  // 期待する load は最初の 1 回だけ（どの形式でも）。2 回目以降は、枠が別の文書へ移った。
  if (loads.value >= 2) {
    closeAndReport("navigated");
    return;
  }
  tryConnect();
}

function onWindowMessage(ev: MessageEvent): void {
  const win = iframeEl.value?.contentWindow;
  if (!win || ev.source !== win) return; // 送り主がこの iframe の窓でないものは、丸ごと無視する
  const d = ev.data as { type?: unknown; t?: unknown } | null;
  if (!d || typeof d !== "object" || d.type !== "display-ready") return;
  if (phase.value !== "waiting" || readySeen) return; // 受けるのは 1 回だけ。以後は port だけ
  if (d.t !== ticket.value) {
    fail(DISPLAY_NOTE_LOAD_FAILED); // 別の文書に替わっている。通り道も中身も渡さない（知らせは送らない）
    return;
  }
  readySeen = true;
  tryConnect();
}

function tryConnect(): void {
  const win = iframeEl.value?.contentWindow;
  if (phase.value !== "waiting" || !readySeen || loads.value < 1 || !win) return;
  if (handshakeTimer !== null) clearTimeout(handshakeTimer);
  handshakeTimer = null;
  const ch = new MessageChannel();
  port = ch.port1;
  port.onmessage = onPortMessage;
  win.postMessage({ type: "display-init", v: 1 }, "*", [ch.port2]);
  phase.value = "connected";
  lastReply = Date.now();
  startPatrol();
  sendRender();
}

function sendRender(): void {
  if (!port || phase.value !== "connected") return;
  // スクリプトが動く形式は、1 回だけ（版が替わったら、置く側が枠ごと作り直す）。
  if (isScript.value && renderSent) return;
  const c = props.content;
  const i = props.info;
  // 手元の中身が、いまの見出しと同じ面・同じ版・同じ形式のときだけ送る（形式・版が替わった直後の前の中身を、新しい枠へ送らない）。
  if (!c || c.id !== i.id || c.rev !== i.rev || c.format !== i.format) return;
  const theme = readThemeVars();
  // prefix のキーは、スクリプトが動く形式の枠には渡さない（信頼しない中身に、利用者のキーの設定を教えない）。
  const k = isScript.value ? undefined : host?.prefixKey();
  port.postMessage({ type: "render", rev: c.rev, format: c.format, source: c.content, theme, relayKeys: k ? [k] : [] });
  if (isScript.value) renderSent = true;
}

function onPortMessage(ev: MessageEvent): void {
  const m = readFrameMessage(ev.data);
  if (!m) return;
  switch (m.type) {
    case "pong":
      lastReply = Date.now();
      return;
    case "rejected":
      fail(DISPLAY_NOTE_UNSUPPORTED);
      return;
    case "failed":
      renderFailed.value = true;
      return;
    case "action":
      controller?.sendAction(props.info.id, m.rev, m.action, m.data);
      return;
    case "key":
      if (isScript.value) {
        // 操作中の `escape` だけ受ける（prefix は受けない。操作中でなければ捨てる）。
        if (!guard.acceptKey(m.key)) return;
        guard.leave();
        syncGuardState();
        host?.focusTerminal(props.info.paneId);
        return;
      }
      // 静的な形式: フォーカスがこの枠にあるときだけ受ける。
      if (store.focusedDisplayId !== props.info.id) return;
      host?.focusTerminal(props.info.paneId);
      store.setFocused(null);
      if (m.key === "prefix") host?.injectPrefix();
      return;
    case "foreign-focus":
      onForeignFocus();
      return;
    case "rendered":
      renderFailed.value = false;
      return;
  }
}

// --- 見回り（画面が見えている間だけ数える）-------------------------------------------------------------------
function startPatrol(): void {
  if (patrolTimer !== null) clearInterval(patrolTimer);
  patrolTimer = setInterval(() => {
    if (phase.value !== "connected" || document.visibilityState !== "visible") return;
    if (Date.now() - lastReply >= DISPLAY_UNRESPONSIVE_MS) {
      closeAndReport("unresponsive");
      return;
    }
    port?.postMessage({ type: "ping", n: ++pingN });
  }, DISPLAY_PING_INTERVAL_MS);
}
function onVisibility(): void {
  if (document.visibilityState === "visible") lastReply = Date.now(); // 見えるようになったら、そこから数え直す
}

// --- フォーカス ------------------------------------------------------------------------------------------
const frameHasFocus = (): boolean => iframeEl.value !== null && document.activeElement === iframeEl.value;

/** 静的な形式: フォーカスが枠にあるか（操作中の表示）。 */
function updateFocusStatic(): void {
  if (frameHasFocus()) store.setFocused(props.info.id);
  else if (store.focusedDisplayId === props.info.id) store.setFocused(null);
}
/** `guard` の状態を、画面の表示（覆い・操作中の縁）へ写す。操作中のときだけ、フォーカスが枠にある面として示す。 */
function syncGuardState(): void {
  engagedRef.value = guard.engaged;
  if (guard.engaged && guard.focused) store.setFocused(props.info.id);
  else if (store.focusedDisplayId === props.info.id) store.setFocused(null);
}

/** スクリプトが動く形式: いまのフォーカスを見て、「操作中でないのに枠が取った」に変わったときだけ、戻して知らせる。 */
function checkScriptFocus(): void {
  if (!isScript.value || iframeEl.value === null) return;
  const verdict = guard.observe(frameHasFocus());
  syncGuardState();
  if (verdict === "steal") onSteal();
}

function onSteal(): void {
  if (handlingSteal) return;
  handlingSteal = true;
  try {
    const el = iframeEl.value;
    if (el === null) return;
    // 1. すぐ戻す（覚えた元の場所。無い・`body` なら、利用者が選んでいる pane の端末）。2. 戻ったかを確かめる（だめなら blur してもう 1 回）。
    const restored = restoreFocus(el, () => host?.focusSelectedTerminal());
    guard.observe(frameHasFocus());
    syncGuardState();
    // 3. 画面が見えていれば、サーバへ「1 回取られた」と知らせる（サーバが pane ごとに数える）。送れなかったとき（切断中）は、この画面の中で数える。
    reportSteal();
    // それでも戻らなければ、この画面の枠を外す。
    if (!restored) detach();
  } finally {
    handlingSteal = false;
  }
}
function reportSteal(): void {
  if (document.visibilityState !== "visible") return;
  const ctx = { paneId: props.info.paneId, format: props.info.format };
  const p = controller?.report(props.info.id, "focus_steal", ctx);
  if (p === undefined) {
    if (guard.noteUnreported()) detach();
    return;
  }
  void p.then((sent) => {
    if (!sent && guard.noteUnreported()) detach();
  });
}
/** フォーカスを取り続けるので、この画面では枠を外す（固定の文言と［もう一度出す］）。 */
function detach(): void {
  if (phase.value === "closed") return;
  fail(DISPLAY_NOTE_FOCUS_DETACHED);
  detached.value = true;
}
function redisplay(): void {
  start();
}

/** 静的な枠が「よそからフォーカスが来た」と知らせた。利用者が `Tab` で入ったのでも、こちらが移したのでもなければ、元の場所へ戻す（回数には数えない）。 */
function onForeignFocus(): void {
  if (isScript.value) return;
  const now = Date.now();
  if (now - lastOwnFocusAt < OWN_FOCUS_IGNORE_MS || tabPressedWithin(TAB_IGNORE_MS)) return;
  const el = iframeEl.value;
  if (el === null || !frameHasFocus()) return;
  restoreFocus(el, () => host?.focusSelectedTerminal());
  updateFocusStatic();
}

/** スクリプトが動く枠のときだけ、フォーカスの見回りを回す（イベントが起きないブラウザへの備え）。 */
function syncFocusPatrol(): void {
  if (isScript.value && page.value !== null && focusTimer === null) {
    focusTimer = setInterval(checkScriptFocus, FOCUS_PATROL_MS);
  } else if ((!isScript.value || page.value === null) && focusTimer !== null) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
}

function onFocusSignal(): void {
  if (isScript.value) checkScriptFocus();
  else updateFocusStatic();
}
function onWindowBlur(): void {
  // `blur` の時点では `activeElement` がまだ iframe に替わっていないことがあるので、1 拍置いて見る。
  setTimeout(onFocusSignal, 0);
}
function onDocFocusIn(ev: Event): void {
  // 枠でない要素にフォーカスが移った: 操作を終える。そのあとで枠が取り返したら、新しい「取った」。
  if (isScript.value && ev.target !== iframeEl.value) guard.leave();
  onFocusSignal();
}
/** 操作中に、枠でない場所を押した（フォーカスを受けない余白を含む）: 操作を終える。枠が自分の `blur` で取り返しても、次の見回りで「取った」と分かる。 */
function onDocPointerDown(ev: Event): void {
  if (!isScript.value || !guard.engaged) return;
  const t = ev.target;
  if (t instanceof Node && (t === iframeEl.value || iframeEl.value?.contains(t))) return;
  guard.leave();
  syncGuardState();
  setTimeout(checkScriptFocus, 0);
}

// --- 操作を始める（スクリプトが動く形式）-----------------------------------------------------------------------
/** 操作を始める: 覆いを外し、枠へフォーカスを移す。 */
function engageNow(): void {
  const el = iframeEl.value;
  if (!isScript.value || el === null || phase.value === "closed") return;
  guard.engage();
  el.focus();
  port?.postMessage({ type: "focus" });
  guard.observe(frameHasFocus());
  syncGuardState();
}
function onCoverClick(): void {
  if (coverStartsEngage()) startFromCover(engageNow);
  else store.nudgeEngage(props.info.id); // 押しても始まらない。［操作する］ボタンを 1 秒だけ強調して、場所を教える
}
function onCoverWheel(ev: WheelEvent): void {
  const scale = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
  port?.postMessage({ type: "scroll", dx: ev.deltaX * scale, dy: ev.deltaY * scale });
}

const handle: RegisteredFrame = {
  focusInside() {
    if (isScript.value) {
      // `prefix+i`: そのキーが上がる（`keyup`）のを親が受けてから始める。
      startFromKey(engageNow);
      return;
    }
    lastOwnFocusAt = Date.now();
    iframeEl.value?.focus();
    port?.postMessage({ type: "focus" });
    updateFocusStatic();
  },
  engageFromButton(ev) {
    if (isScript.value) startFromButton(ev, engageNow);
  },
};

onMounted(() => {
  installFocusOriginTracking();
  window.addEventListener("message", onWindowMessage);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", onFocusSignal);
  window.addEventListener("focusin", onDocFocusIn);
  window.addEventListener("focusout", onWindowBlur);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("visibilitychange", onVisibility);
  syncFocusPatrol();
  registerFrame(props.info.id, handle);
  // `sodactl display send` のデータを、スクリプトが動く枠へ渡す（保存しない。いま描いている枠だけ）。
  offMessage =
    controller?.onMessage(props.info.id, (data) => {
      if (isScript.value && port && phase.value === "connected") port.postMessage({ type: "message", data });
    }) ?? null;
});
// 合い札・待ちの時計は、最初の描画の前（setup）で用意する（描画の後に作り直すと iframe が作り直される）。
start();
onBeforeUnmount(() => {
  window.removeEventListener("message", onWindowMessage);
  window.removeEventListener("blur", onWindowBlur);
  window.removeEventListener("focus", onFocusSignal);
  window.removeEventListener("focusin", onDocFocusIn);
  window.removeEventListener("focusout", onWindowBlur);
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("visibilitychange", onVisibility);
  if (focusTimer !== null) clearInterval(focusTimer);
  focusTimer = null;
  offMessage?.();
  unregisterFrame(props.info.id, handle);
  // 片づけのとき（面が閉じた・版や形式が替わって部品が外れる）、操作中でないのにフォーカスが枠にあれば、元の場所へ戻して「取られた」と 1 回知らせてから外す
  // （取ってから、見回りが気づく前に `close`・版の置き換えで枠を外させる、という逃げ方をさせない）。合い札の合わない合図・時間切れでは送らない。
  const el = iframeEl.value;
  if (isScript.value && el !== null && phase.value !== "closed" && !guard.engaged && frameHasFocus()) {
    restoreFocus(el, () => host?.focusSelectedTerminal());
    reportSteal();
  }
  clearTimers();
  closePort();
  releaseFocus();
});

// 形式が替わったら iframe を作り直す（置く側の `:key` に加えた、二重の守り）。スクリプトが動く形式は版が替わっても作り直す（`render` は 1 回だけ）。
watch(
  () => props.info.format,
  () => {
    releaseFocus();
    start();
  },
);
watch(
  () => props.info.rev,
  () => {
    if (isScript.value) {
      releaseFocus();
      start();
    }
  },
);
// 中身が無い・版が古いときは取る。
watch(
  () => [props.info.id, props.info.rev, props.info.format] as const,
  () => {
    const c = props.content;
    if (page.value && (!c || c.rev !== props.info.rev || c.format !== props.info.format)) void controller?.ensureContent(props.info.id);
  },
  { immediate: true },
);
watch(() => [props.content, props.info.rev, props.info.format, phase.value], sendRender);

defineExpose({ key: () => frameKey(props.info) });
</script>

<template>
  <div class="display-frame-wrap" :data-display-phase="phase" :data-display-engaged="isScript ? (engagedRef ? '1' : '0') : undefined">
    <iframe
      v-if="page && phase !== 'closed'"
      :key="gen"
      ref="iframeEl"
      class="display-frame"
      :class="{ 'display-frame-script': isScript }"
      :sandbox="page.sandbox"
      referrerpolicy="no-referrer"
      :src="src"
      :title="isScript ? 'pane のプログラムの表示（隔離・スクリプト）' : 'pane のプログラムの表示（隔離）'"
      :tabindex="isScript ? -1 : undefined"
      data-display-frame
      :data-display-script="isScript ? '' : undefined"
      :data-display-loads="loads"
      @load="onLoad"
    ></iframe>
    <div
      v-if="showCover"
      class="display-frame-cover"
      aria-hidden="true"
      data-display-cover
      @mousedown.prevent
      @pointerdown="store.nudgeEngage(info.id)"
      @click="onCoverClick"
      @wheel.passive="onCoverWheel"
    ></div>
    <p v-if="renderFailed && phase === 'connected'" class="display-frame-note" data-display-render-failed>{{ DISPLAY_NOTE_RENDER_FAILED }}</p>
    <p v-if="store.contentFailed.has(info.id)" class="display-frame-note" data-display-content-failed>{{ DISPLAY_NOTE_CONTENT_FAILED }}</p>
    <p v-if="visibleNote" class="display-frame-note" data-display-note>
      {{ visibleNote }}
      <button v-if="detached" type="button" class="display-frame-redisplay" data-display-redisplay @click="redisplay">もう一度出す</button>
    </p>
  </div>
</template>

<style scoped>
.display-frame-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.display-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--soda-bg, #1e1f29);
}
/* 覆い: 操作を始める前の枠の上。ポインタのイベントは受けるが、枠の中へは届かない（アプリの DOM）。 */
.display-frame-cover {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: transparent;
  cursor: default;
}
.display-frame-note {
  margin: 0;
  padding: 0.5em 0.8em;
  font-size: 0.85em;
  color: var(--soda-fg, #f8f8f2);
  opacity: 0.8;
}
.display-frame-redisplay {
  font: inherit;
  margin-left: 0.5em;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 4px;
  cursor: pointer;
}
</style>
