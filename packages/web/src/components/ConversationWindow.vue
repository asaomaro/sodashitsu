<script setup lang="ts">
import { findMessageLine, clientErrorMessage, errorCodeOf } from "@sodashitsu/client-core";
import { computed, inject, nextTick, onUnmounted, ref, watch } from "vue";
import type { ConversationMessage, ConversationSummary } from "@sodashitsu/protocol";
import { ConnectionKey, TerminalRegistryKey } from "../injection.js";
import { useConversationWindowStore } from "../store/conversationWindow.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
const store = useConversationWindowStore(),
  session = useSessionStore(),
  settings = useSettingsStore();
const conn = inject(ConnectionKey, null),
  registry = inject(TerminalRegistryKey, undefined);
const messages = ref<ConversationMessage[]>([]),
  next = ref<number | null>(0),
  error = ref(""),
  busy = ref(false),
  partial = ref(false),
  summary = ref<ConversationSummary | null>(null),
  selected = ref<string | null>(null),
  body = ref<HTMLElement | null>(null),
  note = ref("");
const messageOrder = ref<"oldest" | "newest">("oldest");
const target = computed(() => store.target),
  users = computed(() => {
    const rows = messages.value.filter((m) => m.role === "user");
    return messageOrder.value === "newest" ? rows.reverse() : rows;
  });
