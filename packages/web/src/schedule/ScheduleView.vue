<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref } from "vue";
import type { ScheduledJob, ScheduleListResult, ScheduleDraft } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
const conn = inject(ConnectionKey),
  session = useSessionStore();
const data = ref<ScheduleListResult>({ jobs: [], runs: [] }),
  error = ref(""),
  busy = ref(false),
  editing = ref(false),
  selected = ref<string | null>(null);
const id = ref<string | undefined>(),
  label = ref(""),
  enabled = ref(true),
  actionType = ref<"agent" | "command">("agent"),
  target = ref(""),
  body = ref(""),
  trigger = ref<"once" | "interval">("once"),
  date = ref(""),
  every = ref(60),
  timeout = ref(600);
const workspaces = computed(() => [...session.workspaces.values()]),
  panes = computed(() => [...session.panes.values()].filter((p) => p.agent && !p.virtual));
const targets = computed(() =>
  actionType.value === "agent"
    ? panes.value.map((p) => ({ id: p.id, name: p.label || p.agent?.label || p.id.slice(0, 8) }))
    : workspaces.value.map((w) => ({ id: w.id, name: w.label })),
);
const runs = computed(() =>
  data.value.runs.filter((r) => !selected.value || r.jobId === selected.value),
);
const statuses = {
  running: "実行中",
  sent: "指示送信済み",
  succeeded: "成功",
  failed: "失敗",
  interrupted: "中断",
};
let timer: ReturnType<typeof setInterval> | undefined,
  dead = false;
