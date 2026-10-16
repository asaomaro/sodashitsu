<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, ref } from "vue";
import type { AccountCostResult, AccountUsage } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
const props = defineProps<{ account: AccountUsage }>();
const emit = defineEmits<{ close: [] }>();
const conn = inject(ConnectionKey, null),
  dialog = ref<HTMLDialogElement | null>(null);
const result = ref<AccountCostResult | null>(null),
  busy = ref(false),
  error = ref("");
let disposed = false;
async function load() {
  if (!conn || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const response = await conn.request("agent.account_cost", {
      accountKey: props.account.accountKey,
    });
    if (!disposed) result.value = response;
  } catch {
    if (!disposed)
      error.value = "コストを取得できません。接続とサーバーの対応状況を確認してください。";
  } finally {
    if (!disposed) busy.value = false;
  }
}
onMounted(() => {
  dialog.value?.showModal();
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  dialog.value?.close();
});
const money = (n: number | undefined) =>
  n === undefined
    ? "—"
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
</script>
<template>
  <dialog
    ref="dialog"
    class="account-cost-dialog"
    aria-label="アカウントのコスト"
    @cancel.prevent="emit('close')"
    @keydown.stop
    @keyup.stop
  >
    <header>
      <strong>{{ account.label }} · コスト</strong
      ><button type="button" @click="emit('close')">閉じる</button>
    </header>
    <div class="account-cost-body">
      <p>
        この設定フォルダで確認できた保存済みセッションのUSD集計です。契約料金・請求額とは異なります。
      </p>
      <p>内訳のない金額は「不明」です。最後に使ったモデルやエフォートからの推定は行いません。</p>
      <p v-if="busy" role="status">読み込み中…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="result">
        <h3>全体</h3>
        <p data-account-cost-total>{{ money(result.totalUsd) }}</p>
        <p>{{ result.sessions }} セッション · コスト未取得 {{ result.unpricedSessions }} 件</p>
        <p v-if="result.totalUsd === undefined">
          記録にコストがありません。このエージェントやアカウントでは金額を取得できない場合があります。
        </p>
        <p v-if="result.partial" role="status">
          探索・読み取り上限または読めない記録があるため、一部の記録の集計です。
        </p>
        <section
          v-for="group in [
            { title: 'モデル別', rows: result.byModel },
            { title: 'エフォート別', rows: result.byEffort },
          ]"
          :key="group.title"
        >
          <h3>{{ group.title }}</h3>
          <table v-if="group.rows.length">
            <thead>
              <tr>
                <th>分類</th>
                <th>コスト (USD)</th>
                <th>セッション数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rows" :key="row.label">
                <td>{{ row.label }}</td>
                <td>{{ money(row.usd) }}</td>
                <td>{{ row.sessions }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>取得できる内訳がありません。</p>
        </section>
        <p>取得 {{ new Date(result.asOf).toLocaleString() }}</p>
      </template>
    </div>
    <footer>
      <button type="button" :disabled="busy" @click="load">更新</button
      ><span>集計は最大10秒間キャッシュされます。</span>
    </footer>
  </dialog>
</template>
<style scoped>
.account-cost-dialog {
  width: min(52rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 0;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 6px);
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-menu-bg, #282a36);
  overflow: hidden;
}
.account-cost-dialog[open] {
  display: flex;
  flex-direction: column;
}
header,
footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.75em;
  padding: 0.5em 0.75em;
}
header {
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
header button {
  margin-left: auto;
}
.account-cost-body {
  padding: 0 0.75em 0.75em;
  overflow: auto;
  min-height: 0;
}
h3 {
  margin: 0.8em 0 0.3em;
}
p {
  margin: 0.5em 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
th,
td {
  text-align: left;
  padding: 0.4em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  overflow-wrap: anywhere;
}
th:not(:first-child),
td:not(:first-child) {
  text-align: right;
}
button {
  font: inherit;
  padding: 0.3em 0.7em;
  color: inherit;
  background: var(--soda-btn-bg, #44475a);
  border: 1px solid var(--soda-menu-border, #6272a4);
  border-radius: 4px;
  cursor: pointer;
}
footer {
  flex-wrap: wrap;
  font-size: 0.9em;
  border-top: 1px solid var(--soda-menu-border, #44475a);
}
@media (max-width: 600px) {
  .account-cost-dialog {
    width: calc(100vw - 0.5rem);
    max-height: calc(100dvh - 0.5rem);
  }
  button {
    min-height: 44px;
  }
}
</style>
