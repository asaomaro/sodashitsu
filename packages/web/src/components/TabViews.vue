<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { BUILTIN_WORKSPACE_KEY, BUILTIN_VIEWS, BUILTIN_WEB_VIEWS, viewSupportsTarget } from "@sodashitsu/protocol";
import type { Tab, TabViewInstance } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useExtensionsStore } from "../store/extensions.js";
import { useViewStore } from "../store/view.js";

const props = defineProps<{ tab: Tab; showAddButton?: boolean }>();
const conn = inject(ConnectionKey);
const session = useSessionStore(),
  extensions = useExtensionsStore(),
  view = useViewStore();
const dialog = ref<HTMLDialogElement | null>(null);
const choice = ref(""),
  target = ref<"tab" | "pane">("tab"),
  placement = ref<TabViewInstance["placement"]>("right"),
  paneId = ref("");
const search = ref("");
const workspace = computed(() => session.workspaces.get(props.tab.workspaceId));
const candidates = computed(() => [
  ...BUILTIN_WEB_VIEWS.map((def) => ({
    key: JSON.stringify([BUILTIN_WORKSPACE_KEY, def.id]),
    ext: { key: BUILTIN_WORKSPACE_KEY, id: "標準", scope: "builtin", state: "running" },
    def: {
      ...def,
      requiresProject: true,
      placements: [...def.placements] as TabViewInstance["placement"][],
    },
  })),
  ...(extensions.list?.extensions ?? [])
    .filter(
      (e) =>
        e.state === "running" &&
        (e.scope === "user" || e.workspaceIds?.includes(props.tab.workspaceId)),
    )
    .flatMap((ext) =>
      (ext.views ?? []).map((def) => ({ key: JSON.stringify([ext.key, def.id]), ext, def })),
    ),
]);
const filtered = computed(() =>
  candidates.value
    .filter((c) => viewSupportsTarget(c.def, target.value))
    .filter((c) => `${c.def.title} ${c.ext.id}`.toLowerCase().includes(search.value.toLowerCase())),
);
const selected = computed(() => filtered.value.find((c) => c.key === choice.value));
const workers = computed(() =>
  [...session.panes.values()].filter((p) => p.tabId === props.tab.id && !p.virtual),
);
const missingProject = computed(
  () => selected.value?.def.requiresProject !== false && !workspace.value?.projectDir,
);
const places: Record<TabViewInstance["placement"], string> = {
  right: "右パネル",
  left: "左パネル",
  top: "上パネル",
  bottom: "下パネル",
  float: "浮いた窓",
  "band-top": "上の帯",
  "band-bottom": "下の帯",
};

async function perspective(value: "terminal" | "app") {
  try {
    await conn?.request("tab.set_perspective", { tabId: props.tab.id, perspective: value });
  } catch {
    view.toast("画面を切り替えられませんでした");
  }
}
async function open() {
  view.openDialogWithContext({ kind: "addView", tabId: props.tab.id });
}
function close() {
  dialog.value?.close();
  if (view.dialogContext?.kind === "addView") view.closeDialog();
}
watch(
  () => view.dialogContext,
  async (ctx) => {
    if (ctx?.kind !== "addView" || ctx.tabId !== props.tab.id) {
      dialog.value?.close();
      return;
    }
    search.value = "";
    choice.value = "";
    target.value = ctx.paneId ? "pane" : "tab";
    paneId.value = ctx.paneId ?? props.tab.focusedPaneId;
    await nextTick();
    dialog.value?.showModal();
  },
);
watch(search, () => {
  if (!filtered.value.some((c) => c.key === choice.value)) choice.value = "";
});
function select() {
  placement.value = selected.value?.def.placements[0] ?? "right";
}
async function add() {
  const item = selected.value;
  if (
    !item ||
    missingProject.value ||
    (target.value === "pane" && !workers.value.some((p) => p.id === paneId.value))
  )
    return;
  try {
    await conn?.request("tab.add_view", {
      tabId: props.tab.id,
      extensionKey: item.ext.key,
      viewId: item.def.id,
      target: target.value,
      placement: placement.value,
      ...(target.value === "pane" ? { paneId: paneId.value } : {}),
    });
    close();
  } catch {
    view.toast("ビューを追加できません。拡張の状態とPJフォルダを確認してください");
  }
}
async function showWorker(id: string) {
  await perspective("terminal");
  if (workers.value.some((p) => p.id === id)) {
    view.focusPane(id);
    void conn?.request("pane.focus", { paneId: id }).catch(() => undefined);
  }
}

