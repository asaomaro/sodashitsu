<script setup lang="ts">
/**
 * グラフの上の、サブエージェントの記録を**読むだけの窓**（20261008-graph-first の PR6c・AC-U4）。端末の窓（`GraphTerminalWindow`）と同じ見た目の枠（見出しをつかんで動かす・縁で大きさを変える・［×］）。
 * 端末の窓は端末・窓の記憶・3 つの上限に結びついていて、枠だけを借りられない（守りの領域を変えずに済ませるため、同じ見た目の部品を別に持つ）。**端末の窓の数（3 つ）には数えない**——この窓は同時に 1 つで、別の小さなノードを開けば入れ替わる。
 *
 * - 入力はできない（「読むだけ。サブエージェントには、入力できません」と常に出す）。`agent.subagent_transcript` を 1.5 秒ごとに呼び、続きを下に足す（見ている画面の下端にいるときだけ、自動で追う）。
 * - **中身は文字として出す**（`{{ }}` だけ。`v-html`・リンクにしない・画像を読まない）。道具の結果は折りたたみ（先頭だけ）。
 * - 窓が見えている間（このコンポーネントが居て、ブラウザのタブが隠れていない間）だけ読む。サブエージェントが終わっても、窓を閉じるまで読める（サーバが、窓を開いたときに報告されていたものは許す）。
 * - 場所は送らない（pane の id・サブエージェントの id・続きの位置だけ）。読めない理由はサーバの固定の文をそのまま出す。
 * - `Esc` で閉じる（`closed`）。キーは、この窓の外（グラフ画面のズーム・ノードの操作）へ渡さない。色は `--soda-*`、角・影・高さは様式のトークン。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { AgentSubagentTranscriptResult, SubagentTranscriptEntry } from "@sodashitsu/protocol";
import { ConnectionKey } from "../../injection.js";

const props = defineProps<{
  paneId: string;
  agentId: string;
  /** 見出しに出す名前（親の pane の呼び名）。 */
  parentName: string;
  /** 種類と説明（見出し）。 */
  title: string;
}>();
const emit = defineEmits<{ close: [] }>();

const conn = inject(ConnectionKey, undefined);

const POLL_MS = 1500;
/** 窓に溜める件数の上限（古いものから捨てる）。 */
const KEEP_MAX = 800;
const W = 440;
const H = 380;

interface Row {
  n: number;
  e: SubagentTranscriptEntry;
}
const rows = ref<Row[]>([]);
let seq = 0;
let offset: number | undefined;
const omittedBefore = ref(false);
/** 1 行が長すぎて、一部を省いた（一度でもあれば出す）。 */
const clipped = ref(false);
const running = ref(true);
type Status = "loading" | "ok" | "pending" | "unreadable" | "gone" | "error";
const status = ref<Status>("loading");
const reason = ref("");

const scroller = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);

function apply(r: AgentSubagentTranscriptResult): void {
  const el = scroller.value;
  const atBottom = !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
  if (r.reset) {
    rows.value = [];
    omittedBefore.value = false;
    clipped.value = false;
  }
  if (r.omittedBefore) omittedBefore.value = true;
  if (r.clipped) clipped.value = true;
  running.value = r.running;
  offset = r.offset;
  if (r.status === "ok") {
    status.value = "ok";
    if (r.entries.length > 0) {
      const next = [...rows.value, ...r.entries.map((e) => ({ n: seq++, e }))];
      if (next.length > KEEP_MAX) {
        next.splice(0, next.length - KEEP_MAX);
        omittedBefore.value = true;
      }
      rows.value = next;
    }
  } else if (r.status === "pending") {
    status.value = "pending";
  } else {
    status.value = "unreadable";
    reason.value = r.reason ?? "記録を読めません";
  }
  if (atBottom)
    void nextTick(() => {
      if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
    });
}

