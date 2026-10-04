<script setup lang="ts">
import { inject, ref, watch } from "vue";
import { ConnectionKey } from "../injection.js";
import { useResizeDrag } from "../composables/useResizeDrag.js";

/**
 * pane の境界（M2。architecture「マウス操作」・APG の Window Splitter）。Pointer Events でドラッグし、
 * 動いている間は `layout.set_split_ratio` を 50ms 間隔にまとめて送る。キーボードの矢印で 2% ずつ動かす。
 * `Esc` で始めた比へ戻し、ダブルクリックで半分にする（20261004-ui-interaction-polish）。
 */
const props = defineProps<{
  splitId: string;
  tabId: string;
  ratio: number;
  dir: "right" | "down";
}>();

const conn = inject(ConnectionKey);
if (!conn) throw new Error("Splitter: ConnectionKey が provide されていません");

const STEP = 0.02;
const SEND_INTERVAL_MS = 50;

const localRatio = ref(props.ratio);
const el = ref<HTMLElement | null>(null);

let sendTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRatio: number | null = null;

function clamp(r: number): number {
  return Math.min(0.95, Math.max(0.05, r));
}

function send(ratio: number): void {
  void conn!.request("layout.set_split_ratio", { tabId: props.tabId, splitId: props.splitId, ratio }).catch(() => undefined);
}

function scheduleSend(ratio: number): void {
  pendingRatio = ratio;
  if (sendTimer) return;
  sendTimer = setTimeout(() => {
    sendTimer = null;
    if (pendingRatio === null) return;
    const ratioToSend = pendingRatio;
    pendingRatio = null;
    send(ratioToSend);
  }, SEND_INTERVAL_MS);
}

/** ためていた送信を捨てる（取り消し・リセットの後に、ドラッグ中の比で上書きされないように）。 */
function dropPendingSend(): void {
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = null;
  pendingRatio = null;
}

/** 戻す先の比で今すぐ送る（取り消し・リセット）。 */
function sendNow(ratio: number): void {
  dropPendingSend();
  localRatio.value = ratio;
  send(ratio);
}

/**
 * ドラッグ・`Esc`・ダブルクリック・見た目は `useResizeDrag` と `resize-handle`（20261004-ui-interaction-polish）。
 * 始めた時点の比・位置・親の大きさを `begin` が持ち帰る。
 */
interface DragStart {
  ratio: number;
  client: number;
  size: number;
}
const drag = useResizeDrag<DragStart>({
  axis: props.dir === "right" ? "x" : "y",
  enabled: () => !!el.value?.parentElement,
  begin(ev) {
    const rect = el.value!.parentElement!.getBoundingClientRect();
    return {
      ratio: localRatio.value,
      client: props.dir === "right" ? ev.clientX : ev.clientY,
      size: props.dir === "right" ? rect.width : rect.height,
    };
  },
  move(ev, start) {
    if (start.size <= 0) return;
    const client = props.dir === "right" ? ev.clientX : ev.clientY;
    const next = clamp(start.ratio + (client - start.client) / start.size);
    localRatio.value = next;
    scheduleSend(next);
  },
  commit() {
    // 送信は 50ms ごとに済んでいる（最後の分もタイマーが送る）。
  },
  cancel(start) {
    sendNow(start.ratio);
  },
  reset() {
    sendNow(0.5);
  },
});

watch(
  () => props.ratio,
  (next) => {
    if (!drag.dragging.value) localRatio.value = next;
  },
);

function onKeydown(ev: KeyboardEvent): void {
  const growKey = props.dir === "right" ? "ArrowRight" : "ArrowDown";
  const shrinkKey = props.dir === "right" ? "ArrowLeft" : "ArrowUp";
  if (ev.key !== growKey && ev.key !== shrinkKey) return;
  ev.preventDefault();
  const next = clamp(localRatio.value + (ev.key === growKey ? STEP : -STEP));
  localRatio.value = next;
  scheduleSend(next);
}
</script>

<template>
  <div
    ref="el"
    role="separator"
    :aria-orientation="dir === 'right' ? 'vertical' : 'horizontal'"
    :aria-valuenow="Math.round(localRatio * 100)"
    aria-valuemin="5"
    aria-valuemax="95"
    tabindex="0"
    class="splitter resize-handle"
    :class="[dir, dir === 'right' ? 'resize-handle-x' : 'resize-handle-y', { 'resize-handle-active': drag.dragging.value }]"
    @pointerdown="drag.onPointerDown"
    @pointermove="drag.onPointerMove"
    @pointerup="drag.onPointerEnd"
    @pointercancel="drag.onPointerEnd"
    @lostpointercapture="drag.onPointerEnd"
    @keydown="onKeydown"
  />
</template>

<style scoped>
/* 05-e2e-docs T3 の E2E で発見：この component にも `<style>` が一度も存在しなかった（PaneLayout.vue と
 * 同様の欠落。D92）。`flex: none` で固定の太さにし、ドラッグ・キーボードで動かせることが見た目にも
 * 分かるよう境界線の色を付ける。 */
.splitter {
  flex: none;
  background: var(--soda-menu-border, #44475a);
  touch-action: none;
}
/* 掴める印・focus の印は、`resize-handle`（`styles/resizeHandle.css`）の強調の線が受け持つ（以前の `:focus-visible` の背景と outline は置き換えた）。 */
/* 太さは `PaneFrame.vue` の枠と同じ CSS 変数（`--soda-pane-gap`。既定 4px。20260922-appearance-settings-rest）。 */
.splitter.right {
  width: var(--soda-pane-gap, 4px);
  cursor: col-resize;
}
.splitter.down {
  height: var(--soda-pane-gap, 4px);
  cursor: row-resize;
}
</style>
