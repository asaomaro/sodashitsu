<script lang="ts">
// 枠の定数は `display/framePage.ts` にある。負の対照・テストが、この部品からも読めるよう再 export する。
export { DISPLAY_VIEW_SANDBOX, DISPLAY_VIEW_PAGE } from "../display/framePage.js";
/** 固定の文言（枠の外の DOM。枠の中身・題からは変えられない）。 */
export const DISPLAY_NOTE_UNSUPPORTED = "この画面では、この形式の表示を出せません";
export const DISPLAY_NOTE_LOAD_FAILED = "表示を読み込めませんでした";
export const DISPLAY_NOTE_CLOSED = "この表示は閉じられました";
export const DISPLAY_NOTE_CONTENT_FAILED = "表示の中身を取得できませんでした";
export const DISPLAY_NOTE_RENDER_FAILED = "この表示を描けませんでした（次の更新で直ることがあります）";
</script>

<script setup lang="ts">
import { DISPLAY_PING_INTERVAL_MS, DISPLAY_UNRESPONSIVE_MS, type DisplayContent, type DisplayInfo } from "@sodashitsu/protocol";
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { frameKey, framePage } from "../display/framePage.js";
import { readFrameMessage } from "../display/frameMessages.js";
import { registerFrame, unregisterFrame, type RegisteredFrame } from "../display/frameRegistry.js";
import { readThemeVars } from "../display/themeVars.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";

/**
 * 表示の面の枠 1 つ（静的な形式。20261007-soda-extensions の design「枠とのやりとり」）。隔離した iframe（`allow-same-origin` なし）に、`MessageChannel` の port 経由で中身を渡す。
 * - 枠ごとの乱数の**合い札**（`?t=`）。`display-ready` は、**送り主がその iframe の窓**・状態が待ち・合い札が合う、の 1 回だけ受ける。
 *   通り道と中身を渡すのは、その合図と、**最初の `load`** の両方を見た後だけ。以後、枠の `window` の `message` は受けず、port だけを聞く。
 * - 移ったことは、**`load` の回数だけ**で決める（2 回目以降の `load` は必ず「移った」）。見回り（`ping`）は、画面が見えている間だけ数える。
 * - 知らない形式（`framePage` が `null`）は枠を作らず、固定の文言を出す。
 */
const props = defineProps<{ info: DisplayInfo; content?: DisplayContent | undefined }>();

const controller = inject(DisplayControllerKey, null);
const host = inject(DisplayHostKey, null);
const store = useDisplayStore();

const page = computed(() => framePage(props.info.format));
const iframeEl = ref<HTMLIFrameElement | null>(null);
const phase = ref<"waiting" | "connected" | "closed">("waiting");
const note = ref<string | null>(null);
/** 枠が「描けなかった」と知らせた（次の `rendered` で消す。枠は残る）。 */
const renderFailed = ref(false);
const loads = ref(0);
const ticket = ref("");
/** iframe の作り直しの印（形式が替わったときなど）。 */
const gen = ref(0);

let readySeen = false;
let port: MessagePort | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let patrolTimer: ReturnType<typeof setInterval> | null = null;
let lastReply = 0;
let pingN = 0;

