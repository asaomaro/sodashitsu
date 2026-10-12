<script setup lang="ts">
import { inject, onMounted, ref, onBeforeUnmount } from "vue";
import type { PluginCandidate } from "@sodashitsu/protocol";
import { ConnectionKey, ExtensionControllerKey } from "../injection.js";
const conn = inject(ConnectionKey),
  controller = inject(ExtensionControllerKey, null),
  candidates = ref<PluginCandidate[]>([]),
  selected = ref<PluginCandidate | null>(null),
  busy = ref(false),
  error = ref("");
let dead = false;
async function refresh() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await conn?.request("plugin.discover", {});
    if (!dead && result) candidates.value = result.candidates;
  } catch {
    if (!dead) error.value = "配置されたパッケージを取得できません";
  } finally {
    busy.value = false;
  }
}
async function register() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  error.value = "";
  const candidate = selected.value;
  try {
    await conn?.request("plugin.register", { key: candidate.key, digest: candidate.digest });
    if (!dead) {
      selected.value = null;
      await controller?.reload();
    }
  } catch (e) {
    if (!dead) error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
    if (!dead) await refresh();
  }
}
onMounted(() => void refresh());
onBeforeUnmount(() => (dead = true));
</script>
<template>
  <div class="plugin-packages">
    <h4>配置されたプラグインパッケージ</h4>
    <button :disabled="busy" @click="refresh">パッケージを探す</button>
    <p role="status" v-if="error">{{ error }}</p>
    <p v-if="!candidates.length">未登録のパッケージはありません。</p>
    <article v-for="candidate in candidates" :key="candidate.key">
      <strong>{{ candidate.name }} {{ candidate.version }}</strong
      ><span> · {{ candidate.scope === "user" ? "ユーザー全体" : "PJ限定" }}</span>
      <p>{{ candidate.path }}</p>
      <button :disabled="busy" @click="selected = candidate">確認して登録</button>
    </article>
    <section v-if="selected" class="plugin-package-review" aria-label="パッケージ登録の確認">
      <h4>{{ selected.name }} {{ selected.version }} を登録</h4>
      <p>{{ selected.description }}</p>
      <p>配置元: {{ selected.path }}</p>
      <p>範囲: {{ selected.scope === "user" ? "すべてのワークスペース" : selected.root }}</p>
      <p>権限: {{ selected.allow.join("、") || "追加権限なし" }} · {{ selected.files }}ファイル</p>
      <p>OSの利用者の権限でプログラムを起動します。</p>
      <p class="package-digest">検証値: {{ selected.digest }}</p>
      <button :disabled="busy" @click="register">許可して登録・有効化</button
      ><button :disabled="busy" @click="selected = null">キャンセル</button>
    </section>
  </div>
</template>
<style scoped>
.plugin-packages article,
.plugin-package-review {
  border: 1px solid var(--soda-menu-border);
  padding: 10px;
  margin: 8px 0;
}
.plugin-packages p {
  overflow-wrap: anywhere;
}
.package-digest {
  font-family: monospace;
  font-size: 0.8em;
}
.plugin-packages button {
  font: inherit;
}
</style>
