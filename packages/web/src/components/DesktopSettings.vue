<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from "vue";
import type { DesktopPermissions, DesktopSettingsResult } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import DesktopEndpointSettings from "./DesktopEndpointSettings.vue";
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const connection = inject(ConnectionKey);
const state = ref<DesktopSettingsResult>();
const draft = ref<DesktopPermissions>({
  enabled: false,
  allowInput: false,
  allowClipboard: false,
  allowDisplayResize: false,
});
const busy = ref(false),
  message = ref("");
let generation = 0;
onBeforeUnmount(() => {
  generation++;
});
watch(
  () => props.active,
  async (active) => {
    const current = ++generation;
    state.value = undefined;
    if (!active) return;
    message.value = "";
    try {
      const result = await connection!.request("desktop.settings.get", {});
      if (current !== generation) return;
      state.value = result;
      draft.value = { ...result.permissions };
    } catch {
      if (current === generation)
        message.value = "デスクトップ共有の設定を取得できません。サーバーを更新してください。";
    }
  },
  { immediate: true },
);

async function save() {
  if (busy.value || !state.value?.canConfigure) return;
  busy.value = true;
  const current = generation;
  message.value = "";
  try {
    const result = await connection!.request("desktop.settings.set", { ...draft.value });
    if (current !== generation) return;
    state.value = result;
    draft.value = { ...result.permissions };
    message.value =
      "保存しました。共有中の場合はいったん停止します。再接続すると新しい許可が反映されます。";
  } catch {
    if (current === generation)
      message.value = "保存できませんでした。接続先PCのlocalhost画面と、共有フォルダの絶対パス・存在を確認してください。";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="settings-section" aria-labelledby="settings-desktop-sharing">
    <h3 id="settings-desktop-sharing" class="settings-heading">デスクトップ共有</h3>
    <p>このPCの画面を、接続済みのSodashitsuへ共有する許可です。</p>
    <p v-if="state && !state.canConfigure">
      変更するには、共有するPCのlocalhostの画面、または端末版から設定を開いてください。
    </p>
    <p v-if="state?.setupMessage">{{state.setupMessage}}</p>
    <p v-if="state && !state.supported && !state.nativePlatform">
      同梱のWindows補助プログラムが利用できません。WindowsまたはWSLで使用してください。
    </p>
    <fieldset :disabled="busy || !state?.canConfigure">
      <label
        ><input
          v-model="draft.enabled"
          type="checkbox"
          :disabled="!state?.supported && !draft.enabled"
        />画面共有を許可</label
      >
      <label
        ><input v-model="draft.allowInput" type="checkbox" />マウス・キーボードの操作を許可</label
      >
      <template v-if="!state?.nativePlatform">
      <label><input v-model="draft.allowElevated" type="checkbox" />管理者権限のアプリ・UAC画面の共有を許可</label>
      <p v-if="draft.allowElevated">接続先Windowsで専用保護サービスの導入・更新が必要です。接続時にも管理者画面を選び、操作は接続ごとに許可します。</p>
      <label><input v-model="draft.allowVirtualDisplay" type="checkbox" />一時的な仮想画面の作成を許可</label>
      <p v-if="draft.allowVirtualDisplay">接続先Windows 11 x64に署名済み仮想画面ドライバーと専用保護サービスの導入が必要です。</p>
      <label><input v-model="draft.allowMonitors" type="checkbox" />全モニターの共有と切替を許可</label>
      <label><input v-model="draft.allowMicrophone" type="checkbox" />接続元からのマイク転送を許可</label>
      <label>マイク転送先の仮想オーディオ再生デバイスID<input v-model="draft.microphoneEndpoint" type="text" maxlength="512" placeholder="仮想ケーブルの再生側のデバイスID" /></label>
      <p>仮想オーディオケーブルを別途導入し、その再生側のIDを指定してください。アプリでは対応する録音側をマイクとして選びます。</p>
      <label><input v-model="draft.allowSystemAudio" type="checkbox" />システム音声の送信を許可</label>
      <p>共有するPCの通常デスクトップの音を送ります。接続側でも音声共有と再生を開始してください。</p>
      <label><input v-model="draft.allowClipboard" type="checkbox" />クリップボードを許可</label>
      <label><input v-model="draft.allowUnlock" type="checkbox" />Sodashitsu起動中のロック解除を許可</label>
      <p v-if="draft.allowUnlock">接続先Windowsで、専用補助サービスの初回導入が必要です。解除操作にはマウス・キーボードの許可も必要です。</p>
      <label
        ><input
          v-model="draft.allowDisplayResize"
          type="checkbox"
        />ディスプレイ解像度の変更を許可</label
      >
      </template>
      <label>ファイル共有フォルダ（空欄で無効）<input v-model="draft.fileRoot" type="text" maxlength="4096" placeholder="このサーバーOSの絶対パス" /></label>
      <p>このフォルダの中だけを送受信します。既存ファイルは上書きしません。WSLサーバーでは/mnt/c等のパスを指定します。</p>
      <button type="button" @click="save">共有設定を保存</button>
    </fieldset>
    <DesktopEndpointSettings :can-configure="state?.canConfigure===true" />
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<style scoped>
fieldset {
  border: 0;
  padding: 0;
}
label {
  display: block;
  margin-block: 8px;
}
</style>
