<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, ref } from "vue";
import type { ManagedConnection, DelegationStatus, PairingRequest } from "@sodashitsu/protocol";
import { ConnectionKey, LocalClientFactoryKey } from "../injection.js";
const fallback = inject(ConnectionKey, null),
  factory = inject(LocalClientFactoryKey, null);
const local = factory?.(() => void refresh()),
  conn = local ?? fallback;
const connections = ref<ManagedConnection[]>([]),
  delegations = ref<DelegationStatus[]>([]),
  requests = ref<PairingRequest[]>([]);
const error = ref(""),
  busy = ref(false),
  url = ref(""),
  label = ref(""),
  requestId = ref(""),
  code = ref("");
const showAdd = ref(false),
  sshLabel = ref(""),
  sshTarget = ref(""),
  sshSession = ref("");
const delegationForm = ref<HTMLFieldSetElement | null>(null);
function openDelegation() {
  delegationForm.value?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  delegationForm.value?.querySelector("input")?.focus();
}
async function addConnection() {
  await run(async () => {
    await conn!.request("machine.add", {
      label: sshLabel.value.trim(),
      target: sshTarget.value.trim(),
      ...(sshSession.value.trim() ? { session: sshSession.value.trim() } : {}),
    });
    showAdd.value = false;
    sshLabel.value = "";
    sshTarget.value = "";
    sshSession.value = "";
  });
}
let dead = false,
  loading = false,
  timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  if (!conn || loading) return;
  loading = true;
  try {
    const [a, b, c] = await Promise.all([
      conn.request("machine.connections", {}),
      conn.request("machine.delegations", {}),
      conn.request("machine.pairing_requests", {}),
    ]);
    if (!dead) {
      connections.value = a.connections;
      delegations.value = b.delegations;
      requests.value = c.requests;
      error.value = "";
    }
  } catch {
    if (!dead)
      error.value = "外部接続を取得できません。接続先サーバーの対応状況を確認してください。";
  } finally {
    loading = false;
  }
}
async function run(task: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await task();
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作できません";
  } finally {
    busy.value = false;
  }
}
function manage(item: ManagedConnection, action: "enable" | "disable" | "remove") {
  if (
    action === "remove" &&
    !window.confirm(`「${item.label}」の接続登録を削除しますか？ 作業中のプロセスは停止しません。`)
  )
    return;
  void run(() => conn!.request("machine.manage", { id: item.id, action }));
}
async function request() {
  await run(async () => {
    const r = await conn!.request("machine.request_delegation", {
      url: url.value,
      label: label.value,
    });
    requestId.value = r.id;
  });
}
async function confirm() {
  await run(async () => {
    await conn!.request("machine.confirm_delegation", { id: requestId.value, code: code.value });
    requestId.value = "";
    code.value = "";
  });
}
onMounted(() => {
  if (local) local.start();
  else void refresh();
  timer = setInterval(() => {
    if (!busy.value) void refresh();
  }, 5000);
});
onBeforeUnmount(() => {
  dead = true;
  if (timer) clearInterval(timer);
  local?.stop();
});
const stateName = (state: string) =>
  ({
    online: "接続済み",
    connecting: "接続待ち",
    reconnecting: "再接続中",
    attention: "要対応",
    disabled: "無効",
  })[state] ?? state;
