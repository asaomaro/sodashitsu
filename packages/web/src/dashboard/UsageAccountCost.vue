<script setup lang="ts">
import type { AccountUsage, AccountCostResult } from "@sodashitsu/protocol";
defineProps<{
  accounts: AccountUsage[];
  selected: string;
  cost: AccountCostResult | null;
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ select: [key: string]; refresh: [] }>();
const money = (n: number | undefined) =>
  n === undefined ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
</script>
<template>
  <section class="account-cost" data-account-cost aria-label="保存済みコスト">
    <header>
      <div>
        <span class="eyebrow">RECORDED COST</span>
        <h2>保存済みセッションのコスト</h2>
        <p>期間指定なしの保存済み記録USDを、設定単位ごとに確認します。</p>
      </div>
      <div class="cost-controls">
        <label
          >アカウント<select
            :value="selected"
            :disabled="busy"
            data-analytics-account
            @change="emit('select', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">選択してください</option>
            <option v-for="a in accounts" :key="a.accountKey" :value="a.accountKey">
              {{ a.label }}
            </option>
          </select></label
        ><button data-assistant-action :disabled="!selected || busy" @click="emit('refresh')">
          {{ busy ? "取得中…" : "記録を更新" }}
        </button>
      </div>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="cost"
      ><div class="cost-metrics">
        <article>
          <span>アカウント累計USD（期間指定なし）</span><strong>{{ money(cost.totalUsd) }}</strong>
        </article>
        <article>
          <span>セッション</span><strong>{{ cost.sessions }}</strong>
        </article>
        <article>
          <span>コスト未取得</span><strong>{{ cost.unpricedSessions }}</strong>
        </article>
      </div>
      <p v-if="cost.partial" class="notice">読取上限や読めない記録があり、一部の集計です。</p>
      <div class="cost-breakdowns">
        <section>
          <h3>モデル別</h3>
          <div v-for="row in cost.byModel" :key="row.label" class="cost-row" data-analytics-model>
            <div>
              <strong>{{ row.label }}</strong
              ><span>{{ money(row.usd) }} · {{ row.sessions }}セッション</span>
            </div>
            <div class="track">
              <i
                :style="{
                  width: `${cost.totalUsd ? Math.min(100, (row.usd / cost.totalUsd) * 100) : 0}%`,
                }"
              />
            </div>
          </div>
          <p v-if="!cost.byModel.length">モデル別の金額は未取得です。</p>
        </section>
        <section>
          <h3>エフォート別</h3>
          <div v-for="row in cost.byEffort" :key="row.label" class="cost-row">
            <div>
              <strong>{{ row.label }}</strong
              ><span>{{ money(row.usd) }}</span>
            </div>
            <div class="track">
              <i
                :style="{
                  width: `${cost.totalUsd ? Math.min(100, (row.usd / cost.totalUsd) * 100) : 0}%`,
                }"
              />
            </div>
          </div>
          <p v-if="!cost.byEffort.length">エフォートの内訳は未取得です。</p>
        </section>
      </div></template
    >
    <p v-else-if="!busy">アカウントを選ぶと、保存済み記録の内訳を表示します。</p>
    <details>
      <summary>金額の集計範囲</summary>
      <p>
        期間指定なしの記録USDで、契約料金・請求額ではありません。明示されたモデル・エフォートだけに分類し、残りは「不明」とします。Bobcoin・AICはUSDに換算しません。選択したアカウントはエージェント分析の対象にも使えます。
      </p>
    </details>
  </section>
</template>
<style scoped>
.account-cost {
  margin-top: 24px;
  border: 1px solid var(--soda-menu-border);
  border-radius: 17px;
  background: var(--soda-menu-bg);
  padding: 24px;
  min-width: 0;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--soda-accent);
}
h2 {
  font-size: 23px;
  margin: 5px 0;
}
p,
details {
  color: color-mix(in srgb, var(--soda-fg) 76%, transparent);
  font-size: 13px;
}
.cost-controls {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}
.cost-controls label {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  min-width: 0;
  max-width: 240px;
}
select,
button {
  font: inherit;
  color: inherit;
  background: var(--soda-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 8px;
  padding: 8px 12px;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.cost-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 22px 0;
}
.cost-metrics article {
  border: 1px solid var(--soda-menu-border);
  padding: 16px;
  border-radius: 12px;
}
.cost-metrics span {
  font-size: 12px;
}
.cost-metrics strong {
  display: block;
  font-size: 26px;
  overflow-wrap: anywhere;
}
.cost-breakdowns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}
.cost-row {
  margin: 15px 0;
}
.cost-row > div:first-child {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  overflow-wrap: anywhere;
}
.cost-row span {
  font-size: 12px;
}
.track {
  height: 10px;
  background: color-mix(in srgb, var(--soda-fg) 10%, transparent);
  border-radius: 7px;
  margin-top: 8px;
  overflow: hidden;
}
.track i {
  height: 100%;
  display: block;
  border-radius: 7px;
  background: var(--soda-accent);
}
.notice {
  color: var(--soda-warn-fg);
}
details {
  margin-top: 20px;
}
summary {
  cursor: pointer;
}
@media (max-width: 680px) {
  .account-cost {
    padding: 18px;
  }
  .cost-breakdowns {
    grid-template-columns: minmax(0, 1fr);
  }
  .cost-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .cost-controls {
    width: 100%;
  }
  .cost-controls label {
    flex: 1;
  }
}
</style>
