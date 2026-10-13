<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch } from "vue";
import type { AgentTodos, SessionNote, SessionNotes } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import { useSessionStore } from "../store/session.js";
const view = useViewStore(),
  session = useSessionStore(),
  conn = inject(ConnectionKey);
const target = computed(() =>
  view.dialogContext?.kind === "sessionTools" ? view.dialogContext : null,
);
const identity = computed(() =>
  target.value ? session.panes.get(target.value.paneId)?.agentSession : null,
);
const root = ref<HTMLDialogElement | null>(null),
  data = ref<SessionNotes | null>(null),
  todos = ref<AgentTodos | null>(null);
const selected = ref<string | null>(null),
  title = ref(""),
  body = ref(""),
  tags = ref(""),
  group = ref("");
const search = ref(""),
  groupFilter = ref(""),
  tagFilter = ref(""),
  error = ref(""),
  busy = ref(false),
  baseline = ref(JSON.stringify(["", "", "", ""]));
const draft = () => JSON.stringify([title.value, body.value, tags.value, group.value]);
const dirty = computed(() => baseline.value !== draft());
const groups = computed(() =>
  [...new Set(data.value?.notes.map((n) => n.group).filter(Boolean) ?? [])].sort(),
);
const allTags = computed(() => [...new Set(data.value?.notes.flatMap((n) => n.tags) ?? [])].sort());
const filtered = computed(() =>
  (data.value?.notes ?? [])
    .filter(
      (n) =>
        (!groupFilter.value || n.group === groupFilter.value) &&
        (!tagFilter.value || n.tags.includes(tagFilter.value)) &&
        (!search.value ||
          [n.title, n.body, n.group, ...n.tags].some((v) =>
            v.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
          )),
    )
    .sort((a, b) => a.group.localeCompare(b.group) || b.updatedAt - a.updatedAt),
);
let generation = 0;
function discard() {
  return !dirty.value || window.confirm("未保存のメモを破棄しますか？");
}
function select(note: SessionNote | null, force = false) {
  if (!force && !discard()) return;
  selected.value = note?.id ?? null;
  title.value = note?.title ?? "";
  body.value = note?.body ?? "";
  tags.value = note?.tags.join(", ") ?? "";
  group.value = note?.group ?? "";
  baseline.value = draft();
  error.value = "";
}
function close() {
  if (!busy.value && discard()) {
    select(null, true);
    view.dialogContext = null;
  }
}
async function load(force = false) {
  const t = target.value,
    g = generation;
  if (!t || !conn || busy.value || (t.mode === "notes" && !force && !discard())) return;
  busy.value = true;
  error.value = "";
  try {
    if (t.mode === "notes") {
      const r = await conn.request("agent.notes", { paneId: t.paneId });
      if (g !== generation) return;
      data.value = r;
      select(r.notes.find((n) => n.id === selected.value) ?? r.notes[0] ?? null, true);
    } else {
      const r = await conn.request("agent.todos", { paneId: t.paneId });
      if (g === generation) todos.value = r;
    }
  } catch {
    if (g === generation)
      error.value = "取得できません。エージェントのセッションと記録を確認してください。";
  } finally {
    if (g === generation) busy.value = false;
  }
}
async function save(remove = false) {
  const t = target.value,
    d = data.value,
    note = d?.notes.find((n) => n.id === selected.value),
    g = generation;
  if (
    !t ||
    !d ||
    !conn ||
    busy.value ||
    (remove && (!note || !window.confirm("このメモを削除しますか？")))
  )
    return;
  busy.value = true;
  error.value = "";
  try {
    const params = { paneId: t.paneId, kind: d.kind, sessionId: d.sessionId };
    const result =
      remove && note
        ? await conn.request("agent.note_delete", {
            ...params,
            id: note.id,
            revision: note.revision,
          })
        : await conn.request("agent.note_save", {
            ...params,
            ...(note ? { id: note.id, revision: note.revision } : {}),
            title: title.value,
            body: body.value,
            group: group.value,
            tags: tags.value
              .split(/[,、]/)
              .map((s) => s.trim())
              .filter(Boolean),
          });
    if (g !== generation) return;
    data.value = result;
    select(
      remove
        ? (result.notes[0] ?? null)
        : (result.notes.find((n) => n.id === note?.id) ??
            result.notes[result.notes.length - 1] ??
            null),
      true,
    );
  } catch {
    if (g === generation)
      error.value =
        "保存できません。セッションの切り替えや別の画面での更新を確認し、入力を控えて再読込してください。";
  } finally {
    if (g === generation) busy.value = false;
  }
}
const sessionKey = computed(() =>
  JSON.stringify([
    target.value?.paneId,
    target.value?.mode,
    identity.value?.kind,
    identity.value?.sessionId,
  ]),
);
watch(
  sessionKey,
  async () => {
    generation++;
    busy.value = false;
    data.value = null;
    todos.value = null;
    search.value = groupFilter.value = tagFilter.value = "";
    // Preserve an unsaved draft on a session switch; it cannot be written to the new session without reloading.
    if (!target.value) {
      root.value?.close();
      return;
    }
    if (!dirty.value) select(null, true);
    await nextTick();
    if (!root.value?.open) root.value?.showModal();
    if (dirty.value)
      error.value = "セッションが切り替わりました。入力を控えてから再読込してください。";
    else void load(true);
  },
  { immediate: true },
);
const timer = setInterval(() => {
  if (target.value?.mode === "todos") void load(true);
}, 5000);
onUnmounted(() => clearInterval(timer));
function key(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    if (target.value?.mode === "notes") void save();
  }
}
</script>
<template>
  <dialog
    ref="root"
    class="session-tools"
    :aria-label="target?.mode === 'notes' ? 'セッションのメモ' : 'エージェントのToDo'"
    @cancel.prevent="close"
    @keydown="key"
  >
    <header>
      <strong>{{ target?.mode === "notes" ? "セッションのメモ" : "エージェントのToDo" }}</strong>
      <span>{{ identity?.sessionId.slice(0, 8) }}</span
      ><button :disabled="busy" @click="load()">再読込</button
      ><button aria-label="閉じる" @click="close">×</button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="target?.mode === 'notes'" class="notes-layout">
      <aside aria-label="メモ一覧">
        <button :disabled="busy || !data" @click="select(null)">新しいメモ</button>
        <input v-model="search" aria-label="メモを検索" placeholder="タイトル・本文・タグを検索" />
        <select v-model="groupFilter" aria-label="グループで絞り込み">
          <option value="">すべてのグループ</option>
          <option v-for="g in groups" :key="g">{{ g }}</option>
        </select>
        <select v-model="tagFilter" aria-label="タグで絞り込み">
          <option value="">すべてのタグ</option>
          <option v-for="tag in allTags" :key="tag">{{ tag }}</option>
        </select>
        <nav>
          <button
            v-for="n in filtered"
            :key="n.id"
            :aria-pressed="selected === n.id"
            :disabled="busy"
            @click="select(n)"
          >
            <small v-if="n.group">{{ n.group }}</small
            ><b>{{ n.title }}</b
            ><small>{{ n.tags.join(" · ") }}</small>
          </button>
          <p v-if="data && !filtered.length">メモはありません。</p>
        </nav>
      </aside>
      <form @submit.prevent="save()">
        <label
          >タイトル<input v-model="title" required maxlength="200" :disabled="busy || !data"
        /></label>
        <div class="metadata">
          <label
            >グループ<input
              v-model="group"
              maxlength="100"
              list="note-groups"
              :disabled="busy || !data"
          /></label>
          <label>タグ（カンマ区切り）<input v-model="tags" :disabled="busy || !data" /></label>
        </div>
        <datalist id="note-groups">
          <option v-for="g in groups" :key="g">{{ g }}</option>
        </datalist>
        <label class="body"
          >メモ<textarea v-model="body" maxlength="200000" :disabled="busy || !data" />
        </label>
        <footer>
          <span>{{ dirty ? "未保存" : "保存済み" }}</span
          ><button v-if="selected" type="button" :disabled="busy || !data" @click="save(true)">
            削除</button
          ><button :disabled="busy || !data || !title.trim()">保存</button>
        </footer>
      </form>
    </div>
    <main v-else class="todos">
      <p>参照専用 · 5秒ごとに更新</p>
      <p v-if="todos">
        完了 {{ todos.items.filter((i) => i.status === "completed").length }} /
        {{ todos.items.length }}
      </p>
      <p v-if="todos?.partial">記録の一部のみを参照しています。</p>
      <p v-if="todos && !todos.items.length">このセッションには記録されたToDoがありません。</p>
      <ul>
        <li v-for="item in todos?.items" :key="item.id" :class="item.status">
          <span>{{
            item.status === "completed"
              ? "✓ 完了"
              : item.status === "in_progress"
                ? "▶ 進行中"
                : "○ 未着手"
          }}</span>
          {{ item.text }}
          <p v-if="item.description">{{ item.description }}</p>
        </li>
      </ul>
    </main>
  </dialog>
