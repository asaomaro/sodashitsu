<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { formatSubagentElapsed, subagentsMoreLabel } from "@sodashitsu/client-core";
import { useViewStore } from "../store/view.js";
import { lookupAgent, lookupPaneName } from "../store/subagents.js";

/**
 * エージェントが動かしているサブエージェントの一覧（20261004-subagent-display）。`view.dialogContext.kind === "subagents"` を扱う。
 * 見るだけ（操作は閉じるだけ）。中身は開いている間も画面のストアから引く（件数が変われば一覧も変わる）。経過時間は 10 秒ごとに進める。
 * 対象のエージェントが居なくなった・入れ替わった（`instanceId` が変わった）・pane が閉じたら、自分で閉じる。
 * 短い説明などはエージェントが書いた文なので、文字として出す（HTML として解釈しない）。
 */
const view = useViewStore();

const dialogEl = ref<HTMLDialogElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

/** 開いた時点のエージェントの `instanceId`。入れ替わりの判定に使う。 */
const openedInstanceId = ref<string | null>(null);
/** 経過時間の「今」。開いている間だけ 10 秒ごとに進める。 */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const target = computed(() => {
  const ctx = view.dialogContext;
  return ctx?.kind === "subagents" ? { machineId: ctx.machineId, paneId: ctx.paneId } : null;
});
const agent = computed(() => (target.value ? lookupAgent(target.value) : undefined));
const subagents = computed(() => agent.value?.subagents);
const items = computed(() => subagents.value?.items ?? []);
const more = computed(() => (subagents.value ? subagentsMoreLabel(subagents.value) : null));
const title = computed(() => (target.value ? `サブエージェント — ${lookupPaneName(target.value)}` : "サブエージェント"));

function stopTicker(): void {
  if (ticker !== undefined) clearInterval(ticker);
  ticker = undefined;
}

watch(
  target,
  (t) => {
    if (t) {
      const opened = lookupAgent(t);
      if (!opened) {
        close(); // 開く時点で対象のエージェントが居ない（操作 `show_subagents` 等）なら、開かない
        return;
      }
      openedInstanceId.value = opened.instanceId;
      now.value = Date.now();
      stopTicker();
      ticker = setInterval(() => (now.value = Date.now()), 10_000);
      void nextTick(() => {
        if (!dialogEl.value?.open) dialogEl.value?.showModal();
        listEl.value?.focus(); // 上下キーですぐ読める
      });
    } else {
      stopTicker();
      openedInstanceId.value = null;
      dialogEl.value?.close();
    }
  },
  { immediate: true },
);

// 対象が居なくなった・入れ替わったら閉じる（画面のストアの変化を見る）。
watch(agent, (a) => {
  if (!target.value) return;
  if (!a || (openedInstanceId.value !== null && a.instanceId !== openedInstanceId.value)) close();
});

onBeforeUnmount(stopTicker);

function close(): void {
  view.closeDialog();
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  close();
}
</script>

<template>
  <dialog ref="dialogEl" class="subagent-dialog" aria-labelledby="subagent-dialog-title" @cancel="onNativeCancel" @click.self="close">
    <h2 id="subagent-dialog-title" class="subagent-dialog-title">{{ title }}</h2>
    <div ref="listEl" class="subagent-dialog-list" tabindex="0" role="list" aria-label="サブエージェントの一覧">
      <p v-if="items.length === 0" class="subagent-dialog-empty">実行中のサブエージェントはありません</p>
      <div v-for="item in items" :key="item.id" class="subagent-dialog-item" role="listitem">
        <div class="subagent-dialog-item-head">
          <span class="subagent-dialog-type">{{ item.type ?? "サブエージェント" }}</span>
          <span v-if="item.background" class="subagent-dialog-bg">バックグラウンド</span>
          <span class="subagent-dialog-elapsed">{{ formatSubagentElapsed(item.startedAt, now) }}</span>
        </div>
        <div v-if="item.description" class="subagent-dialog-desc">{{ item.description }}</div>
      </div>
      <p v-if="more" class="subagent-dialog-more">{{ more }}</p>
    </div>
    <div class="subagent-dialog-actions">
      <button type="button" @click="close">閉じる</button>
    </div>
  </dialog>
</template>

<style scoped>
.subagent-dialog {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: 4px;
  width: min(32em, calc(100vw - 2em));
  padding: 1em;
}
.subagent-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.subagent-dialog-title {
  margin: 0 0 0.6em;
  font-size: 1em;
}
.subagent-dialog-list {
  max-height: 50vh;
  overflow-y: auto;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 3px;
  padding: 0.3em 0.5em;
}
.subagent-dialog-list:focus-visible {
  outline: 2px solid var(--soda-accent, #8be9fd);
}
.subagent-dialog-empty,
.subagent-dialog-more {
  margin: 0.4em 0;
  opacity: 0.8;
}
.subagent-dialog-item {
  padding: 0.35em 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.subagent-dialog-item:last-of-type {
  border-bottom: none;
}
.subagent-dialog-item-head {
  display: flex;
  gap: 0.6em;
  align-items: baseline;
}
.subagent-dialog-type {
  font-weight: 600;
}
.subagent-dialog-bg {
  font-size: 0.85em;
  opacity: 0.8;
}
.subagent-dialog-elapsed {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.subagent-dialog-desc {
  margin-top: 0.15em;
  overflow-wrap: anywhere;
}
.subagent-dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.8em;
}
</style>
