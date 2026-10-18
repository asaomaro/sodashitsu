<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from "vue";
import type { DesktopPermissions, DesktopSettingsResult } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
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
      message.value = "保存できませんでした。接続先PCのlocalhost画面から設定してください。";
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
    <p v-if="state && !state.supported">
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
      <label><input v-model="draft.allowClipboard" type="checkbox" />クリップボードを許可</label>
      <label
        ><input
          v-model="draft.allowDisplayResize"
          type="checkbox"
        />ディスプレイ解像度の変更を許可</label
      >
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
