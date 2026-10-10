<script setup lang="ts">
/**
 * ダッシュボードの画面（20261010-agent-usage PR3）。主な領域の 3 つ目の画面。**`<dialog>` を使わない**ので、サイドバーが残り、操作できる。
 * 見えている間（`view.screen === "dashboard"`）だけ中身を出し、利用状況の配信を頼む（`UsageController`。`view.usageWatchWanted`）。
 * 見えない間は、中身を持たない（`v-if`）ので、時計も動かない。基本画面は、`App.vue` が大きさを保ったまま見えなくする（D11）。
 */
import DashboardView from "../dashboard/DashboardView.vue";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
</script>

<template>
  <div class="dashboard-screen">
    <DashboardView v-if="view.screen === 'dashboard'" kind="screen" :active="view.screen === 'dashboard'" />
  </div>
</template>

<style scoped>
.dashboard-screen {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
