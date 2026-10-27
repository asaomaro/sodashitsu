<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  desktopBrowserIdentity,
  desktopEndpointPeer,
  desktopEndpointMode,
  initializeDesktopEndpointIdentity,
  pinDesktopEndpointPeer,
  forgetDesktopEndpointPeer,
  allowPlainDesktopEndpoint,
} from "../desktop/desktopEndpointIdentity.js";
const props = defineProps<{ machineId: string }>(),
  emit = defineEmits<{ reconnect: []; plain: [] }>();
const fingerprint = ref(""),
  peer = ref(""),
  confirmed = ref(false),
  plainConfirmed = ref(false),
  required = ref(false),
  busy = ref(false),
  message = ref("");
let generation = 0;
onBeforeUnmount(() => {
  generation++;
});
async function load(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) return;
  const current = ++generation;
  try {
    const mandatory = await desktopEndpointMode(props.machineId);
    if (current !== generation) return;
    required.value = mandatory;
    const identity = await desktopBrowserIdentity(),
      own = await identity.fingerprint();
    if (current !== generation) return;
    fingerprint.value = own;
    const pin = mandatory ? await desktopEndpointPeer(props.machineId) : "";
    if (current === generation) peer.value = pin;
  } catch (error) {
    if (current === generation)
      message.value = error instanceof Error ? error.message : "暗号化接続の設定を読み取れません。";
  }
}
async function run(action: (active: () => boolean) => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  const current = ++generation;
  message.value = "";
  try {
    await action(() => current === generation);
  } catch (error) {
    if (current === generation)
      message.value = error instanceof Error ? error.message : "設定できませんでした。";
  } finally {
    busy.value = false;
  }
}
function initialize() {
  void run(async (active) => {
    const result = await initializeDesktopEndpointIdentity();
    if (!active()) return;
    fingerprint.value = result.fingerprint;
    message.value = "この指紋を、接続先PCのlocalhost設定画面で許可してください。";
  });
}
function save() {
  if (!confirmed.value) return;
  void run(async (active) => {
    const pin = peer.value.replace(/[\s-]/g, "").toLowerCase();
    await pinDesktopEndpointPeer(props.machineId, pin);
    if (!active()) return;
    peer.value = pin;
    required.value = true;
    confirmed.value = false;
    message.value = "接続先の指紋を保存しました。暗号化で接続し直します。";
    emit("reconnect");
  });
}
function forget() {
  void run(async (active) => {
    await forgetDesktopEndpointPeer(props.machineId);
    if (!active()) return;
    peer.value = "";
    confirmed.value = false;
    required.value = true;
    message.value = "相手の設定を削除しました。通常接続には自動で戻りません。";
  });
}
function plain() {
  if (!plainConfirmed.value) return;
  void run(async (active) => {
    await allowPlainDesktopEndpoint(props.machineId);
    if (!active()) return;
    required.value = false;
    plainConfirmed.value = false;
    message.value = "通常接続へ切り替えます。";
    emit("plain");
  });
}
</script>
<template>
  <details data-desktop-endpoint @toggle="load">
    <summary>暗号化接続</summary>
    <p>
      接続先PCのlocalhost設定で鍵を作成し、このブラウザの指紋を許可してください。接続先で「暗号化接続を必須にする」を有効にします。
    </p>
    <button type="button" :disabled="busy || !!fingerprint" @click="initialize">
      このブラウザの鍵を作成
    </button>
    <p v-if="fingerprint">
      このブラウザの指紋: <code data-browser-fingerprint>{{ fingerprint }}</code>
    </p>
    <label
      >接続先PCで確認した指紋<input
        v-model="peer"
        type="text"
        maxlength="96"
        autocomplete="off"
        spellcheck="false"
        :disabled="busy"
    /></label>
    <label
      ><input
        v-model="confirmed"
        type="checkbox"
        :disabled="busy"
      />接続先PCのlocalhost画面に表示された指紋と一致することを確認しました</label
    >
    <button type="button" :disabled="busy || !fingerprint || !confirmed" @click="save">
      この接続先を記憶して暗号化で接続
    </button>
    <button v-if="required" type="button" :disabled="busy" @click="forget">
      相手の設定を削除して切断
    </button>
    <template v-if="required"
      ><label
        ><input
          v-model="plainConfirmed"
          type="checkbox"
          :disabled="busy"
        />接続先PCでも必須設定を解除し、通常接続へ戻すことを確認しました</label
      ><button type="button" :disabled="busy || !plainConfirmed" @click="plain">
        通常接続へ明示的に切り替える
      </button></template
    >
    <p>
      指紋の不一致や鍵を読み取れない場合は停止します。通常接続へは自動で戻りません。ブラウザへ配信されるプログラムと両端のPCは信頼する必要があります。
    </p>
    <p v-if="message" role="status">{{ message }}</p>
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
