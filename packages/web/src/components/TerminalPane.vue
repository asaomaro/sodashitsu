<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { TerminalRegistryKey } from "../injection.js";
import type { TermEntry } from "../term/TerminalRegistry.js";
import { shouldMarkSeen, useSeenStore } from "../store/seen.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";

/**
 * `TerminalRegistry.acquire` で xterm.js の要素を借りて差し込む（architecture「4. tab の切替」）。
 * サイズ権限が無ければ `terminal-pane-scaled`（縦横比を保って縮小。CSS 側で対応。design「サイズ権限」）。
 * `status:'failed'`（design「再起動後の復元」）の pane は xterm.js を作らず、理由だけを表示する。
 */
const props = defineProps<{ paneId: string }>();

const registry = inject(TerminalRegistryKey);
if (!registry) throw new Error("TerminalPane: TerminalRegistryKey が provide されていません");

const session = useSessionStore();
const view = useViewStore();
const seen = useSeenStore();

const pane = computed(() => session.panes.get(props.paneId));
const failed = computed(() => pane.value?.status === "failed");
const hasSizeAuthority = computed(() => (pane.value ? session.hasSizeAuthority(pane.value.tabId) : false));

const mountPoint = ref<HTMLElement | null>(null);
let entry: TermEntry | null = null;

/**
 * 端末の入力欄（xterm.js の textarea）を Tab で止まる場所にするのは、選ばれている pane だけ（roving tabindex。D110・独立点検 #2）。
 * 端末は Tab をそのまま受け取るので、選ばれていない pane の端末が Tab の順に並んでいると、端末の外から Tab で来たときにそこで
 * 止まり、選ばれている pane の枠（`PaneFrame`）へ届かない（`view.focusedPaneId` と違う pane にキーが入る食い違いにもなる）。
 * クリック・`term.focus()` でのフォーカスは今までどおり。xterm.js は作るときに 0 を付けるだけなので、上書きしてよい。
 */
function syncTabStop(): void {
  const textarea = entry?.term.textarea;
  if (textarea) textarea.tabIndex = view.focusedPaneId === props.paneId ? 0 : -1;
}

onMounted(() => {
  if (failed.value) return;
  entry = registry.acquire(props.paneId);
  mountPoint.value?.appendChild(entry.element);
  syncTabStop();
  if (view.focusedPaneId === props.paneId) entry.term.focus();
  // 20260925-seen-semantics-fix（design「振る舞いの詳細」手順3）：この pane が今まさに表示
  // された、という事実そのものなので paneVisible は自明に true。ウィンドウが既にフォーカス
  // されたまま表示に切り替わった遷移を拾う——main.ts の発火点（completionSeq の変化・window
  // の focus）だけでは拾えなかった（`registry.isVisible` が非 reactive なため）。
  const agent = pane.value?.agent;
  if (agent && shouldMarkSeen(true, document.hasFocus())) seen.markSeen(agent.instanceId, agent.completionSeq);
});

onBeforeUnmount(() => {
  if (!entry) return;
  entry.element.remove();
  registry.release(props.paneId);
  entry = null;
});

watch(
  () => view.focusedPaneId,
  (id) => {
    syncTabStop();
    if (id === props.paneId) entry?.term.focus();
  },
);

/** M1：pane へのクリックは、アプリがマウス報告を求めていてもフォーカスの移動を先に行う。
 *  capture フェーズで受けることで、xterm.js 自身のマウス処理（bubble フェーズ）より先に走らせる。 */
function onMouseDownCapture(): void {
  view.focusPane(props.paneId);
}
</script>

<template>
  <div class="terminal-pane" :class="{ 'terminal-pane-scaled': !hasSizeAuthority }" @mousedown.capture="onMouseDownCapture">
    <div v-if="failed" class="terminal-pane-failed">{{ pane?.failure ?? "起動できませんでした" }}</div>
    <div v-else ref="mountPoint" class="terminal-pane-mount" />
  </div>
</template>

<style scoped>
.terminal-pane {
  width: 100%;
  height: 100%;
  overflow: hidden;
  overscroll-behavior: contain;
}
.terminal-pane-mount {
  width: 100%;
  height: 100%;
}
.terminal-pane-scaled .terminal-pane-mount {
  display: flex;
  align-items: center;
  justify-content: center;
}
.terminal-pane-failed {
  padding: 1em;
  color: var(--soda-error-fg, #ff5555);
}
</style>