let inflight = false;
let stopped = false;
async function poll(): Promise<void> {
  if (inflight || stopped || !conn) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // 見えていない間は読まない
  inflight = true;
  try {
    const r = await conn.request("agent.subagent_transcript", {
      paneId: props.paneId,
      agentId: props.agentId,
      ...(offset !== undefined ? { offset } : {}),
    });
    if (!stopped) apply(r);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "not_found") {
      // 居なくなった（エージェントが入れ替わった・許可が切れた・知らない id）。今までの表示は残し、読むのを止める。
      status.value = "gone";
      stopped = true;
      stop();
    } else {
      status.value = "error"; // つなぎ直せば続く。理由の詳細は出さない
    }
  } finally {
    inflight = false;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
function stop(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

// --- 位置（窓を、親の箱の右上に置く。見出しをつかんで動かす。大きさは縁の CSS の resize）----------------------------------------
/** 最初の上の位置（右上の「キー一覧」の表示と重ならないよう、少し下げる）。 */
const TOP = 56;
const pos = ref({ x: 16, y: TOP });
let drag: { px: number; py: number; x: number; y: number } | null = null;
function boxOfParent(): { w: number; h: number } {
  const p = root.value?.parentElement;
  return { w: p?.clientWidth ?? 0, h: p?.clientHeight ?? 0 };
}
function clampPos(x: number, y: number): { x: number; y: number } {
  const b = boxOfParent();
  const w = root.value?.offsetWidth ?? W;
  const h = root.value?.offsetHeight ?? H;
  return { x: Math.max(0, Math.min(x, Math.max(0, b.w - w))), y: Math.max(0, Math.min(y, Math.max(0, b.h - h))) };
}
function onGripDown(ev: PointerEvent): void {
  if (ev.button !== 0) return;
  drag = { px: ev.clientX, py: ev.clientY, x: pos.value.x, y: pos.value.y };
  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
}
function onGripMove(ev: PointerEvent): void {
  if (!drag) return;
  pos.value = clampPos(drag.x + ev.clientX - drag.px, drag.y + ev.clientY - drag.py);
}
function onGripUp(): void {
  drag = null;
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("close");
    return;
  }
  // 窓の中のキー（スクロール・折りたたみの開閉）を、グラフ画面（ズーム・ノードの操作）へ渡さない。Tab は窓の外へ出られるよう、止めない。
  if (ev.key !== "Tab") ev.stopPropagation();
}

onMounted(() => {
  const b = boxOfParent();
  if (b.w > 0) pos.value = clampPos(b.w - W - 16, TOP);
  void poll();
  timer = setInterval(() => void poll(), POLL_MS);
  void nextTick(() => root.value?.focus({ preventScroll: true }));
});
onBeforeUnmount(() => {
  stopped = true;
  stop();
});

const heading = computed(() => `${props.title || "サブエージェント"} — ${props.parentName}`);
const note = computed(() => {
  switch (status.value) {
    case "loading":
      return "読み込んでいます…";
    case "pending":
      return "記録がまだありません（始まったばかりです）";
    case "unreadable":
      return reason.value;
    case "gone":
      return "このサブエージェントの記録は、もう読めません（今までの表示は残してあります）";
    case "error":
      return "記録を取れませんでした（つなぎ直すと続きます）";
    default:
      return rows.value.length === 0 ? "まだ書かれたものがありません" : "";
  }
});
const preview = (t: string): string => t.replace(/\s+/g, " ").slice(0, 80);
</script>

<template>
  <section
    ref="root"
    class="sat"
    role="region"
    aria-label="サブエージェントの記録（読むだけ）"
    tabindex="-1"
    data-subagent-transcript
    :data-agent-id="agentId"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${W}px`, height: `${H}px` }"
    @keydown="onKeydown"
    @pointerdown.stop
    @wheel.stop
  >
    <header class="sat-head">
      <div
        class="sat-grip"
        @pointerdown="onGripDown"
        @pointermove="onGripMove"
        @pointerup="onGripUp"
        @pointercancel="onGripUp"
      >
        <span class="sat-name" :title="heading">{{ heading }}</span>
        <span class="sat-state" data-subagent-transcript-state>{{ running ? "実行中" : "終了" }}</span>
      </div>
      <button type="button" class="sat-btn sat-close" aria-label="記録の窓を閉じる" @click="emit('close')">×</button>
    </header>
    <div ref="scroller" class="sat-body" role="log" aria-live="off" tabindex="0" aria-label="記録">
      <p v-if="omittedBefore" class="sat-note">長いので、先頭のほうを省いています</p>
      <p v-if="clipped" class="sat-note" data-subagent-transcript-clipped>一部を省いています</p>
      <template v-for="r in rows" :key="r.n">
        <div v-if="r.e.kind === 'prompt'" class="sat-row sat-prompt" data-kind="prompt">
          <span class="sat-tag">指示</span>
          <span class="sat-text">{{ r.e.text }}</span>
        </div>
        <div v-else-if="r.e.kind === 'say'" class="sat-row sat-say" data-kind="say">
          <span class="sat-tag">発言</span>
          <span class="sat-text">{{ r.e.text }}</span>
        </div>
        <div v-else-if="r.e.kind === 'tool'" class="sat-row sat-tool" data-kind="tool">
          <span class="sat-tag">道具</span>
          <span class="sat-text"><strong>{{ r.e.name }}</strong> {{ r.e.text }}</span>
        </div>
        <details v-else class="sat-row sat-result" data-kind="result">
          <summary>
            <span class="sat-tag">{{ r.e.error ? "結果（エラー）" : "結果" }}</span>
            <span class="sat-preview">{{ preview(r.e.text) }}</span>
          </summary>
          <pre class="sat-pre">{{ r.e.text }}{{ r.e.truncated ? "\n…（先頭だけ）" : "" }}</pre>
        </details>
      </template>
      <p v-if="note" class="sat-note" role="status" data-subagent-transcript-note>{{ note }}</p>
    </div>
    <footer class="sat-foot">読むだけ。サブエージェントには、入力できません</footer>
  </section>
</template>

<style scoped>
.sat {
  position: absolute;
  z-index: 40;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 280px;
  min-height: 160px;
  max-width: 100%;
  max-height: 100%;
  resize: both;
  overflow: hidden;
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  box-shadow: var(--soda-shape-shadow, 0 4px 16px rgb(0 0 0 / 45%));
  font-size: 12px;
}
.sat:focus {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.sat-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: var(--soda-shape-control-h, 0px);
  padding: 2px var(--soda-shape-pad-x, 6px);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  font-size: 0.9em;
}
.sat-grip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  align-self: stretch;
  cursor: move;
  touch-action: none;
  user-select: none;
}
.sat-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.sat-state {
  flex: none;
  color: var(--soda-state-idle, #8a9ad0);
}
.sat-btn {
  flex: none;
  min-height: var(--soda-shape-control-h, 0px);
  padding: 1px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-s, 3px);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sat-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.sat-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 6px 8px;
  user-select: text;
}
.sat-row {
  display: flex;
  gap: 8px;
  margin: 0 0 6px;
  line-height: 1.45;
}
.sat-tag {
  flex: none;
  min-width: 3.2em;
  color: var(--soda-state-idle, #8a9ad0);
  font-size: 0.9em;
}
.sat-text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sat-prompt .sat-text {
  color: color-mix(in srgb, var(--soda-fg, #f8f8f2) 85%, transparent);
}
.sat-tool .sat-text {
  color: color-mix(in srgb, var(--soda-fg, #f8f8f2) 78%, transparent);
}
.sat-result {
  display: block;
}
.sat-result summary {
  display: flex;
  gap: 8px;
  cursor: pointer;
  color: color-mix(in srgb, var(--soda-fg, #f8f8f2) 70%, transparent);
}
.sat-preview {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sat-pre {
  margin: 4px 0 0 0;
  padding: 4px 6px;
  max-height: 14em;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--soda-subtle-bg, #343746);
  border-radius: var(--soda-shape-radius-s, 3px);
  font-family: var(--soda-mono, monospace);
  font-size: 0.95em;
}
.sat-note {
  margin: 4px 0;
  color: var(--soda-warn-fg, #ffb86c);
}
.sat-foot {
  flex: none;
  padding: 3px var(--soda-shape-pad-x, 8px);
  border-top: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: color-mix(in srgb, var(--soda-fg, #f8f8f2) 70%, transparent);
  font-size: 0.9em;
}
</style>
