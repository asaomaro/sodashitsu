<script setup lang="ts">
import { computed, inject, nextTick, ref } from "vue";
import { VIEWER_LABELS, type ViewerTab } from "@sodashitsu/protocol";
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { useMachinesStore } from "../store/machines.js";
import { useViewStore } from "../store/view.js";
import { TerminalRegistryKey } from "../injection.js";
const registry = inject(TerminalRegistryKey, undefined);
const tabs = useViewerTabsStore(),
  machines = useMachinesStore(),
  view = useViewStore();
const menu = ref(false),
  dragged = ref<string>();
const machineLabel = computed(
  () => machines.sections.find((m) => m.id === machines.selectedId)?.label ?? machines.selectedId,
);
const icons = { "web-preview": "▣", desktop: "▤", vscode: "⌘" };
async function select(id: string) {
  tabs.select(id);
  menu.value = false;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-viewer-tab="${id}"]`)?.focus();
}
async function create(kind: ViewerTab["kind"]) {
  if (!view.workspaceId) return;
  try {
    const tab = await tabs.create({
      kind,
      label: VIEWER_LABELS[kind],
      workspaceId: view.workspaceId,
      machineId: machines.selectedId,
    });
    await select(tab.id);
  } catch {
    view.toast("閲覧タブを作成できません。操作元の接続とサーバーの対応状況を確認してください。");
  }
  menu.value = false;
}
function drop(targetId: string) {
  if (dragged.value)
    void tabs.move(dragged.value, targetId).catch(() => view.toast("閲覧タブを移動できません"));
  dragged.value = undefined;
}
async function close(id: string) {
  try {
    await tabs.remove(id);
    await nextTick();
    if (!tabs.active && view.focusedPaneId) registry?.focus(view.focusedPaneId);
  } catch {
    view.toast("閲覧タブを閉じられません");
  }
}
</script>
<template>
  <div class="viewer-tabs" aria-label="操作元の閲覧タブ">
    <div class="viewer-tab-list" role="tablist" aria-label="閲覧タブ">
      <div
        v-for="tab in tabs.visible"
        :key="tab.id"
        class="viewer-item"
        :class="{ active: tabs.active?.id === tab.id }"
        draggable="true"
        @contextmenu.prevent="menu = true"
        @dragstart="dragged = tab.id"
        @dragend="dragged = undefined"
        @dragover.prevent
        @drop.prevent="drop(tab.id)"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="tabs.active?.id === tab.id"
          :aria-label="tab.label"
          :title="`${tab.label} — ${machineLabel}（操作元だけに保存）`"
          @click="select(tab.id)"
          @keydown.delete.prevent="close(tab.id)"
        >
          <span aria-hidden="true">{{ icons[tab.kind] }}</span> {{ tab.label }}
          <small>{{ machineLabel }}</small>
        </button>
        <button
          type="button"
          class="viewer-close"
          :aria-label="`${tab.label}の閲覧タブを閉じる`"
          @click="close(tab.id)"
        >
          ×
        </button>
      </div>
    </div>
    <div class="viewer-actions">
    <slot name="actions" />
    <div class="viewer-menu-anchor">
      <button
        type="button"
        class="viewer-menu-button"
        :aria-expanded="menu"
        aria-label="接続ビューを追加・選択"
        @click="menu = !menu"
      >
        ＋接続ビュー
      </button>
      <div v-if="menu" class="viewer-menu" role="menu" @keydown.esc.stop="menu = false">
        <div v-for="(tab, index) in tabs.visible" :key="tab.id" class="viewer-menu-row">
          <button role="menuitem" @click="select(tab.id)">
            {{ tab.label }} · {{ machineLabel }}
          </button>
          <button
            role="menuitem"
            :aria-label="`${tab.label}の閲覧タブを閉じる`"
            @click="close(tab.id)"
          >
            閉じる
          </button>
          <button
            role="menuitem"
            :aria-label="`${tab.label}を左へ`"
            :disabled="index === 0"
            @click="tabs.move(tab.id, tabs.visible[index - 1]!.id)"
          >
            ←
          </button>
          <button
            role="menuitem"
            :aria-label="`${tab.label}を右へ`"
            :disabled="index === tabs.visible.length - 1"
            @click="tabs.move(tab.id, tabs.visible[index + 1]!.id)"
          >
            →
          </button>
          <button
            role="menuitem"
            @click="
              view.openDialogWithContext({
                kind: 'renameTab',
                tabId: tab.id,
                currentLabel: tab.label,
              });
              menu = false;
            "
          >
            名前を変更
          </button>
        </div>
        <button
          v-for="(label, kind) in VIEWER_LABELS"
          :key="kind"
          role="menuitem"
          :disabled="!view.workspaceId || (kind === 'desktop' && machines.selectedId === 'local')"
          @click="create(kind)"
        >
          ＋ {{ label }}
        </button>
      </div>
    </div>
    </div>
  </div>
</template>
<style scoped>
.viewer-tabs {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  gap: 4px;
  margin-inline-start: auto;
  padding-inline-start: 10px;
  border-inline-start: 1px solid var(--soda-border, #45475a);
  min-width: 0;
  max-width: 70%;
  flex: 0 1 auto;
}
.viewer-tab-list {
  display: flex;
  gap: 4px;
  margin-inline-start: auto;
  overflow-x: auto;
  min-width: 0;
}
.viewer-item {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--soda-border, #45475a);
  border-radius: 5px;
  white-space: nowrap;
}
.viewer-tabs button {
  color: inherit;
  background: transparent;
  border: 0;
  min-height: 0;
  font: inherit;
  padding: 0 6px;
  cursor: pointer;
}
.viewer-item.active {
  border-color: var(--soda-accent, #89b4fa);
  box-shadow: inset 0 -2px var(--soda-accent, #89b4fa);
}
.viewer-item small {
  opacity: 0.7;
  margin-inline-start: 4px;
  font-size: 0.8em;
}
.viewer-menu-anchor {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
}
.viewer-menu {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 100;
  background: var(--soda-menu-bg, #282a36);
  border: 1px solid var(--soda-border, #45475a);
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 3px 8px #0006;
}
.viewer-menu-row {
  border-bottom: 1px solid var(--soda-border, #45475a);
}
.viewer-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 5px 8px;
}
.viewer-menu button:hover {
  background: var(--soda-selection-bg, #45475a);
}
.viewer-tabs button:focus-visible {
  outline: 2px solid var(--soda-accent, #89b4fa);
  outline-offset: -2px;
}
.viewer-tabs button:disabled {
  opacity: 0.45;
  cursor: default;
}
.viewer-actions {
  display: flex;
  flex: none;
  align-items: stretch;
  gap: var(--soda-shape-seg-gap, 0px);
}
.viewer-tabs .viewer-menu-button {
  white-space: nowrap;
  padding: 0.5em var(--soda-shape-pad-x, 1em);
  min-height: var(--soda-shape-control-h, auto);
}
.viewer-tabs .viewer-menu-button:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
:root[data-ui-style="modern"] .viewer-item,
:root[data-ui-style="modern"] .viewer-menu {
  font-size: var(--soda-shape-seg-font);
}
:root[data-ui-style="modern"] .viewer-tabs .viewer-menu-button {
  font-size: var(--soda-shape-seg-font);
  padding: var(--soda-shape-seg-pad-y) var(--soda-shape-seg-tab-pad-x);
  border: var(--soda-shape-seg-border) solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-seg-radius);
}
@media (max-width: 900px) {
  .viewer-tab-list { display: none; }
  .viewer-tabs { max-width: 70%; padding-inline-start: 4px; }
}
</style>
