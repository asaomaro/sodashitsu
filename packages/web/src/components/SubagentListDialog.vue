<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { TerminalRegistryKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import { lookupAgent, lookupPaneName } from "../store/subagents.js";
import SubagentList from "./SubagentList.vue";

/**
 * エージェントが動かしているサブエージェントの一覧（20261004-subagent-display）。`view.dialogContext.kind === "subagents"` を扱う。
 * 見るだけ（操作は閉じるだけ）。中身は開いている間も画面のストアから引く（件数が変われば一覧も変わる）。経過時間は 10 秒ごとに進める（中身は `SubagentList`）。
 * 対象のエージェントが居なくなった・入れ替わった（`instanceId` が変わった）・pane が閉じたら、自分で閉じる。
 * 短い説明などはエージェントが書いた文なので、文字として出す（HTML として解釈しない）。
 */
const view = useViewStore();
const registry = inject(TerminalRegistryKey, null);

const dialogEl = ref<HTMLDialogElement | null>(null);
const listRef = ref<InstanceType<typeof SubagentList> | null>(null);

/** 開いた時点のエージェントの `instanceId`。入れ替わりの判定に使う。 */
const openedInstanceId = ref<string | null>(null);
const target = computed(() => {
  const ctx = view.dialogContext;
  return ctx?.kind === "subagents" ? { machineId: ctx.machineId, paneId: ctx.paneId } : null;
});
/** サイドバーの件数のボタンから開いたか（閉じたときのフォーカスの戻り先を決める）。 */
const openedByButton = computed(() => {
  const ctx = view.dialogContext;
  return ctx?.kind === "subagents" && ctx.opener === "button";
});
const agent = computed(() => (target.value ? lookupAgent(target.value) : undefined));
const subagents = computed(() => agent.value?.subagents);
const title = computed(() =>
  target.value ? `サブエージェント — ${lookupPaneName(target.value)}` : "サブエージェント",
);

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
      void nextTick(() => {
        if (!dialogEl.value?.open) dialogEl.value?.showModal();
        listRef.value?.focus(); // 上下キーですぐ読める
      });
    } else {
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

/**
 * 閉じる。件数のボタンから開いたなら、フォーカスをそのボタンへ戻す（ボタンがもう無ければその行）。ボタンも行も無い（エージェントが居なくなった・pane が閉じた）とき、
 * ボタンから開いていないとき（`show_subagents`）は、今フォーカスのある pane の端末へ明示的に戻す——`closeDialog` は `focusedPaneId` に同じ値を書くだけで、
 * `TerminalPane` の watch が動かず、フォーカスが宙に浮く（AC-I4）。
 * ボタンは件数が 1 以上のときだけ描かれるので、閉じる前に探さず、閉じて描き直された後（`nextTick`）に探す。
 */
function close(): void {
  const wasButton = openedByButton.value;
  const paneId = target.value?.paneId;
  view.closeDialog();
  void nextTick(() => {
    if (wasButton && paneId !== undefined) {
      // agents を畳んでいる（行は `display: none`）ときは、見出しのボタンへ戻す（20261004-ui-interaction-polish）。
      if (view.sectionsCollapsed.agents && !view.sidebarCollapsed) {
        const toggle = document.querySelector<HTMLElement>(".sidebar-agents .sidebar-section-toggle");
        if (toggle) {
          toggle.focus();
          return;
        }
      }
      const css = CSS.escape(paneId);
      const el =
        document.querySelector<HTMLElement>(`.sidebar-agents [data-subagent-pane="${css}"]`) ??
        document.querySelector<HTMLElement>(`.sidebar-agents [data-agent-pane="${css}"]`);
      if (el) {
        el.focus();
        return;
      }
    }
    if (view.focusedPaneId) registry?.focus(view.focusedPaneId);
  });
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  close();
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="subagent-dialog"
    aria-labelledby="subagent-dialog-title"
    @cancel="onNativeCancel"
    @click.self="close"
  >
    <h2 id="subagent-dialog-title" class="subagent-dialog-title">{{ title }}</h2>
    <SubagentList v-if="target" ref="listRef" :subagents="subagents" />
    <div class="subagent-dialog-actions">
      <button type="button" @click="close">閉じる</button>
    </div>
  </dialog>
</template>

<style scoped>
.subagent-dialog {
  box-shadow: var(--soda-shape-shadow, none);
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  width: min(32em, calc(100vw - 2em));
  padding: var(--soda-shape-pad, 1em);
}
.subagent-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.subagent-dialog-title {
  margin: 0 0 0.6em;
  font-size: 1em;
}
.subagent-dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.8em;
}
</style>
