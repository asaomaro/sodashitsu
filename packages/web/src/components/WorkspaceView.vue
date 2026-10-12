<script setup lang="ts">
import { computed, inject, ref, watch, nextTick, onBeforeUnmount } from "vue";
import {
  BUILTIN_WORKSPACE_KEY,
  type BuiltinViewId,
  type WorkspaceToolsResult,
  type WorkspaceToolsParams,
} from "@sodashitsu/protocol";
import GitHistoryGraph from "./GitHistoryGraph.vue";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useWorkspaceToolsStore } from "../store/workspaceTools.js";
const props = defineProps<{
  workspaceId: string;
  tabId: string;
  kind: Exclude<BuiltinViewId, "statusline">;
  targetPaneId?: string | undefined;
  showHeading?: boolean;
}>();
const conn = inject(ConnectionKey)!;
const session = useSessionStore(),
  tools = useWorkspaceToolsStore();
const selection = computed(() => tools.forTab(JSON.stringify([props.tabId, props.targetPaneId])));
const mobileSection = ref("files"),
  pathInput = ref("");
const roots = ref<NonNullable<WorkspaceToolsResult["entries"]>>([]),
  children = ref<Record<string, NonNullable<WorkspaceToolsResult["entries"]>>>({}),
  expanded = ref(new Set<string>());
const query = ref(""),
  grep = ref(false),
  caseSensitive = ref(false),
  searching = ref(false),
  searched = ref(false),
  matches = ref<NonNullable<WorkspaceToolsResult["matches"]>>([]),
  truncated = ref(false);
const text = ref(""),
  loaded = ref(""),
  version = ref(""),
  loadedPath = ref(""),
  editing = ref(false),
  busy = ref(false),
  error = ref(""),
  message = ref("");
const history = ref(""),
  files = ref<NonNullable<WorkspaceToolsResult["files"]>>([]),
  diff = ref(""),
  staged = ref(false),
  diffPath = ref("");
let generation = 0,
  diffRequest = 0;
const rootEl = ref<HTMLElement | null>(null);
const draftKey = (path: string) =>
  JSON.stringify([props.workspaceId, session.workspaces.get(props.workspaceId)?.projectDir, path]);
