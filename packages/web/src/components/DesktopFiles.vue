<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  WORK_FILE_MAX_BYTES,
  WORK_FILE_CHUNK_BYTES,
  type DesktopFileResult,
} from "@sodashitsu/protocol";
import type { DesktopFileClient } from "../desktop/fileClient.js";
const props = defineProps<{ client: DesktopFileClient }>();
const enabled = ref(false),
  busy = ref(false),
  message = ref(""),
  root = ref(""),
  folder = ref(""),
  opened = ref(false),
  input = ref<HTMLInputElement>();
const entries = ref<NonNullable<NonNullable<DesktopFileResult["result"]>["entries"]>>([]);
type Job = {
  key: string;
  direction: "upload" | "download";
  name: string;
  path: string;
  size: number;
  offset: number;
  state: "queued" | "running" | "paused" | "completed" | "cancelled" | "failed";
  file?: File;
  id?: string | undefined;
  pause: boolean;
  cancel: boolean;
  committing?: boolean;
  chunks: Uint8Array[];
  hash?: string;
  message?: string | undefined;
};
const jobs = ref<Job[]>([]);
let dead = false,
  running = false,
  listSeq = 0,
  keepingAlive = false;
const listedFolder = ref("");
const owner = props.client;
const hex = (v: ArrayBuffer) =>
  Array.from(new Uint8Array(v), (b) => b.toString(16).padStart(2, "0")).join("");
const base64 = (v: Uint8Array) => {
  let s = "";
  for (let i = 0; i < v.length; i += 8192) s += String.fromCharCode(...v.subarray(i, i + 8192));
  return btoa(s);
};
const path = (name: string) =>
  folder.value ? folder.value.replace(/[\\/]+$/u, "") + "/" + name : name;
async function list() {
  const request = ++listSeq,
    location = folder.value;
  try {
    const result = await owner.request({ action: "list", path: location });
    if (dead || request !== listSeq || !enabled.value) return;
    listedFolder.value = location;
    entries.value = result.entries ?? [];
    message.value = result.truncated ? "500件まで表示しています" : "";
  } catch (e) {
    if (!dead && request === listSeq) message.value = String(e);
  }
}
async function grant() {
  if (busy.value) return;
  busy.value = true;
  try {
    const next = !enabled.value;
    const response = owner.request({ action: "grant", enabled: next });
    if (!next) {
      enabled.value = false;
      listSeq++;
      entries.value = [];
      for (const job of jobs.value) cancel(job);
    }
    const result = await response;
    if (dead) return;
    enabled.value = result.enabled === true;
    root.value = result.root ?? "";
    if (enabled.value) await list();
    else entries.value = [];
  } catch (e) {
    message.value = String(e);
  } finally {
    busy.value = false;
  }
}
function trimHistory() {
  while (jobs.value.length >= 100) {
    const i = jobs.value.findIndex((j) => ["completed", "cancelled", "failed"].includes(j.state));
    if (i < 0) break;
    jobs.value.splice(i, 1);
  }
}
function addFiles(files: FileList | File[]) {
  if (!enabled.value) {
    message.value = "先にファイル転送を許可してください";
    return;
  }
  opened.value = true;
  trimHistory();
  for (const file of Array.from(files)) {
    if (
      jobs.value.filter((j) => !["completed", "cancelled", "failed"].includes(j.state)).length >= 8
    ) {
      message.value = "同時に登録できるのは8件です";
      break;
    }
    if (file.size > WORK_FILE_MAX_BYTES) {
      message.value = "1ファイル100MiBまでです";
      continue;
    }
    jobs.value.push({
      key: crypto.randomUUID(),
      direction: "upload",
      name: file.name,
      path: path(file.name),
      size: file.size,
      offset: 0,
      state: "queued",
      file,
      pause: false,
      cancel: false,
      chunks: [],
    });
  }
  void pump();
}
function selected(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files) addFiles(target.files);
  target.value = "";
}
const listedPath = (name: string) =>
  listedFolder.value ? listedFolder.value.replace(/[\\/]+$/u, "") + "/" + name : name;