const sessionId = computed(() =>
  target.value ? session.panes.get(target.value.paneId)?.agentSession?.sessionId : null,
);
const windowRoot = ref<HTMLElement | null>(null);
let generation = 0;
async function load() {
  const t = target.value,
    offset = next.value,
    g = generation;
  if (!t || offset === null || !conn || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const r = await conn.request("agent.conversation", { paneId: t.paneId, offset });
    if (g !== generation) return;
    messages.value.push(...r.messages);
    next.value = r.nextOffset;
    partial.value ||= r.partial;
  } catch {
    if (g === generation)
      error.value = "会話記録を取得できません。対応エージェント・会話IDを確認してください。";
  } finally {
    if (g === generation) busy.value = false;
  }
}
watch(
  [target, sessionId],
  () => {
    generation++;
    messages.value = [];
    next.value = 0;
    summary.value = null;
    partial.value = false;
    error.value = "";
    busy.value = false;
    note.value = "";
    selected.value = null;
    if (target.value?.mode === "messages") void load();
    else if (target.value?.mode === "summary") void cached();
  },
  { immediate: true },
);
async function show(m: ConversationMessage) {
  selected.value = m.id;
  await nextTick();
  body.value
    ?.querySelector<HTMLElement>(`[data-message="${CSS.escape(m.id)}"]`)
    ?.scrollIntoView({ block: "start" });
  const term = target.value ? registry?.get(target.value.paneId)?.term : undefined;
  const buffer = term?.buffer.active;
  const line = buffer ? findMessageLine(buffer, m.text) : null;
  if (line !== null && term) {
    term.scrollToLine(line);
    note.value = "端末も該当箇所に移動しました。";
  } else
    note.value =
      "会話記録の該当箇所を表示しました。端末履歴にない、または位置を一意に特定できないため、端末の位置は変えていません。";
}
watch(
  target,
  async (t) => {
    if (t) {
      await nextTick();
      windowRoot.value?.focus();
    }
  },
  { immediate: true },
);
async function cached() {
  const t = target.value,
    g = generation;
  if (!t || t.mode !== "summary" || !conn || busy.value) return;
  try {
    const r = await conn.request("agent.summary_cached", { paneId: t.paneId, offset: 0 });
    if (g === generation && !busy.value) summary.value = r.summary;
  } catch {
    /* A missing cache does not block manual generation. */
  }
}
const refresh = setInterval(() => {
  if (settings.summarySettings.autoUpdate) void cached();
}, 5000);
onUnmounted(() => clearInterval(refresh));
async function generate(mode: "update" | "rebuild" = "update") {
  const t = target.value,
    g = generation;
  if (!t || !conn || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const r = await conn.request("agent.summary", {
      paneId: t.paneId,
      settings: { ...settings.summarySettings, sessionId: "" },
      mode,
    });
    if (g === generation) summary.value = r;
  } catch (e) {
    if (g === generation)
      error.value =
        errorCodeOf(e) === "summary_model_unavailable"
          ? clientErrorMessage("summary_model_unavailable")
          : "要約できません。要約用エージェントのログイン、モデル、専用セッションの設定を確認してください。";
  } finally {
    if (g === generation) busy.value = false;
  }
}
const position = ref({ x: 0, y: 0 });
let grip: { x: number; y: number; ox: number; oy: number } | null = null;
function drag(e: PointerEvent) {
  if ((e.target as HTMLElement).closest("button")) return;
  grip = { x: e.clientX, y: e.clientY, ox: position.value.x, oy: position.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (grip)
    position.value = {
      x: Math.max(
        -window.innerWidth * 0.4,
        Math.min(window.innerWidth * 0.4, grip.ox + e.clientX - grip.x),
      ),
      y: Math.max(
        -window.innerHeight * 0.1,
        Math.min(window.innerHeight * 0.6, grip.oy + e.clientY - grip.y),
      ),
    };
}
function close() {
  const id = target.value?.paneId;
  store.target = null;
  if (id) registry?.focus(id);
}
</script>
<template>
  <section
    v-if="target"
    ref="windowRoot"
    tabindex="-1"
    class="conversation-window"
    role="dialog"
    :aria-label="target.mode === 'messages' ? '送信メッセージ' : '会話の要約'"
    :style="{ transform: `translate(${position.x}px,${position.y}px)` }"
    @keydown.stop="$event.key === 'Escape' && close()"
  >
    <header
      @pointerdown="drag"
      @pointermove="move"
      @pointerup="grip = null"
      @pointercancel="grip = null"
    >
      <strong>{{ target.mode === "messages" ? "送信メッセージ" : "会話の要約" }}</strong
      ><button type="button" aria-label="閉じる" @click="close">×</button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="target.mode === 'messages'">
      <p v-if="partial">記録の一部、または長いメッセージの先頭のみ表示しています。</p>
      <div class="conversation-columns">
        <nav aria-label="送信メッセージ一覧">
          <label
            >表示順
            <select v-model="messageOrder" aria-label="送信メッセージの表示順">
              <option value="oldest">古い順</option>
              <option value="newest">新しい順</option>
            </select>
          </label>
          <button
            v-for="m in users"
            :key="m.id"
            type="button"
            :aria-current="selected === m.id"
            @click="show(m)"
          >
            <time v-if="m.at">{{ new Date(m.at).toLocaleString() }}</time
            >{{ m.text.slice(0, 100) }}</button
          ><button v-if="next !== null" :disabled="busy" @click="load">
            {{ busy ? "読み込み中…" : "続きを読む" }}
          </button>
          <p v-if="!busy && !users.length">送信メッセージはありません。</p>
        </nav>
        <div ref="body" class="conversation-record">
          <article
            v-for="m in messages"
            :key="m.id"
            :data-message="m.id"
            :class="{ 'message-selected': selected === m.id }"
          >
            <strong>{{ m.role === "user" ? "あなた" : "エージェント" }}</strong>
            <pre>{{ m.text }}</pre>
          </article>
        </div>
      </div>
      <p v-if="note" class="conversation-footer" role="status" :title="note">{{ note }}</p>
    </template>
    <template v-else
      ><p>
        {{ settings.summarySettings.kind }} · {{ settings.summarySettings.model || "既定モデル" }} ·
        要約セッションは自動管理
      </p>
      <div class="summary-actions">
        <button :disabled="busy" @click="generate()">
          {{ busy ? "要約中…" : summary ? "要約を更新" : "要約を生成" }}
        </button>
        <button v-if="summary" :disabled="busy" @click="generate('rebuild')">
          履歴から作り直す
        </button>
      </div>
      <p v-if="summary?.updatedAt">
        更新: {{ new Date(summary.updatedAt).toLocaleString()
        }}{{ summary.stale ? " · 新しい会話があります" : "" }}
      </p>
      <pre class="summary-result">{{ summary?.text }}</pre>
      <p v-if="summary?.partial">記録の一部を省略して要約しています。</p>
      <details v-if="summary?.sessionId" class="conversation-footer">
        <summary>要約の詳細</summary>
        <p>
          要約セッションID: <code>{{ summary.sessionId }}</code>
        </p>
      </details></template
    >
  </section>
</template>
<style scoped>
.conversation-window {
  position: fixed;
  top: 10vh;
  left: 10vw;
  width: 80vw;

  height: 72vh;
  resize: both;
  overflow: hidden;
  min-width: min(320px, 90vw);
  min-height: 240px;
  max-width: 90vw;
  max-height: 85vh;
  z-index: 130;
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  box-sizing: border-box;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 8px;
  box-shadow: 0 8px 32px #0006;
}
header {
  flex: none;
  min-height: 24px;
  align-items: center;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  cursor: move;
  touch-action: none;
}
header button {
  min-height: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  line-height: 1;
}
.conversation-window > p,
.conversation-footer {
  flex: none;
  margin: 3px 0;
  font-size: 12px;
  line-height: 1.3;
}
p.conversation-footer {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.conversation-footer p {
  margin: 2px 0;
}
button {
  background: var(--soda-input-bg, #343746);
  color: inherit;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 5px;
  cursor: pointer;
}
.conversation-columns {
  display: grid;
  grid-template-columns: minmax(130px, 30%) 1fr;
  flex: 1;
  min-height: 0;
  gap: 10px;
}
nav,
.conversation-record,
.summary-result {
  overflow: auto;
}
nav button {
  display: block;
  width: 100%;
  text-align: left;
  margin: 4px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
time {
  display: block;
  font-size: 0.8em;
  opacity: 0.7;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 8px 0;
}
.message-selected {
  background: var(--soda-menu-active-bg, #44475a);
  outline: 2px solid var(--soda-accent, #8be9fd);
}
article {
  padding: 8px;
}
.summary-result {
  flex: 1;
  min-height: 0;
}
</style>

<style scoped>
.summary-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