const src = computed(() => (page.value ? `${page.value.page}?t=${ticket.value}` : ""));
const visibleNote = computed<string | null>(() => {
  if (page.value === null) return DISPLAY_NOTE_UNSUPPORTED;
  return phase.value === "closed" ? (note.value ?? DISPLAY_NOTE_CLOSED) : null;
});

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
  renderFailed.value = false;
  loads.value = 0;
  note.value = null;
  phase.value = "waiting";
  gen.value++;
  if (page.value === null) return;
  ticket.value = newTicket();
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
  releaseFocus();
}
/** 枠を外し、サーバへ知らせて面を閉じる。 */
function closeAndReport(problem: "navigated" | "unresponsive"): void {
  fail(DISPLAY_NOTE_CLOSED);
  controller?.report(props.info.id, problem, { paneId: props.info.paneId, format: props.info.format });
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
  // 期待する load は最初の 1 回だけ。2 回目以降は、枠が別の文書へ移った。
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
  const c = props.content;
  const i = props.info;
  // 手元の中身が、いまの見出しと同じ面・同じ版・同じ形式のときだけ送る（形式・版が替わった直後の前の中身を、新しい枠へ送らない）。
  if (!c || c.id !== i.id || c.rev !== i.rev || c.format !== i.format) return;
  const theme = readThemeVars();
  const k = host?.prefixKey();
  port.postMessage({ type: "render", rev: c.rev, format: c.format, source: c.content, theme, relayKeys: k ? [k] : [] });
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
      // フォーカスがこの枠にあるときだけ受ける。
      if (store.focusedDisplayId !== props.info.id) return;
      host?.focusTerminal(props.info.paneId);
      store.setFocused(null);
      if (m.key === "prefix") host?.injectPrefix();
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

// --- フォーカス（枠にあるか）--------------------------------------------------------------------------------
function updateFocus(): void {
  const el = iframeEl.value;
  const inside = el !== null && document.activeElement === el;
  if (inside) store.setFocused(props.info.id);
  else if (store.focusedDisplayId === props.info.id) store.setFocused(null);
}
function onWindowBlur(): void {
  // `blur` の時点では `activeElement` がまだ iframe に替わっていないことがあるので、1 拍置いて見る。
  setTimeout(updateFocus, 0);
}

const handle: RegisteredFrame = {
  focusInside() {
    iframeEl.value?.focus();
    port?.postMessage({ type: "focus" });
    updateFocus();
  },
};

onMounted(() => {
  window.addEventListener("message", onWindowMessage);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", updateFocus);
  window.addEventListener("focusin", updateFocus);
  window.addEventListener("focusout", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibility);
  registerFrame(props.info.id, handle);
});
// 合い札・待ちの時計は、最初の描画の前（setup）で用意する（描画の後に作り直すと iframe が作り直される）。
start();
onBeforeUnmount(() => {
  window.removeEventListener("message", onWindowMessage);
  window.removeEventListener("blur", onWindowBlur);
  window.removeEventListener("focus", updateFocus);
  window.removeEventListener("focusin", updateFocus);
  window.removeEventListener("focusout", onWindowBlur);
  document.removeEventListener("visibilitychange", onVisibility);
  unregisterFrame(props.info.id, handle);
  clearTimers();
  closePort();
  releaseFocus();
});

// 形式が替わったら iframe を作り直す（置く側の `:key` に加えた、二重の守り）。
watch(
  () => props.info.format,
  () => {
    releaseFocus();
    start();
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
  <div class="display-frame-wrap" :data-display-phase="phase">
    <iframe
      v-if="page && phase !== 'closed'"
      :key="gen"
      ref="iframeEl"
      class="display-frame"
      :sandbox="page.sandbox"
      referrerpolicy="no-referrer"
      :src="src"
      title="pane のプログラムの表示（隔離）"
      data-display-frame
      :data-display-loads="loads"
      @load="onLoad"
    ></iframe>
    <p v-if="renderFailed && phase === 'connected'" class="display-frame-note" data-display-render-failed>{{ DISPLAY_NOTE_RENDER_FAILED }}</p>
    <p v-if="store.contentFailed.has(info.id)" class="display-frame-note" data-display-content-failed>{{ DISPLAY_NOTE_CONTENT_FAILED }}</p>
    <p v-if="visibleNote" class="display-frame-note" data-display-note>{{ visibleNote }}</p>
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
.display-frame-note {
  margin: 0;
  padding: 0.5em 0.8em;
  font-size: 0.85em;
  color: var(--soda-fg, #f8f8f2);
  opacity: 0.8;
}
</style>