function download(name: string, size: number) {
  trimHistory();
  if (size > WORK_FILE_MAX_BYTES) {
    message.value = "1ファイル100MiBまでです";
    return;
  }
  if (jobs.value.filter((j) => !["completed", "cancelled", "failed"].includes(j.state)).length >= 8)
    return;
  jobs.value.push({
    key: crypto.randomUUID(),
    direction: "download",
    name,
    path: listedPath(name),
    size,
    offset: 0,
    state: "queued",
    pause: false,
    cancel: false,
    chunks: [],
  });
  void pump();
}
async function discard(job: Job) {
  const id = job.id;
  job.id = undefined;
  job.chunks = [];
  if (id) await owner.request({ action: "abort", id }).catch(() => {});
}
function cancel(job: Job) {
  if (job.committing) return;
  if (["completed", "cancelled", "failed"].includes(job.state)) return;
  job.cancel = true;
  if (job.state !== "running") {
    job.state = "cancelled";
    void discard(job);
  }
}
function pause(job: Job) {
  job.pause = true;
}
function resume(job: Job) {
  job.pause = false;
  job.state = "queued";
  void pump();
}
async function run(job: Job) {
  job.state = "running";
  try {
    if (job.id) {
      const state = await owner.request({ action: "status", id: job.id });
      if (state.offset !== job.offset || state.bytes !== job.size)
        throw Error("再開位置が変わりました。もう一度転送してください");
    }
    if (job.direction === "upload" && !job.hash)
      job.hash = hex(await crypto.subtle.digest("SHA-256", await job.file!.arrayBuffer()));
    if (dead || job.cancel) return;
    if (job.pause) {
      job.state = "paused";
      return;
    }
    if (!job.id) {
      const start = await owner.request(
        job.direction === "upload"
          ? { action: "write_start", path: job.path, bytes: job.size }
          : { action: "read_start", path: job.path },
      );
      if (!start.id || start.bytes !== job.size) throw Error("ファイルの大きさが変わりました");
      job.id = start.id;
    }
    while (!dead && !job.cancel) {
      if (job.pause) {
        job.state = "paused";
        return;
      }
      if (job.direction === "upload") {
        if (job.offset === job.size) {
          job.committing = true;
          const result = await owner.request({ action: "finish", id: job.id, sha256: job.hash! });
          job.id = undefined;
          if (dead || job.cancel) return;
          if (result.bytes !== job.size || result.sha256 !== job.hash)
            throw Error("保存結果を確認できません");
          job.state = "completed";
          job.message = result.destination;
          await list();
          return;
        }
        const data = new Uint8Array(
          await job
            .file!.slice(job.offset, Math.min(job.offset + WORK_FILE_CHUNK_BYTES, job.size))
            .arrayBuffer(),
        );
        if (dead || job.cancel) return;
        const result = await owner.request({
          action: "write",
          id: job.id,
          offset: job.offset,
          data: base64(data),
        });
        if (result.offset !== job.offset + data.length) throw Error("転送位置が一致しません");
        job.offset = result.offset;
        data.fill(0);
      } else {
        const result = await owner.request({ action: "read", id: job.id, offset: job.offset });
        const chunk = Uint8Array.from(atob(result.data ?? ""), (v) => v.charCodeAt(0));
        if (
          result.offset !== job.offset + chunk.length ||
          result.offset > job.size ||
          chunk.length > WORK_FILE_CHUNK_BYTES ||
          (!chunk.length && !result.done)
        )
          throw Error("転送データが不正です");
        job.chunks.push(chunk);
        job.offset = result.offset;
        if (result.done) {
          job.id = undefined;
          if (job.offset !== job.size) throw Error("ファイルが途中で終了しました");
          const blob = new Blob(job.chunks as BlobPart[]);
          if (
            hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())) !== result.sha256
          )
            throw Error("SHA-256が一致しません");
          if (dead || job.cancel) return;
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = job.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          job.chunks = [];
          job.state = "completed";
          job.message = "ブラウザのダウンロードへ渡しました";
          return;
        }
      }
    }
  } catch (e) {
    if (!dead && !job.cancel) {
      job.state = "failed";
      job.message = e instanceof Error ? e.message : String(e);
    }
  } finally {
    if (dead || job.cancel) {
      job.state = "cancelled";
      await discard(job);
    } else if (job.state === "failed") await discard(job);
  }
}
async function pump() {
  if (running || dead) return;
  running = true;
  try {
    for (;;) {
      const next = jobs.value.find((j) => j.state === "queued");
      if (!next || dead) break;
      await run(next);
    }
  } finally {
    running = false;
  }
}
// A paused transfer is kept alive while this share and its grant remain active.
const timer = setInterval(async () => {
  if (keepingAlive || dead) return;
  keepingAlive = true;
  try {
    for (const job of jobs.value) {
      if (dead) break;
      if (job.state === "paused" && job.id)
        try {
          await owner.request({ action: "status", id: job.id });
        } catch (e) {
          if (!dead && job.state === "paused") {
            job.state = "failed";
            job.message = String(e);
            await discard(job);
          }
        }
    }
  } finally {
    keepingAlive = false;
  }
}, 20000);
onBeforeUnmount(() => {
  dead = true;
  clearInterval(timer);
  for (const job of jobs.value) cancel(job);
  void owner.request({ action: "grant", enabled: false }).catch(() => {});
});
defineExpose({ addFiles });
</script>
<template>
  <details
    :open="opened"
    @toggle="opened = ($event.target as HTMLDetailsElement).open"
    data-desktop-files
  >
    <summary>ファイル転送</summary>
    <button :disabled="busy" @click="grant">
      {{ enabled ? "ファイル転送を解除" : "ファイル転送を許可" }}
    </button>
    <template v-if="enabled">
      <p>共有フォルダ: {{ root }}（1ファイル100MiB、上書きなし）</p>
      <label
        >共有フォルダ内の場所<input
          v-model="folder"
          maxlength="4096"
          @keydown.enter.prevent="list" /></label
      ><button @click="list">一覧を更新</button>
      <input ref="input" type="file" multiple aria-label="送信するファイル" @change="selected" />
      <p>このデスクトップ窓にファイルをドロップして送信できます。フォルダは送信できません。</p>
      <p>一覧の場所: {{ listedFolder || "." }}</p>
      <ul>
        <li v-for="entry in entries" :key="entry.name">
          <button
            v-if="entry.directory"
            @click="
              folder = listedPath(entry.name);
              list();
            "
          >
            📁 {{ entry.name }}</button
          ><template v-else
            >{{ entry.name }}（{{ entry.bytes }} bytes）<button
              @click="download(entry.name, entry.bytes)"
            >
              ダウンロード
            </button></template
          >
        </li>
      </ul>
    </template>
    <ol aria-label="ファイル転送の一覧">
      <li v-for="job in jobs" :key="job.key">
        {{ job.direction === "upload" ? "送信" : "受信" }}: {{ job.name }} — {{ job.offset }} /
        {{ job.size }} bytes —
        {{
          {
            queued: "待機",
            running: "転送中",
            paused: "一時停止",
            completed: "完了",
            cancelled: "取消済み",
            failed: "失敗",
          }[job.state]
        }}
        <button v-if="job.state === 'running' && !job.committing" @click="pause(job)">
          一時停止</button
        ><button v-if="job.state === 'paused'" @click="resume(job)">再開</button
        ><button
          v-if="!job.committing && ['queued', 'running', 'paused'].includes(job.state)"
          @click="cancel(job)"
        >
          取り消す</button
        ><span>{{ job.message }}</span>
      </li>
    </ol>
    <p>
      一時停止した転送はこの窓を開いている間に再開できます。接続終了・再読込後は再送してください。完了表示は接続先保存の確認後です。受信はブラウザの保存先を確認してください。
    </p>
    <p v-if="message" role="status">{{ message }}</p>
  </details>
</template>
<style scoped>
input[type="text"] {
  max-width: 100%;
}
li {
  margin: 0.3em 0;
}
ol {
  max-height: 12em;
  overflow: auto;
}
button {
  margin-inline: 0.2em;
}
</style>
