<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from "vue";
import type { VscodeSharingPermissions, VscodeSharingSettingsResult } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const connection = inject(ConnectionKey);
const state = ref<VscodeSharingSettingsResult>();
const draft = ref<VscodeSharingPermissions>({
  enabled: false,
  allowInput: false,
  allowFit: false,
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
      const result = await connection!.request("vscode.settings.get", {});
      if (current !== generation) return;
      state.value = result;
      draft.value = { ...result.permissions };
    } catch {
      if (current === generation)
        message.value = "VSCode共有の設定を取得できません。サーバーを更新してください。";
    }
  },
  { immediate: true },
);

async function save() {
  if (!draft.value.allowInput) draft.value.allowFit = false;
  if (busy.value || !state.value?.canConfigure) return;
  busy.value = true;
  const current = generation;
  message.value = "";
  try {
    const result = await connection!.request("vscode.settings.set", { ...draft.value });
    if (current !== generation) return;
    state.value = result;
    draft.value = { ...result.permissions };
    message.value =
      "保存しました。自動起動した接続は停止します。次の起動から新しい設定を使います。";
  } catch {
    if (current === generation)
      message.value = "保存できませんでした。接続先PCのlocalhost画面から設定してください。";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="settings-section" aria-labelledby="settings-vscode-sharing">
    <h3 id="settings-vscode-sharing" class="settings-heading">VSCode共有</h3>
    <p>
      このPCのVSCodeを、画面の「VSCodeを起動・接続」でhelperを自動起動するための設定です。helperコマンドの手入力は不要です。
    </p>
    <p v-if="state && !state.canConfigure">
      変更するには、共有するPCのlocalhostの画面、または端末版から設定を開いてください。
    </p>
    <p v-if="state && !state.supported">
      同梱のVSCode補助プログラムが利用できません。WindowsまたはWSLで使用してください。
    </p>
    <p>
      Windows側にVSCodeとNode
      24が必要です。既存の通常起動したVSCodeは再起動せず、必要なら共有専用プロファイルで起動します。
    </p>
    <p v-if="state?.customCommand">
      既存の起動コマンドを使用します。操作とサイズ追従の許可は、そのコマンドの設定に従います。
    </p>
    <p>
      手動で登録した共有元の許可には適用しません。その許可の変更は共有元の登録を解除して行ってください。
    </p>
    <fieldset :disabled="busy || !state?.canConfigure">
      <label
        ><input
          v-model="draft.enabled"
          type="checkbox"
          :disabled="!state?.supported && !draft.enabled"
        />接続ボタンからの自動起動を許可</label
      >
      <label v-if="!state?.customCommand"
        ><input v-model="draft.allowInput" type="checkbox" />自動起動した共有元の操作を許可</label
      >
      <label v-if="!state?.customCommand"
        ><input
          v-model="draft.allowFit"
          type="checkbox"
          :disabled="!draft.allowInput"
        />自動起動した共有元のサイズ追従を許可</label
      >
      <label v-if="!state?.customCommand"
        >このPCのSodashitsu URL（空欄はlocalhost）<input
          v-model="draft.sodaOrigin"
          type="url"
          placeholder="https://このサーバーの証明書名"
      /></label>
      <p v-if="!state?.customCommand">
        Sodashitsu自体でHTTPSを使う場合は、証明書が有効なこのPCのURLを指定してください。証明書の検証は無効にしません。
      </p>
      <button type="button" @click="save">共有設定を保存</button>
    </fieldset>
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