async function refresh() {
  try {
    const result = await conn?.request("schedule.list", {});
    if (!dead && result) {
      data.value = result;
      error.value = "";
    }
  } catch {
    if (!dead) error.value = "予約を取得できません";
  }
}
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function edit(job?: ScheduledJob) {
  if (busy.value) return;
  if(job?.action.type==="reminder"){error.value="リマインダーはデスクトップアシスタントで削除・再登録してください。";return;}
  id.value = job?.id;
  label.value = job?.label ?? "";
  enabled.value = job?.enabled ?? true;
  actionType.value = job?.action.type ?? (panes.value.length ? "agent" : "command");
  target.value = job
    ? job.action.type === "agent"
      ? job.action.paneId
      : job.action.workspaceId
    : (targets.value[0]?.id ?? "");
  body.value = job ? (job.action.type === "agent" ? job.action.text : job.action.command) : "";
  trigger.value = job?.trigger.type ?? "once";
  date.value = localDate(
    job
      ? job.trigger.type === "once"
        ? job.trigger.at
        : job.trigger.startAt
      : new Date(Date.now() + 300000).toISOString(),
  );
  every.value = job?.trigger.type === "interval" ? job.trigger.everyMinutes : 60;
  timeout.value = job?.timeoutSeconds ?? 600;
  editing.value = true;
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    const at = new Date(date.value).toISOString();
    const job: ScheduleDraft = {
      label: label.value,
      enabled: enabled.value,
      timeoutSeconds: timeout.value,
      trigger:
        trigger.value === "once"
          ? { type: "once", at }
          : { type: "interval", startAt: at, everyMinutes: every.value },
      action:
        actionType.value === "agent"
          ? { type: "agent", paneId: target.value, text: body.value }
          : { type: "command", workspaceId: target.value, command: body.value },
    };
    await conn?.request("schedule.save", { ...(id.value ? { id: id.value } : {}), job });
    editing.value = false;
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "予約を保存できません";
  } finally {
    busy.value = false;
  }
}
async function toggle(job: ScheduledJob) {
  try {
    await conn?.request("schedule.save", { id: job.id, job: { ...job, enabled: !job.enabled } });
    await refresh();
  } catch (e) {
    error.value = String(e);
  }
}
async function run(job: ScheduledJob) {
  try {
    await conn?.request("schedule.run", { id: job.id });
    selected.value = job.id;
    await refresh();
  } catch (e) {
    error.value = String(e);
  }
}
async function remove(job: ScheduledJob) {
  if (!window.confirm(`予約「${job.label}」を削除しますか？ 実行履歴は残ります。`)) return;
  try {
    await conn?.request("schedule.remove", { id: job.id });
    if (selected.value === job.id) selected.value = null;
    await refresh();
  } catch (e) {
    error.value = String(e);
  }
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 5000);
});
onBeforeUnmount(() => {
  dead = true;
  if (timer) clearInterval(timer);
});
</script>
<template>
  <section class="schedule-view" aria-label="処理の予約">
    <header>
      <h1>予約</h1>
      <button @click="edit()">予約を登録</button><button @click="refresh">更新</button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <form v-if="editing" @submit.prevent="save" class="schedule-editor">
      <label>名前<input v-model="label" required maxlength="100" /></label>
      <label
        >実行内容<select v-model="actionType" @change="target = targets[0]?.id ?? ''">
          <option value="agent">エージェントへの指示</option>
          <option value="command">コマンド実行</option>
        </select></label
      >
      <label
        >{{ actionType === "agent" ? "対象ペイン" : "実行先ワークスペース"
        }}<select v-model="target" required>
          <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select></label
      >
      <label
        >実行方式<select v-model="trigger">
          <option value="once">日時を指定して一回</option>
          <option value="interval">間隔を指定して繰り返し</option>
        </select></label
      >
      <label
        >{{ trigger === "once" ? "実行日時" : "最初の実行日時"
        }}<input type="datetime-local" v-model="date" required
      /></label>
      <label v-if="trigger === 'interval'"
        >間隔（分）<input type="number" min="1" max="525600" v-model.number="every" required
      /></label>
      <label
        >実行の上限（秒）<input type="number" min="1" max="86400" v-model.number="timeout" required
      /></label>
      <label class="schedule-body"
        >{{ actionType === "agent" ? "指示" : "コマンド"
        }}<textarea v-model="body" required maxlength="16384" rows="5" />
      </label>
      <label><input type="checkbox" v-model="enabled" />有効</label>
      <div>
        <button :disabled="busy" type="submit">予約を保存</button
        ><button type="button" :disabled="busy" @click="editing = false">キャンセル</button>
      </div>
    </form>
    <p v-if="!data.jobs.length">予約はありません。</p>
    <div class="schedule-jobs">
      <article
        v-for="job in data.jobs"
        :key="job.id"
        class="schedule-job"
        :data-schedule-id="job.id"
      >
        <h2>{{ job.label }}</h2>
        <p>
          {{ job.action.type === "agent" ? "エージェントへの指示" : job.action.type === "reminder" ? "リマインダー" : "コマンド実行" }} ·
          {{ job.trigger.type === "once" ? "一回" : `${job.trigger.everyMinutes}分ごと` }} · 次回
          {{ when(job.nextRunAt) }}
        </p>
        <div>
          <button @click="edit(job)">編集</button
          ><button @click="toggle(job)">{{ job.enabled ? "無効にする" : "有効にする" }}</button
          ><button @click="run(job)">今すぐ実行</button
          ><button @click="selected = job.id">実行結果</button
          ><button @click="remove(job)">削除</button>
        </div>
      </article>
    </div>
    <header>
      <h2>実行履歴</h2>
      <button v-if="selected" @click="selected = null">すべて表示</button>
    </header>
    <p v-if="!runs.length">実行履歴はありません。</p>
    <details v-for="run in runs" :key="run.id" :data-run-id="run.id">
      <summary>{{ run.label }} · {{ statuses[run.status] }} · {{ when(run.startedAt) }}</summary>
      <p>終了 {{ when(run.finishedAt) }} · 終了コード {{ run.exitCode ?? "—" }}</p>
      <pre>{{ run.input }}</pre>
      <pre>{{ run.output || "出力なし" }}</pre>
    </details>
  </section>
</template>
<style scoped>
.schedule-view {
  height: 100%;
  overflow: auto;
  padding: 12px;
  box-sizing: border-box;
  color: var(--soda-fg);
  background: var(--soda-bg);
}
header,
.schedule-job > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
h1,
h2 {
  margin: 8px 0;
  font-size: 1.1em;
}
button,
input,
select,
textarea {
  font: inherit;
  color: var(--soda-fg);
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 4px;
  box-sizing: border-box;
}
button {
  padding: 5px 9px;
  cursor: pointer;
}
button:hover {
  background: var(--soda-menu-hover-bg);
}
.schedule-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  border: 1px solid var(--soda-menu-border);
  padding: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
input,
select,
textarea {
  padding: 6px;
  min-width: 0;
  width: 100%;
}
input[type="checkbox"] {
  width: auto;
  align-self: flex-start;
}
.schedule-body {
  grid-column: 1/-1;
}
.schedule-job,
details {
  border: 1px solid var(--soda-menu-border);
  padding: 10px;
  margin-top: 8px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
summary {
  cursor: pointer;
}
@media (max-width: 600px) {
  .schedule-editor {
    grid-template-columns: 1fr;
  }
  .schedule-view {
    padding: 8px;
  }
}
</style>
