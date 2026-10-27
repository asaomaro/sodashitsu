<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from "vue";
import type { DesktopEndpointStatus, DesktopEndpointPeer } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
const props = defineProps<{ canConfigure: boolean }>(),
  connection = inject(ConnectionKey);
const state = ref<DesktopEndpointStatus>(),
  busy = ref(false),
  message = ref(""),
  required = ref(false),
  fingerprint = ref(""),
  label = ref("接続元ブラウザ"),
  confirmed = ref(false);
let generation = 0;
onBeforeUnmount(() => {
  generation++;
});
watch(
  () => props.canConfigure,
  () => {
    generation++;
    state.value = undefined;
  },
);
async function run(action: () => Promise<DesktopEndpointStatus>, success = "") {
  if (busy.value || !props.canConfigure) return;
  busy.value = true;
  message.value = "";
  const current = ++generation;
  try {
    const result = await action();
    if (current !== generation) return;
    state.value = result;
    required.value = result.required;
    message.value = result.message ?? success;
  } catch (error) {
    if (current === generation)
      message.value =
        error instanceof Error ? error.message : "暗号化接続の設定を読み書きできません。";
  } finally {
    busy.value = false;
  }
}
function load(event: Event) {
  if ((event.target as HTMLDetailsElement).open)
    void run(() => connection!.request("desktop.endpoint.status", {}));
}
function initialize() {
  void run(
    () => connection!.request("desktop.endpoint.initialize", {}),
    "鍵を作成しました。この指紋を接続元で確認し、接続元の指紋もここで許可してください。",
  );
}
function save() {
  void run(
    () => connection!.request("desktop.endpoint.required", { required: required.value }),
    "保存しました。共有中の接続は停止し、次の接続から適用します。",
  );
}
function trust() {
  if (!confirmed.value) return;
  void run(async () => {
    const result = await connection!.request("desktop.endpoint.trust", {
      fingerprint: fingerprint.value.replace(/[\s-]/g, "").toLowerCase(),
      role: "viewer",
      label: label.value,
    });
    confirmed.value = false;
    return result;
  }, "接続元を許可しました。接続元でこのPCの指紋を設定してください。");
}
function revoke(peer: DesktopEndpointPeer) {
  void run(
    () =>
      connection!.request("desktop.endpoint.revoke", {
        fingerprint: peer.fingerprint,
        role: peer.role,
      }),
    "許可を取り消し、この相手の接続を停止しました。",
  );
}
</script>
<template>
  <details data-endpoint-settings @toggle="load">
    <summary>暗号化接続の鍵と許可</summary>
    <p v-if="!canConfigure">このPCのlocalhost設定画面で管理してください。</p>
    <template v-else>
      <p>
        中継へ画面・入力・音声・ファイルの平文を渡さない接続を設定します。接続元とこのPCの指紋を、それぞれの画面で確認して相互に許可してください。
      </p>
      <button
        type="button"
        :disabled="busy || state?.initialized || state?.available === false"
        @click="initialize"
      >
        このPCの暗号化接続用の鍵を作成
      </button>
      <p v-if="state?.fingerprint">
        このPCの指紋: <code data-provider-fingerprint>{{ state.fingerprint }}</code>
      </p>
      <fieldset :disabled="busy || !state?.initialized || !state?.available">
        <label><input v-model="required" type="checkbox" />暗号化接続を必須にする</label>
        <button type="button" @click="save">暗号化の必須設定を保存</button>
        <p>
          有効にすると、通常接続と古い接続元からの共有を拒否します。許可済みの接続元を登録してから有効にしてください。
        </p>
        <label
          >接続元ブラウザの指紋<input
            v-model="fingerprint"
            type="text"
            maxlength="96"
            autocomplete="off"
            spellcheck="false"
        /></label>
        <label>接続元の名前<input v-model="label" type="text" maxlength="80" /></label>
        <label><input v-model="confirmed" type="checkbox" />接続元の画面で指紋を確認しました</label>
        <button type="button" :disabled="!confirmed" @click="trust">この接続元を許可</button>
        <ul>
          <li v-for="peer in state?.peers" :key="peer.role + peer.fingerprint">
            {{ peer.label }}（{{ peer.role === "viewer" ? "ブラウザ" : "エージェント" }}）
            <code>{{ peer.fingerprint }}</code>
            <button type="button" @click="revoke(peer)">許可を取り消す</button>
          </li>
        </ul>
      </fieldset>
      <p>
        鍵を読み取れない場合は共有を停止し、自動で鍵を作り直したり通常接続へ戻ったりしません。ブラウザへ配信されるプログラムと両端のPCは信頼する必要があります。
      </p>
      <p v-if="message" role="status">{{ message }}</p>
    </template>
  </details>
</template>
<style scoped>
label {
  display: block;
}
code {
  overflow-wrap: anywhere;
}
input[type="text"] {
  width: min(40rem, 95%);
}
</style>