</script>
<template>
  <section class="connections-screen" aria-label="外部接続" @keydown.esc.stop>
    <header>
      <h1>外部接続</h1>
      <button :disabled="busy" @click="showAdd = !showAdd">外部Sodashitsuを追加</button>
      <button :disabled="busy" @click="openDelegation">操作を委譲する</button>
      <button :disabled="busy" @click="refresh">更新</button>
    </header>
    <p>
      このSodashitsuの外部接続を管理します。別のマシンを表示中でも、管理対象はこのサーバーです。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <fieldset v-if="showAdd" :disabled="busy">
      <legend>外部Sodashitsuを追加（SSH）</legend>
      <p>
        SSHで接続でき、相手側でSodashitsuが起動している必要があります。認証には設定済みのSSH鍵・ssh-agentを使います。
      </p>
      <p>相手からこのPCへ接続する場合は、相手側の画面で「操作を委譲する」を選んでください。</p>
      <form @submit.prevent="addConnection">
        <label>接続名<input v-model="sshLabel" required maxlength="128" /></label>
        <label
          >SSH接続先<input
            v-model="sshTarget"
            required
            maxlength="1024"
            placeholder="user@host または SSH設定のHost名"
        /></label>
        <label
          >相手のセッション名（省略可）<input
            v-model="sshSession"
            maxlength="128"
            placeholder="default"
        /></label>
        <button>登録して接続</button>
        <button type="button" @click="showAdd = false">キャンセル</button>
      </form>
      <p>登録後、接続状態を一覧に表示します。接続できない場合も登録は残ります。</p>
    </fieldset>
    <fieldset :disabled="busy">
      <legend>操作する接続</legend>
      <p v-if="!connections.length">登録された接続はありません。</p>
      <article v-for="item in connections" :key="item.id" :data-connection-id="item.id">
        <strong>{{ item.label }}</strong
        ><span
          >{{ item.transport === "ssh" ? "SSH" : "外向き接続" }} · {{ stateName(item.state) }}</span
        >
        <small>{{ item.transport === "ssh" ? item.target : "" }} {{ item.message }}</small>
        <div>
          <button @click="manage(item, item.enabled ? 'disable' : 'enable')">
            {{ item.enabled ? "無効化" : "有効化" }}</button
          ><button @click="manage(item, 'remove')">登録削除</button>
        </div>
      </article>
    </fieldset>
    <fieldset :disabled="busy">
      <legend>操作を委譲している接続</legend>
      <p v-if="!delegations.length">委譲中の接続はありません。</p>
      <article v-for="item in delegations" :key="item.id">
        <strong>{{ item.url }}</strong
        ><span>{{ stateName(item.state) }} {{ item.message }}</span
        ><button @click="run(() => conn!.request('machine.stop_delegation', { id: item.id }))">
          委譲を停止
        </button>
      </article>
    </fieldset>
    <fieldset :disabled="busy">
      <legend>承認待ちの申請（{{ requests.length }}）</legend>
      <p v-if="!requests.length">申請はありません。</p>
      <p v-else>
        相手の名前は自己申告です。意図した申請と確認できた場合だけコードを伝えてください。
      </p>
      <article v-for="item in requests" :key="item.id">
        <strong>{{ item.label }}</strong
        ><span>{{ item.address }} · {{ new Date(item.expiresAt).toLocaleTimeString() }}まで</span
        ><strong class="pairing-code">{{ item.code }}</strong
        ><button @click="run(() => conn!.request('machine.reject_pairing', { id: item.id }))">
          申請を拒否
        </button>
      </article>
    </fieldset>
    <fieldset ref="delegationForm" :disabled="busy">
      <legend>このPCの操作を委譲する</legend>
      <p>
        このセッション全体の操作を委譲します。操作する側のURLに申請し、相手側の「その他 →
        外部接続」に表示されるコードをここへ入力してください。
      </p>
      <form v-if="!requestId" @submit.prevent="request">
        <label
          >操作する側のURL<input
            v-model="url"
            required
            placeholder="https://soda.example.com" /></label
        ><label>このPCの名前<input v-model="label" required maxlength="128" /></label
        ><button>接続を申請</button>
      </form>
      <form v-else @submit.prevent="confirm">
        <label
          >相手に表示された8桁コード<input
            v-model="code"
            required
            inputmode="numeric"
            pattern="[0-9]{8}"
            maxlength="8"
            autocomplete="off" /></label
        ><button>コードを確認して委譲</button
        ><button
          type="button"
          @click="
            requestId = '';
            code = '';
          "
        >
          入力を戻す
        </button>
      </form>
    </fieldset>
  </section>
</template>
<style scoped>
.connections-screen {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  box-sizing: border-box;
  color: var(--soda-fg);
  background: var(--soda-bg);
}
header,
article > div,
form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
h1 {
  margin: 0;
  flex: 1;
}
fieldset {
  margin: 16px 0;
  border: 1px solid var(--soda-menu-border);
  min-width: 0;
}
article {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid var(--soda-menu-border);
}
article strong {
  overflow-wrap: anywhere;
}
article small {
  flex-basis: 100%;
}
button,
input {
  color: var(--soda-fg);
  background: var(--soda-input-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 4px;
  padding: 6px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pairing-code {
  font-family: monospace;
  font-size: 1.2em;
  letter-spacing: 0.15em;
}
p[role="alert"] {
  color: var(--soda-warn-fg);
}
</style>