</script>

<template>
  <div
    v-if="tab.plugin || showAddButton"
    class="tab-views"
    aria-label="タブのビュー"
  >
    <div v-if="tab.plugin" class="tab-perspectives" role="group" aria-label="パースペクティブ">
      <button :aria-pressed="tab.perspective === 'terminal'" @click="perspective('terminal')">
        作業画面
      </button>
      <button :aria-pressed="tab.perspective !== 'terminal'" @click="perspective('app')">
        アプリ画面
      </button>
    </div>
    <button v-if="showAddButton" class="tab-add-view" @click="open">ビューを追加</button>
    <div v-if="tab.plugin && workers.length > 1" class="tab-workers" aria-label="ペインを選択">
      <span>ペインを選択:</span>
      <button v-for="p in workers" :key="p.id" @click="showWorker(p.id)">
        {{ p.agent?.label ?? p.label ?? "ターミナル"
        }}<span v-if="p.agent"> · {{ p.agent.state }}</span>
      </button>
    </div>
  </div>
  <dialog ref="dialog" class="view-picker" @click.self="close" @cancel.prevent="close">
    <form @submit.prevent="add">
      <h2>ビューを追加</h2>
      <label
        >検索<input v-model="search" type="search" placeholder="ビュー名・プラグイン名"
      /></label>
      <label
        >ビュー<select aria-label="ビュー" v-model="choice" @change="select">
          <option value="" disabled>ビューを選択</option>
          <option v-for="c in filtered" :key="c.key" :value="c.key">
            {{ c.def.title }} · {{ c.ext.id }}（{{
              c.ext.scope === "builtin" ? "標準" : c.ext.scope === "user" ? "ユーザー" : "PJ"
            }}）
          </option>
        </select></label
      >
      <p v-if="!candidates.some((c) => viewSupportsTarget(c.def, target))" role="status">
        この情報の対象に対応するビューがありません。対応するプラグインを導入・有効化してください。
      </p>
      <p v-else-if="!filtered.length" role="status">検索条件に一致するビューがありません。</p>
      <p>情報の対象: {{ target === "tab" ? "タブ全体" : "このペイン" }}</p>
      <label
        >配置<select aria-label="配置" v-model="placement">
          <option v-for="p in selected?.def.placements ?? []" :key="p" :value="p">
            {{ places[p] }}
          </option>
        </select></label
      >
      <p v-if="selected && missingProject" role="status">
        このビューにはワークスペースのPJフォルダ設定が必要です。
      </p>
      <div class="view-picker-actions">
        <button type="button" @click="close">キャンセル</button
        ><button type="submit" :disabled="!selected || missingProject">追加</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.tab-views {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 8px;
  flex: none;
  border-bottom: 1px solid var(--soda-menu-border);
  font-size: 12px;
}
.tab-add-view {
  margin-left: auto;
  color: var(--soda-fg);
  background: var(--soda-menu-bg);
  border: var(--soda-shape-seg-border, 1px) solid var(--soda-menu-border);
  border-radius: var(--soda-shape-seg-radius, 4px);
  padding: var(--soda-shape-seg-pad-y, 4px) var(--soda-shape-seg-pad-x, 8px);
}
.tab-add-view:hover {
  background: var(--soda-menu-hover-bg);
}
.tab-perspectives,
.tab-workers {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tab-views button {
  font: inherit;
  min-height: 26px;
}
.tab-perspectives button[aria-pressed="true"] {
  outline: 2px solid var(--soda-accent);
  outline-offset: -2px;
}
.tab-view-instance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.view-picker {
  box-sizing: border-box;
  width: 420px;
  max-width: calc(100% - 16px);
  color: var(--soda-menu-fg);
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: var(--soda-shape-radius);
  padding: var(--soda-shape-pad, 16px);
}
.view-picker::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.view-picker form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.view-picker h2,
.view-picker p {
  margin: 0;
}
.view-picker h2 {
  font-size: 1.1em;
}
.view-picker label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.view-picker input,
.view-picker select,
.view-picker button {
  font: inherit;
  box-sizing: border-box;
  min-height: 32px;
}
.view-picker input,
.view-picker select {
  width: 100%;
  padding: 5px 8px;
}
.view-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