watch([text, loaded, version, loadedPath], () => {
  if (!loadedPath.value) return;
  const key = draftKey(loadedPath.value);
  if (text.value !== loaded.value)
    tools.drafts[key] = { text: text.value, loaded: loaded.value, version: version.value };
  else delete tools.drafts[key];
});
function beforeUnload(e: BeforeUnloadEvent) {
  if (Object.keys(tools.drafts).length) {
    e.preventDefault();
    e.returnValue = "";
  }
}
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => {
  generation++;
  window.removeEventListener("beforeunload", beforeUnload);
});
const dirty = computed(() => text.value !== loaded.value);
async function call(
  operation: WorkspaceToolsParams["operation"],
  extra: Partial<WorkspaceToolsParams> = {},
) {
  const epoch = generation;
  const result = await conn.request("workspace.tools", {
    workspaceId: props.workspaceId,
    ...(session.workspaces.get(props.workspaceId)?.projectDir
      ? { expectedFolder: session.workspaces.get(props.workspaceId)!.projectDir }
      : {}),
    operation,
    path: "",
    ...extra,
  });
  if (epoch !== generation) throw new Error("stale-workspace-view");
  return result;
}
function failure(e: unknown) {
  if (e instanceof Error && e.message === "stale-workspace-view") return;
  error.value = e instanceof Error ? e.message : "操作に失敗しました";
}
const flattened = computed(() => {
  const out: { path: string; name: string; directory: boolean; link: boolean; depth: number }[] =
    [];
  function walk(es: typeof roots.value, depth: number) {
    for (const e of es) {
      out.push({ ...e, depth });
      if (expanded.value.has(e.path)) walk(children.value[e.path] ?? [], depth + 1);
    }
  }
  walk(roots.value, 0);
  return out;
});
async function refresh() {
  error.value = "";
  busy.value = true;
  try {
    if (props.kind === "files") {
      roots.value = (await call("list")).entries ?? [];
      children.value = {};
      expanded.value = new Set();
    }
    if (props.kind === "git-graph") history.value = (await call("git-log")).text ?? "";
    if (props.kind === "git-diff") {
      files.value = (await call("git-status")).files ?? [];
      await loadDiff();
    }
  } catch (e) {
    failure(e);
  } finally {
    busy.value = false;
  }
}
async function toggle(path: string) {
  try {
    if (expanded.value.has(path)) {
      expanded.value.delete(path);
      return;
    }
    children.value[path] = (await call("list", { path })).entries ?? [];
    expanded.value.add(path);
  } catch (e) {
    failure(e);
  }
}
async function choose(path: string, line = 1) {
  selection.value.path = path;
  selection.value.line = line;
  // 既存の表示を連携し、無い場合はファイル閲覧用の浮いた窓を開く。
  const tab = session.tabs.get(props.tabId);
  if (
    props.kind === "files" &&
    (props.targetPaneId || tab?.plugin?.extensionKey !== BUILTIN_WORKSPACE_KEY) &&
    !tab?.views?.some(
      (v) =>
        v.extensionKey === BUILTIN_WORKSPACE_KEY &&
        v.viewId === "file" &&
        (props.targetPaneId
          ? v.target === "pane" && v.paneId === props.targetPaneId
          : v.target === "tab"),
    )
  )
    try {
      await conn.request("tab.add_view", {
        tabId: props.tabId,
        extensionKey: BUILTIN_WORKSPACE_KEY,
        viewId: "file",
        target: props.targetPaneId ? "pane" : "tab",
        ...(props.targetPaneId ? { paneId: props.targetPaneId } : {}),
        placement: "float",
      });
    } catch (e) {
      failure(e);
    }
}
async function search() {
  searching.value = true;
  error.value = "";
  try {
    const r = await call("search", {
      query: query.value,
      grep: grep.value,
      caseSensitive: caseSensitive.value,
    });
    matches.value = r.matches ?? [];
    truncated.value = !!r.truncated;
    searched.value = true;
  } catch (e) {
    failure(e);
  } finally {
    searching.value = false;
  }
}
async function read(path: string, force = false) {
  if (!path) return;
  if (
    dirty.value &&
    !force &&
    !window.confirm("未保存の変更を破棄して別のファイルを開きますか？")
  ) {
    selection.value.path = loadedPath.value;
    return;
  }
  if (dirty.value) {
    delete tools.drafts[draftKey(loadedPath.value)];
    force = true;
  }
  const token = ++generation;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const r = await call("read", { path });
    if (token !== generation) return;
    text.value = loaded.value = r.text ?? "";
    version.value = r.version ?? "";
    loadedPath.value = path;
    pathInput.value = path;
    const draft = tools.drafts[draftKey(path)];
    if (draft && !force) {
      text.value = draft.text;
      loaded.value = draft.loaded;
      version.value = draft.version;
      editing.value = true;
      message.value = "未保存の編集を復元しました";
    } else {
      editing.value = false;
      delete tools.drafts[draftKey(path)];
    }
    await nextTick();
    rootEl.value?.querySelector(".selected-line")?.scrollIntoView({ block: "nearest" });
  } catch (e) {
    if (token === generation) failure(e);
  } finally {
    if (token === generation) busy.value = false;
  }
}
async function save() {
  if (!loadedPath.value || !dirty.value) return;
  busy.value = true;
  error.value = "";
  const saving = text.value;
  try {
    const r = await call("write", {
      path: loadedPath.value,
      content: saving,
      version: version.value,
    });
    loaded.value = saving;
    version.value = r.version ?? "";
    message.value = "保存しました";
  } catch (e) {
    failure(e);
  } finally {
    busy.value = false;
  }
}
async function loadDiff() {
  const request = ++diffRequest;
  error.value = "";
  try {
    const result = await call("git-diff", {
      path: diffPath.value,
      staged: staged.value,
      ...(selection.value.commit ? { commit: selection.value.commit } : {}),
    });
    if (request === diffRequest) diff.value = result.text || "変更はありません";
  } catch (e) {
    if (request === diffRequest) failure(e);
  }
}
async function commit(line: string) {
  const hash = line.match(/\b[a-f0-9]{40,64}\b/)?.[0];
  if (!hash) return;
  selection.value.commit = hash;
  const tab = session.tabs.get(props.tabId);
  if (
    (props.targetPaneId || tab?.plugin?.extensionKey !== BUILTIN_WORKSPACE_KEY) &&
    !tab?.views?.some(
      (v) =>
        v.extensionKey === BUILTIN_WORKSPACE_KEY &&
        v.viewId === "git-diff" &&
        (props.targetPaneId
          ? v.target === "pane" && v.paneId === props.targetPaneId
          : v.target === "tab"),
    )
  )
    try {
      await conn.request("tab.add_view", {
        tabId: props.tabId,
        extensionKey: BUILTIN_WORKSPACE_KEY,
        viewId: "git-diff",
        target: props.targetPaneId ? "pane" : "tab",
        ...(props.targetPaneId ? { paneId: props.targetPaneId } : {}),
        placement: "float",
      });
    } catch (e) {
      failure(e);
    }
}
watch(
  () => [props.workspaceId, props.kind, session.workspaces.get(props.workspaceId)?.projectDir],
  (values, previous) => {
    generation++;
    roots.value = [];
    children.value = {};
    history.value = "";
    files.value = [];
    diff.value = "";
    text.value = loaded.value = "";
    loadedPath.value = "";
    if (previous && (previous[0] !== values[0] || previous[2] !== values[2]))
      selection.value.path = "";
    searched.value = false;
    if (props.kind !== "development") void refresh();
  },
  { immediate: true },
);
watch(
  () => selection.value.path,
  (path) => {
    if (props.kind === "file" && path !== loadedPath.value) void read(path);
  },
  { immediate: true },
);
watch(
  () => selection.value.path,
  () => {
    if (props.kind === "development") mobileSection.value = "file";
  },
);
watch(
  () => selection.value.line,
  async () => {
    if (props.kind === "file") {
      await nextTick();
      rootEl.value?.querySelector(".selected-line")?.scrollIntoView({ block: "nearest" });
    }
  },
);
watch(
  () => selection.value.commit,
  () => {
    if (props.kind === "development") mobileSection.value = "git-diff";
  },
);
watch([staged, diffPath, () => selection.value.commit], () => {
  if (props.kind === "git-diff") void loadDiff();
});
</script>
<template>
  <section ref="rootEl" class="workspace-view" :data-workspace-view="kind">
    <template v-if="kind === 'development'">
      <nav class="development-mobile-nav">
        <button
          v-for="section in ['files', 'file', 'git-graph', 'git-diff']"
          :key="section"
          :aria-pressed="mobileSection === section"
          @click="mobileSection = section"
        >
          {{
            { files: "ファイル", file: "表示・編集", "git-graph": "Gitグラフ", "git-diff": "差分" }[
              section
            ]
          }}
        </button>
      </nav>
      <div class="development-layout">
        <WorkspaceView
          v-for="section in ['files', 'file', 'git-graph', 'git-diff'] as const"
          :key="section"
          :class="[
            'development-' + section,
            {
              'mobile-hidden': mobileSection !== section,
              'desktop-hidden':
                section === 'git-graph'
                  ? mobileSection === 'git-diff'
                  : section === 'git-diff'
                    ? mobileSection !== 'git-diff'
                    : false,
            },
          ]"
          :workspace-id="workspaceId"
          :target-pane-id="targetPaneId"
          :tab-id="tabId"
          :kind="section"
          :show-heading="true"
        />
      </div>
    </template>
    <template v-else>
      <header v-if="kind !== 'files' || showHeading" class="workspace-toolbar">
        <strong v-if="showHeading">{{
          {
            files: "ファイルツリー",
            file: "ファイル表示・編集",
            "git-graph": "Gitグラフ",
            "git-diff": "Git差分",
          }[kind]
        }}</strong
        ><button :disabled="busy" @click="kind === 'file' ? read(loadedPath) : refresh()">
          再読込</button
        ><span v-if="busy" role="status">読込中…</span>
      </header>
      <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <template v-if="kind === 'files'">
        <form class="workspace-search" @submit.prevent="search">
          <input
            v-model="query"
            aria-label="ファイル検索語"
            placeholder="ファイル名・内容を検索"
            required
          /><button :disabled="searching">検索</button
          ><label><input v-model="grep" type="checkbox" />内容をGrep</label
          ><label><input v-model="caseSensitive" type="checkbox" />大文字小文字を区別</label>
          <button v-if="!showHeading" type="button" :disabled="busy" @click="refresh">
            再読込
          </button>
          <span v-if="busy && !showHeading" role="status">読込中…</span>
        </form>
        <template v-if="searched"
          ><button @click="searched = false">ツリーへ戻る</button>
          <p v-if="truncated" role="status">検索上限に達しました。検索語を絞ってください。</p>
          <p v-if="!matches.length">該当するファイルはありません</p>
          <div class="workspace-list">
            <button v-for="(m, i) in matches" :key="i" @click="choose(m.path, m.line)">
              {{ m.path }}{{ m.line ? ":" + m.line : "" }}<small v-if="m.text">{{ m.text }}</small>
            </button>
          </div></template
        >
        <div v-else class="workspace-list">
          <button
            v-for="e in flattened"
            :key="e.path"
            :style="{ paddingLeft: 8 + e.depth * 16 + 'px' }"
            @click="e.directory ? toggle(e.path) : choose(e.path)"
          >
            {{ e.directory ? (expanded.has(e.path) ? "▾ " : "▸ ") : "· " }}{{ e.name
            }}{{ e.link ? " ↗" : "" }}
          </button>
        </div>
      </template>
      <template v-if="kind === 'file'">
        <form class="workspace-search" @submit.prevent="read(pathInput)">
          <input
            v-model="pathInput"
            aria-label="ファイルの相対パス"
            placeholder="PJ内のファイルパス"
          /><button>開く</button>
        </form>
        <div v-if="loadedPath" class="workspace-toolbar">
          <span class="workspace-path">{{ loadedPath }}{{ dirty ? " *" : "" }}</span
          ><label><input v-model="editing" type="checkbox" />編集</label
          ><button :disabled="!dirty || busy" @click="save">保存</button>
        </div>
        <textarea
          v-if="editing"
          v-model="text"
          class="workspace-editor"
          aria-label="ファイル編集"
          spellcheck="false"
          @keydown.ctrl.s.prevent="save"
          @keydown.meta.s.prevent="save"
        />
        <div v-else class="workspace-code">
          <pre
            v-for="(line, i) in text.split('\n')"
            :key="i"
            :class="{ 'selected-line': selection.line === i + 1 }"
          ><span>{{i+1}}</span>{{line||' '}}</pre>
        </div>
      </template>
      <template v-if="kind === 'git-graph'"
        ><div class="workspace-code"><GitHistoryGraph :history="history" @select="commit" /></div
      ></template>
      <template v-if="kind === 'git-diff'">
        <div class="workspace-toolbar">
          <label><input v-model="staged" type="checkbox" />ステージ済み</label
          ><button
            @click="
              selection.commit = '';
              diffPath = '';
            "
          >
            作業中の差分
          </button>
        </div>
        <form class="workspace-search" @submit.prevent="loadDiff">
          <input
            v-model="selection.commit"
            aria-label="コミットSHA"
            placeholder="コミットSHA（省略で作業差分）"
            pattern="[a-f0-9]{40,64}"
          /><button>表示</button>
        </form>
        <select v-model="diffPath" aria-label="差分のファイル">
          <option value="">すべてのファイル</option>
          <option v-for="f in files" :key="f.path" :value="f.path">
            {{ f.status }} {{ f.path }}
          </option>
        </select>
        <div class="workspace-code">
          <pre
            v-for="(line, i) in diff.split('\n')"
            :key="i"
            :class="{
              'diff-added': line.startsWith('+'),
              'diff-deleted': line.startsWith('-'),
              'diff-hunk': line.startsWith('@@'),
            }"
            >{{ line }}</pre>
        </div>
      </template>
    </template>
  </section>
