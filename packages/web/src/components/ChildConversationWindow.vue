<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  SubagentConversationControl,
  subagentControlMessage,
  type SubagentControlSnapshot,
  subagentModelLabel,
  subagentTerminalLabel,
  paneNameOf,
} from "@sodashitsu/client-core";
import type { SubagentHistoryItem } from "@sodashitsu/protocol";
import SubagentList from "./SubagentList.vue";
import SubagentHistoryList from "./SubagentHistoryList.vue";
import { childRequestId } from "../conversation/childRequestId.js";
import { ConnectionKey } from "../injection.js";
import { useChildConversationStore } from "../store/childConversation.js";
import { useSessionStore } from "../store/session.js";
import SubagentUsagePanel from "./SubagentUsagePanel.vue";
import SubagentTranscriptWindow from "./graph/SubagentTranscriptWindow.vue";
const store = useChildConversationStore(),
  session = useSessionStore(),
  conn = inject(ConnectionKey, null);
const target = computed(() => store.target),
  root = ref<HTMLElement | null>(null);
const pane = computed(() => (target.value ? session.panes.get(target.value.paneId) : undefined));
const child = computed(() =>
  pane.value?.agent?.subagents?.items.find((c) => c.id === target.value?.agentId),
);
const selectedChild = computed(() => target.value?.historical ?? child.value);
const model = computed(() =>
  selectedChild.value ? subagentModelLabel(selectedChild.value) : undefined,
);
const showChildren = ref(false),
  historyOpen = ref(false);