</template>
<style scoped>
.session-tools {
  width: min(1000px, calc(100vw - 24px));
  height: min(650px, calc(100dvh - 24px));
  max-width: calc(100vw - 24px);
  max-height: calc(100dvh - 24px);
  padding: 0;
  resize: both;
  overflow: auto;
  background: var(--soda-menu-bg);
  color: var(--soda-fg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 8px;
}
.session-tools[open] {
  display: flex;
  flex-direction: column;
}
.session-tools::backdrop {
  background: #0006;
}
header,
footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--soda-menu-border);
}
header strong {
  flex: 1;
}
footer {
  border-bottom: 0;
  border-top: 1px solid var(--soda-menu-border);
}
footer span {
  flex: 1;
}
button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
  background: var(--soda-input-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 4px;
  padding: 6px;
  box-sizing: border-box;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
option {
  background: var(--soda-menu-bg);
  color: var(--soda-fg);
}
.notes-layout {
  display: grid;
  grid-template-columns: minmax(180px, 26%) 1fr;
  flex: 1;
  min-height: 0;
}
aside {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-right: 1px solid var(--soda-menu-border);
  min-height: 0;
}
aside input,
aside select {
  width: 100%;
}
nav {
  overflow: auto;
  flex: 1;
}
nav button {
  display: block;
  text-align: left;
  width: 100%;
  margin-bottom: 6px;
}
nav small,
nav b {
  display: block;
  overflow-wrap: anywhere;
}
nav button[aria-pressed="true"] {
  border-color: var(--soda-accent);
}
form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  min-height: 0;
  min-width: 0;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metadata {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.body {
  flex: 1;
  min-height: 90px;
}
textarea {
  resize: none;
  flex: 1;
  min-height: 0;
  white-space: pre-wrap;
}
.todos {
  overflow: auto;
  padding: 12px;
}
.todos li {
  padding: 10px;
  border-bottom: 1px solid var(--soda-menu-border);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.todos .completed {
  color: var(--soda-state-done);
}
.todos .in_progress {
  color: var(--soda-state-working);
}
[role="alert"] {
  padding: 8px;
  margin: 0;
  color: var(--soda-warn-fg);
}
@media (max-width: 600px) {
  .notes-layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  aside {
    max-height: 200px;
    border-right: 0;
    border-bottom: 1px solid var(--soda-menu-border);
  }
  form {
    min-height: 350px;
  }
  .metadata {
    grid-template-columns: 1fr;
  }
  header span {
    display: none;
  }
}
</style>
