<script setup lang="ts">
import { inject, ref } from "vue";
import type { PastAgentSession } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
const conn = inject(ConnectionKey, null),
  session = useSessionStore(),
  view = useViewStore();
const query = ref(""),
  kind = ref(""),
  rows = ref<PastAgentSession[]>([]),
  busy = ref(false),
  partial = ref(false),
  error = ref(""),
  loaded = ref(false);
async function load() {
  if (!conn) return;
  busy.value = true;
  error.value = "";
  try {
    const r = await conn.request("agent.sessions", {
      query: query.value,
      limit: 100,
      ...(kind.value === "claude" || kind.value === "codex" ? { kind: kind.value } : {}),
    });
    rows.value = r.sessions;
    partial.value = r.partial;
    loaded.value = true;
  } catch {
    error.value = "過去のセッションを取得できません";
  } finally {
    busy.value = false;
  }
}
async function resume(row: PastAgentSession) {
  const paneId = view.focusedPaneId;
  if (!conn || !paneId || !session.panes.has(paneId)) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await conn.request("pane.split", {
      paneId,
      direction: "right",
      ...(row.cwd ? { newCwd: { policy: "path", path: row.cwd } } : {}),
    });
    const started = Date.now();
    while (true) {
      try {
        await conn.request("agent.resume", {
          paneId: result.pane.id,
          kind: row.kind,
          sessionId: row.sessionId,
        });
        break;
      } catch (e) {
        if ((e as { code?: string }).code !== "agent_pane_busy" || Date.now() - started > 10000)
          throw e;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    view.focusPane(result.pane.id);
    view.closeDashboard();
  } catch {
    error.value = "再開できません。作業フォルダとエージェントの起動条件を確認してください。";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="past-sessions">
    <h3>過去のセッション</h3>
    <p>
      ローカルに保存されたClaude
      Code・Codexの会話です。各CLIの再開一覧とは索引や絞り込みが異なる場合があります。
    </p>
    <form @submit.prevent="load">
      <input
        v-model="query"
        aria-label="過去セッションを検索"
        placeholder="メッセージ・フォルダ・IDで検索"
      /><select v-model="kind" aria-label="エージェント">
        <option value="">すべて</option>
        <option value="claude">Claude Code</option>
        <option value="codex">Codex</option></select
      ><button :disabled="busy">{{ busy ? "処理中…" : "検索・更新" }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="partial">探索上限内のセッションを表示しています。</p>
    <p v-if="loaded && !rows.length">セッションはありません。</p>
    <ul>
      <li v-for="row in rows" :key="row.kind + row.sessionId">
        <strong>{{ row.title }}</strong
        ><span
          >{{ row.kind }} · {{ row.cwd ?? "フォルダ不明" }} ·
          {{ new Date(row.updatedAt).toLocaleString() }}</span
        ><button :disabled="busy || !view.focusedPaneId" @click="resume(row)">
          別ペインで再開
        </button>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.past-sessions {
  margin-top: 20px;
  padding: 12px;
  border-top: 1px solid var(--soda-menu-border, #44475a);
}
form {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
input,
select,
button {
  background: var(--soda-input-bg, #343746);
  color: var(--soda-fg, #f8f8f2);
}
option {
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
}
ul {
  padding: 0;
  list-style: none;
  max-height: 40vh;
  overflow: auto;
}
li {
  padding: 8px;
  display: grid;
  gap: 4px;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
li span {
  font-size: 0.85em;
  overflow-wrap: anywhere;
}
</style>