</template>
<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--soda-fg);
  background: var(--soda-bg);
  font: 13px system-ui;
  box-sizing: border-box;
}
.workspace-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px;
  border-bottom: 1px solid var(--soda-menu-border);
}
.workspace-toolbar strong {
  flex: 1;
}
.workspace-view button,
.workspace-view input,
.workspace-view select {
  font: inherit;
  color: inherit;
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 4px;
  padding: 5px;
  box-sizing: border-box;
  min-width: 0;
}
.workspace-view button {
  cursor: pointer;
}
.workspace-view input[type="checkbox"] {
  width: auto;
}
.workspace-search {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px;
}
.workspace-search > input {
  flex: 1;
  min-width: 100px;
}
.workspace-list,
.workspace-code {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.workspace-list button {
  display: block;
  text-align: left;
  width: 100%;
  border: 0;
  border-radius: 0;
  padding: 6px 8px;
  background: none;
  overflow-wrap: anywhere;
}
.workspace-list button:hover {
  background: var(--soda-menu-hover-bg);
}
.workspace-list small {
  display: block;
  opacity: 0.8;
}
.workspace-code pre {
  margin: 0;
  padding: 1px 6px;
  font: 13px/1.6 monospace;
  white-space: pre;
  min-height: 1.6em;
}
.workspace-code pre span {
  display: inline-block;
  min-width: 4em;
  opacity: 0.75;
  user-select: none;
}
.workspace-path {
  flex: 1;
  overflow-wrap: anywhere;
}
.workspace-editor {
  flex: 1;
  min-height: 0;
  resize: none;
  padding: 8px;
  color: inherit;
  background: var(--soda-bg);
  border: 0;
  font: 13px/1.6 monospace;
  white-space: pre;
  tab-size: 2;
}
.workspace-error {
  color: var(--soda-error-fg);
  padding: 6px;
  overflow-wrap: anywhere;
}
.workspace-view p {
  margin: 4px 6px;
}
.selected-line {
  background: var(--soda-menu-hover-bg);
}
.diff-added {
  color: var(--soda-state-completed, #8fbc8f);
}
.diff-deleted {
  color: var(--soda-error-fg, #ff7777);
}
.diff-hunk {
  color: var(--soda-accent, #8bbcff);
}
.development-mobile-nav {
  display: flex;
  gap: 4px;
  padding: 4px;
}
.development-mobile-nav button:nth-child(-n + 2) {
  display: none;
}
.development-layout {
  display: grid;
  grid-template-columns: minmax(180px, 25%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 65%) minmax(0, 35%);
  flex: 1;
  min-height: 0;
}
.development-files {
  grid-row: 1/3;
  border-right: 1px solid var(--soda-menu-border);
}
.development-file {
  grid-column: 2;
}
.development-git-graph {
  grid-column: 2;
  grid-row: 2;
}
.development-git-diff {
  grid-column: 2;
  grid-row: 2;
}
.desktop-hidden {
  display: none;
}
@media (max-width: 767px) {
  .development-mobile-nav button:nth-child(-n + 2) {
    display: block;
  }
  .development-mobile-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
  }
  .development-layout {
    display: flex;
    flex-direction: column;
  }
  .development-layout > .workspace-view {
    flex: 1;
    display: flex;
  }
  .development-layout > .mobile-hidden {
    display: none;
  }
  .workspace-view button {
    min-height: 36px;
  }
  .workspace-code pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
</style>