const parentName = computed(() =>
  pane.value ? paneNameOf(pane.value) : (target.value?.parentName ?? ""),
);
const position = ref({ x: 0, y: 0 });
let grip: { x: number; y: number; ox: number; oy: number } | null = null;
function drag(e: PointerEvent): void {
  if ((e.target as HTMLElement).closest("button")) return;
  grip = { x: e.clientX, y: e.clientY, ox: position.value.x, oy: position.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent): void {
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
const draft = ref(""),
  compose = ref(false),
  busy = ref(false),
  note = ref("");
const childDraft = ref("");
const controlState = ref<SubagentControlSnapshot | null>(null);
let control: SubagentConversationControl | null = null;
const pending = computed(() => busy.value || controlState.value?.sending === true);
const direct = computed(
  () => !target.value?.historical && controlState.value?.capability?.mode === "direct" && !controlState.value.deliveryUnknown,
);
const controlNote = computed(() =>
  target.value?.historical
    ? "終了した子の記録を表示しています。子へ直接送信せず、親へ依頼できます。"
    : controlState.value
      ? subagentControlMessage(controlState.value)
      : "子の接続情報を確認しています…",
);
let generation = 0;
const currentScope = computed(() => (target.value ? store.scope(target.value.paneId) : null));
watch(
  [target, currentScope],
  () => {
    if (target.value && currentScope.value !== target.value.scope) {
      store.close();
      return;
    }
    const g = ++generation;
    control?.dispose();
    control = null;
    controlState.value = null;
    childDraft.value = "";
    showChildren.value = false;
    position.value = { x: 0, y: 0 };
    grip = null;
    draft.value = "";
    compose.value = false;
    busy.value = false;
    note.value = "";
    const t = target.value;
    if (t && conn && !t.historical) {
      control = new SubagentConversationControl(
        conn,
        { paneId: t.paneId, agentId: t.agentId },
        () => (generation === g && target.value === t ? store.scope(t.paneId) : null),
        (state) => {
          if (generation === g) controlState.value = state;
        },
        childRequestId,
        () => document.visibilityState !== "hidden" && !showChildren.value,
      );
      control.start();
    }
    if (t) void nextTick(() => root.value?.focus());
  },
  { flush: "sync", immediate: true },
);
function onEscape(): void {
  if (showChildren.value) showChildren.value = false;
  else store.close();
}
function openHistoryChild(item: SubagentHistoryItem): void {
  if (target.value) store.openHistorical(target.value.paneId, item);
}
function visible(): void {
  if (document.visibilityState !== "hidden") void control?.refresh();
}
onMounted(() => document.addEventListener("visibilitychange", visible));
onBeforeUnmount(() => {
  generation++;
  control?.dispose();
  document.removeEventListener("visibilitychange", visible);
});
async function sendChild(): Promise<void> {
  const t = target.value,
    c = control,
    g = generation,
    text = childDraft.value;
  if (!t || !c || pending.value || !direct.value) return;
  const result = await c.send(
    text,
    () =>
      generation === g &&
      control === c &&
      target.value === t &&
      childDraft.value === text &&
      !busy.value,
  );
  if (result?.status === "accepted" && generation === g && childDraft.value === text)
    childDraft.value = "";
}
const parentExpectation = computed(() => {
  const p = pane.value,
    a = p?.agent,
    t = p ? session.tabs.get(p.tabId) : undefined,
    w = t ? session.workspaces.get(t.workspaceId) : undefined;
  return p && a && a.name && w?.projectDir
    ? {
        paneId: p.id,
        instanceId: a.instanceId,
        tabId: p.tabId,
        projectDir: w.projectDir,
        name: a.name,
      }
    : null;
});
function prepareParent(): void {
  if (!target.value || pending.value || currentScope.value !== target.value.scope) return;
  compose.value = true;
  note.value = "";
  if (!draft.value)
    draft.value = `サブエージェント「${target.value.childName.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "")}」への依頼:\n${childDraft.value}`;
}
async function sendParent(): Promise<void> {
  const t = target.value,
    expect = parentExpectation.value,
    g = generation,
    text = draft.value;
  if (
    !t ||
    !expect ||
    !conn ||
    pending.value ||
    !text.trim() ||
    currentScope.value !== t.scope ||
    pane.value?.agent?.state === "blocked"
  )
    return;
  busy.value = true;
  note.value = "";
  try {
    await conn.request("agent.prompt_checked", {
      paneId: t.paneId,
      instanceId: expect.instanceId,
      expect,
      text,
    });
    if (g === generation) {
      draft.value = "";
      note.value = "親への送信を受け付けました。子への直接送信ではありません。";
    }
  } catch {
    if (g === generation) note.value = "親へ送信できませんでした。宛先・状態を確認してください。";
  } finally {
    if (g === generation) busy.value = false;
  }
}
</script>
<template>
  <section
    v-if="target"
    ref="root"
    class="child-conversation"
    role="dialog"
    aria-label="サブエージェントの会話"
    tabindex="-1"
    :style="{ transform: `translate(${position.x}px,${position.y}px)` }"
    @keydown.esc.stop.prevent="onEscape"
  >
    <header
      @pointerdown="drag"
      @pointermove="move"
      @pointerup="grip = null"
      @pointercancel="grip = null"
    >
      <strong :title="target.childName">{{ target.childName }}</strong
      ><button data-assistant-feature :disabled="pending" @click="showChildren = !showChildren">
        子の一覧・終了履歴</button
      ><button data-assistant-feature aria-label="子の会話を閉じる" @click="store.close()">
        ×
      </button>
    </header>
    <p v-if="target.historical" class="child-meta">
      終了履歴 · {{ subagentTerminalLabel(target.historical.terminalStatus) }}
    </p>
    <p class="child-meta">
      親: {{ parentName }} · 子: {{ target.childName }}<span v-if="model"> · {{ model }}</span>
    </p>
    <div v-if="showChildren" class="child-history" aria-label="親の子一覧">
      <SubagentList :subagents="pane?.agent?.subagents"
        ><template #selection="{ item }"
          ><button data-assistant-feature @click="store.open(target.paneId, item.id)">
            {{ item.description || item.type || "子" }}の会話を開く
          </button></template
        ></SubagentList
      >
      <button
        data-assistant-feature
        :aria-expanded="historyOpen"
        @click="historyOpen = !historyOpen"
      >
        終了した子
      </button>
      <SubagentHistoryList v-if="historyOpen" :pane-id="target.paneId" @select="openHistoryChild" />
    </div>
    <div v-else class="child-history">
      <SubagentTranscriptWindow
        v-if="
          target.historical
            ? target.historical.hasTranscript
            : child
              ? child.hasTranscript
              : target.readable
        "
        :key="`${target.scope}:${target.agentId}:${target.historical?.entryId ?? 'current'}`"
        inline
        bare
        :pane-id="target.paneId"
        :agent-id="target.agentId"
        v-bind="target.historical ? { historyEntryId: target.historical.entryId } : {}"
        :parent-name="parentName"
        :title="target.childName"
        @close="store.close()"
      />
      <p v-else role="status">この子の会話記録は未取得です。</p>
    </div>
    <footer v-if="!showChildren">
      <SubagentUsagePanel
        :key="`${target.scope}:${target.agentId}:${target.historical?.entryId ?? 'current'}:usage`"
        :pane-id="target.paneId"
        :agent-id="target.agentId"
        v-bind="target.historical ? { historyEntryId: target.historical.entryId } : {}"
      />
      <p role="status">{{ controlNote }}</p>
      <form v-if="direct || childDraft" data-child-compose @submit.prevent="sendChild">
        <label
          >送信先: 子「{{ target.childName }}」<textarea
            v-model="childDraft"
            aria-label="子へのメッセージ"
            maxlength="16384"
            :readonly="!direct"
            :disabled="pending"
          />
        </label>
        <button data-assistant-action :disabled="pending || !direct || !childDraft.trim()">
          子へ送信
        </button>
      </form>
      <button data-assistant-feature :disabled="pending" @click="prepareParent">
        親へ依頼する下書き
      </button>
      <form v-if="compose" @submit.prevent="sendParent">
        <label
          >送信先: 親「{{ parentName }}」<textarea
            v-model="draft"
            aria-label="親への依頼の下書き"
            :disabled="pending"
          />
        </label>
        <button
          data-assistant-action
          :disabled="
            pending || !draft.trim() || !parentExpectation || pane?.agent?.state === 'blocked'
          "
        >
          {{ busy ? "送信中…" : "親へ送信" }}
        </button>
      </form>
      <p v-if="note" role="status">{{ note }}</p>
    </footer>
  </section>
</template>
<style scoped>
.child-conversation {
  position: fixed;
  top: 8vh;
  left: 12vw;
  width: 76vw;
  height: 78vh;
  min-width: min(320px, 90vw);
  min-height: 260px;
  max-width: 94vw;
  max-height: 90vh;
  resize: both;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 135;
  padding: 8px;
  box-sizing: border-box;
  background: var(--soda-menu-bg);
  color: var(--soda-fg);
  border: 1px solid var(--soda-menu-border);
  border-radius: var(--soda-shape-radius-m, 8px);
  box-shadow: 0 8px 32px #0006;
  font-size: 14px;
}
header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: move;
  touch-action: none;
}
.child-meta {
  max-height: 3em;
  overflow: auto;
  flex-shrink: 0;
  margin: 6px 0;
  overflow-wrap: anywhere;
}
.child-history {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
footer {
  flex: none;
  max-height: 40%;
  overflow: auto;
}
footer p {
  margin: 5px 0;
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  background: var(--soda-bg);
  color: var(--soda-fg);
  border: 1px solid var(--soda-menu-border);
  font: inherit;
}
@media (max-width: 600px) {
  .child-conversation {
    left: 3vw;
    top: 5vh;
    width: 94vw;
    height: 90vh;
  }
}
</style>
