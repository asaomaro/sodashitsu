<script setup lang="ts">
import { DesktopFileResumeStore, type ResumeFile } from "../desktop/fileResumeStore.js";
import { onBeforeUnmount, ref } from "vue";
import {
  WORK_FILE_MAX_BYTES,
  WORK_FILE_CHUNK_BYTES,
  type DesktopFileResult,
} from "@sodashitsu/protocol";
import type { DesktopFileClient } from "../desktop/fileClient.js";
const props = defineProps<{ client: DesktopFileClient; canResume?: boolean; machineId?: string }>();
const resumeStore = new DesktopFileResumeStore();
const remember = ref(false);
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
  checkpoint?: string | undefined;
  saved?: boolean;
  restored?: boolean;
  direction: "upload" | "download";
  name: string;
  path: string;
  size: number;
  offset: number;
  state: "queued" | "running" | "paused" | "completed" | "cancelled" | "failed";
  file?: File | undefined;
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
    if (enabled.value) {
      await list();
      await restore();
    } else entries.value = [];
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
async function restore() {
  if (!props.canResume || !props.machineId) return;
  try {
    for (const record of await resumeStore.list(props.machineId, root.value)) {
      if (dead || !enabled.value) return;
      if (jobs.value.some((j) => j.key === record.key)) continue;
      jobs.value.push({
        key: record.key,
        direction: record.direction,
        name: record.name,
        path: record.path,
        size: record.size,
        offset: record.offset,
        checkpoint: record.checkpoint,
        hash: record.hash,
        saved: true,
        restored: true,
        state: "paused",
        pause: true,
        cancel: false,
        chunks: [],
        message: "保存済みです。再開するには「再開」を押してください",
      });
    }
  } catch (e) {
    if (!dead) message.value = String(e);
  }
}
async function discard(job: Job) {
  if (job.checkpoint) {
    try {
      await owner.request({ action: "checkpoint_abort", checkpoint: job.checkpoint });
      if (job.saved) await resumeStore.removeJob(job.key);
      job.checkpoint = undefined;
      job.saved = false;
      job.chunks = [];
    } catch (e) {
      if (job.saved && !dead) {
        job.cancel = false;
        job.state = "paused";
        job.pause = true;
        job.message = "取消を確認できません。接続し直して再度取り消してください: " + String(e);
      }
    }
    return;
  }
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
  if (job.checkpoint || (props.canResume && props.machineId && remember.value)) {
    await runCheckpoint(job);
    return;
  }
  job.state = "running";
  try {
    if (job.id) {
      const state = await owner.request(
        job.checkpoint
          ? { action: "checkpoint_status", checkpoint: job.checkpoint }
          : { action: "status", id: job.id! },
      );
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
async function runCheckpoint(job: Job) {
  job.state = "running";
  try {
    if (job.restored) {
      const stored = await resumeStore.payload({
        key: job.key,
        checkpoint: job.checkpoint!,
        offset: job.offset,
      } as ResumeFile);
      job.file = stored.file;
      job.chunks = stored.chunks;
      if (
        job.direction === "upload" &&
        hex(await crypto.subtle.digest("SHA-256", await job.file!.arrayBuffer())) !== job.hash
      )
        throw Error("保存済みの転送元が変更されています");
      job.restored = false;
    }
    if (dead || job.cancel) return;
    let result: NonNullable<DesktopFileResult["result"]>;
    if (!job.checkpoint) {
      if (job.direction === "upload")
        job.hash = hex(await crypto.subtle.digest("SHA-256", await job.file!.arrayBuffer()));
      if (dead || job.cancel) return;
      result = await owner.request(
        job.direction === "upload"
          ? { action: "checkpoint_upload", path: job.path, bytes: job.size, sha256: job.hash! }
          : { action: "checkpoint_download", path: job.path },
      );
      job.checkpoint = result.checkpoint;
      if (!job.checkpoint || result.bytes !== job.size || !result.sha256 || !result.expiresInMs)
        throw Error("再開用の転送記録を確認できません");
      job.hash = result.sha256;
      if (dead || job.cancel) return;
      await resumeStore.create(
        {
          key: job.key,
          machine: props.machineId!,
          root: root.value,
          name: job.name,
          path: job.path,
          direction: job.direction,
          size: job.size,
          offset: 0,
          checkpoint: job.checkpoint,
          hash: job.hash,
          expires: Date.now() + result.expiresInMs,
        },
        job.file,
      );
      job.saved = true;
    } else {
      result = await owner.request({
        action: "checkpoint_attach",
        checkpoint: job.checkpoint,
        offset: job.offset,
      });
      if (
        result.bytes !== job.size ||
        result.sha256 !== job.hash ||
        result.offset === undefined ||
        result.offset < job.offset ||
        result.offset > job.size ||
        (job.direction === "download" && result.offset !== job.offset)
      )
        throw Error("再開記録と保存済みデータが一致しません");
      await resumeStore.progress(job.key, result.offset);
      job.offset = result.offset;
    }
    while (!dead && !job.cancel) {
      if (job.pause) {
        job.state = "paused";
        return;
      }
      if (job.direction === "upload") {
        if (job.offset === job.size) {
          job.committing = true;
          result = await owner.request({
            action: "checkpoint_finish",
            checkpoint: job.checkpoint!,
          });
          job.committing = false;
          if (result.bytes !== job.size || result.sha256 !== job.hash || !result.done)
            throw Error("保存結果を確認できません");
          job.message = result.destination;
          break;
        }
        const data = new Uint8Array(
          await job
            .file!.slice(job.offset, Math.min(job.offset + WORK_FILE_CHUNK_BYTES, job.size))
            .arrayBuffer(),
        );
        if (dead || job.cancel) return;
        result = await owner.request({
          action: "checkpoint_write",
          checkpoint: job.checkpoint!,
          offset: job.offset,
          data: base64(data),
        });
        if (result.offset !== job.offset + data.length) throw Error("転送位置が一致しません");
        if (job.cancel) return;
        await resumeStore.progress(job.key, result.offset);
        job.offset = result.offset;
        data.fill(0);
      } else {
        if (job.offset === job.size) {
          const blob = new Blob(job.chunks as BlobPart[]);
          if (hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())) !== job.hash)
            throw Error("保存済みデータのSHA-256が一致しません");
          if (dead || job.cancel) return;
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = job.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          job.message = "ブラウザのダウンロードへ渡しました";
          break;
        }
        result = await owner.request({
          action: "checkpoint_read",
          checkpoint: job.checkpoint!,
          offset: job.offset,
        });
        const chunk = Uint8Array.from(atob(result.data ?? ""), (v) => v.charCodeAt(0));
        if (
          result.sha256 !== job.hash ||
          result.offset !== job.offset + chunk.length ||
          result.offset > job.size ||
          chunk.length > WORK_FILE_CHUNK_BYTES ||
          !chunk.length ||
          result.done !== (result.offset === job.size)
        )
          throw Error("転送データが不正です");
        if (dead || job.cancel) return;
        await resumeStore.progress(job.key, result.offset, chunk);
        job.chunks.push(chunk);
        job.offset = result.offset;
      }
    }
    if (!dead && !job.cancel) {
      await resumeStore.removeJob(job.key);
      job.state = "completed";
      job.saved = false;
      const checkpoint = job.checkpoint!;
      job.checkpoint = undefined;
      job.chunks = [];
      await owner.request({ action: "checkpoint_abort", checkpoint }).catch(() => {});
      await list();
    }
  } catch (e) {
    job.committing = false;
    if (!dead && !job.cancel) {
      job.state = job.saved ? "paused" : "failed";
      job.pause = job.saved === true;
      job.message = String(e) + (job.saved ? "。再接続後に再開するか、取り消してください" : "");
    }
  } finally {
    if (job.cancel || (job.checkpoint && !job.saved)) {
      await discard(job);
      if (job.cancel) job.state = "cancelled";
    }
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
  resumeStore.releaseAll();
  clearInterval(timer);
  for (const job of jobs.value) if (!job.checkpoint) cancel(job);
  if (!jobs.value.some((job) => job.checkpoint))
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
    <p v-if="canResume" data-file-resume-notice>
      再開用データを保存すると、切断・再読込後に許可し直して再開できます。ブラウザ合計100MiB・8件、最後の操作から15分まで。接続先の再起動・設定変更では失効します。
    </p>
    <label v-if="canResume"
      ><input
        v-model="remember"
        type="checkbox"
      />切断後の再開用に転送データをこのブラウザへ保存</label
    >
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
    <p v-if="canResume">
      保存を選んだ転送は再接続後に許可し直して再開できます。ブラウザを閉じている間に期限切れになったデータは、次回のファイル転送利用時に削除します。完了表示は接続先保存の確認後です。受信はブラウザの保存先を確認してください。
    </p>
    <p v-else>
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
