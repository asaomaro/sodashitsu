<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { WorkAgentRequest } from "@sodashitsu/protocol";
import { ConnectionKey, LocalClientFactoryKey, MachineSwitcherKey } from "../injection.js";
import { useMachinesStore } from "../store/machines.js";

const connection = inject(ConnectionKey, null), factory = inject(LocalClientFactoryKey, null);
const switcher = inject(MachineSwitcherKey, null), machines = useMachinesStore();
const requests = ref<WorkAgentRequest[]>([]), busy = ref(false), message = ref("");
let polling = false, disposed = false, timer: ReturnType<typeof setInterval> | undefined;
const local = factory?.(() => {});
async function poll() {
  const machineId = machines.selectedId;
  if (polling || disposed || !connection || machineId === "local") return;
  polling = true;
  try {
    const result = await connection.request("work.agent_requests", {});
    if (!disposed && machineId === machines.selectedId) requests.value = result.requests.filter(r => r.state === "pending");
  } catch { if (machineId === machines.selectedId) requests.value = []; }
  finally { polling = false; }
}
async function launch(request: WorkAgentRequest) {
  if (!local || busy.value) return;
  const machineId = machines.selectedId;
  busy.value = true; message.value = "";
  try {
    const result = await local.request("work.agent_launch", { machineId, requestId: request.id });
    requests.value = requests.value.filter(r => r.id !== request.id);
    if (!disposed) await switcher?.switchTo("local", result, { force: true });
  } catch (e) { message.value = e instanceof Error ? e.message : "起動できませんでした。操作元PCのCLIと接続を確認してください"; }
  finally { busy.value = false; }
}
async function reject(request: WorkAgentRequest) {
  if (!connection || busy.value) return;
  try { await connection.request("work.agent_reject", { id: request.id }); await poll(); }
  catch (e) { message.value = e instanceof Error ? e.message : "要求を取り消せませんでした"; }
}
watch(() => machines.selectedId, () => { requests.value = []; message.value = ""; void poll(); });
onMounted(() => { local?.start(); void poll(); timer = setInterval(() => void poll(), 1500); });
onBeforeUnmount(() => { disposed = true; local?.stop(); if (timer) clearInterval(timer); });
</script>

<template>
  <aside v-if="requests.length || message" class="work-agent-requests" aria-label="接続先からのエージェント起動要求">
    <strong>操作元のエージェントを起動</strong>
    <div v-for="request in requests" :key="request.id" class="work-agent-request">
      <div>{{ machines.statusOf(machines.selectedId)?.label }} / {{ request.folder }}</div>
      <code>{{ request.agentKind }} {{ request.args.join(' ') }}</code>
      <p v-if="request.task">プラグイン: {{ request.task.pluginKey }}<br>制作指示: {{ request.task.taskFile }}</p>
      <p>このPCのエージェントを新しいペインで起動し、上の接続先PJを操作します。</p>
      <button type="button" :disabled="busy || !local" @click="launch(request)">{{ busy ? '起動中…' : '起動' }}</button>
      <button type="button" :disabled="busy" @click="reject(request)">取り消す</button>
    </div>
    <p v-if="message" role="alert">{{ message }}</p>
  </aside>
</template>

<style scoped>
.work-agent-requests { position: fixed; right: 1rem; bottom: 2.5rem; z-index: 1200; max-width: min(36rem, 90vw); max-height: 65vh; overflow: auto; padding: 1rem; background: var(--bg, #20212a); color: var(--fg, #eee); border: 1px solid #888; border-radius: .5rem; box-shadow: 0 3px 15px #0008; }
.work-agent-request { margin-top: .75rem; overflow-wrap: anywhere; }
.work-agent-request code { white-space: pre-wrap; }
.work-agent-request p { margin: .5rem 0; }
.work-agent-request button { margin-right: .5rem; }
</style>
