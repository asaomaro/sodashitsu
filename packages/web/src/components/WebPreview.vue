<script setup lang="ts">
import "./viewportMaximize.css";
import { useViewportMaximize } from "./useViewportMaximize.js";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { PreviewLocalOrigin, type PreviewApp, type PreviewDisplay } from "@sodashitsu/protocol";
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";

const props = defineProps<{ workspaceId: string; tabId: string; fallbackPaneId: string; active: boolean }>();
const session = useSessionStore();
const infoOpen = ref(false);
const surface = ref<HTMLElement>();
const maximized = useViewportMaximize(surface);
async function toggleMaximize() {
  maximized.value = !maximized.value;
  if (maximized.value) infoOpen.value = false;
  await nextTick();
  surface.value?.focus({preventScroll:true});
}
function maximizeKey(event: KeyboardEvent) {
  if (event.key === "Escape" && maximized.value) {
    event.preventDefault(); event.stopPropagation(); maximized.value = false;
  }
}
const sourcePane = ref("");
const controller = useViewerTabsStore();
const helperStarting = ref(false);
let helperStart: Promise<void> = Promise.resolve();
const helperConnected = ref(false), opening = ref(false);
const panes = computed(() => [...session.panes.values()].filter(p => !p.virtual && session.tabs.get(p.tabId)?.workspaceId === props.workspaceId && !session.tabs.get(p.tabId)?.nativeView));
const targetPane = computed(() => panes.value.find(p => p.id === sourcePane.value)?.id || panes.value[0]?.id || props.fallbackPaneId);
const conn = inject(ConnectionKey, null), view = useViewStore(), machines = useMachinesStore();
const allowedPane = ref<string | null>(null), viewerId = ref(""), apps = ref<PreviewApp[]>([]), displays = ref<PreviewDisplay[]>([]), selected = ref(""), error = ref(""), name = ref("web"), port = ref(5173), refresh = ref(0);
const current = computed(() => displays.value.find((d) => d.requestId === selected.value));
const helperCommand = computed(() => `sodactl ${machines.selectedId === "local" ? "" : `--machine ${machines.selectedId} `}preview helper --viewer ${viewerId.value} --url ${location.origin}`);
let dead = false, epoch = 0, busy = false, lastPoll = 0;
const acknowledged = new Set<string>();
function reset() { if (viewerId.value) void controller.stopHelper(viewerId.value).catch(() => undefined); helperStarting.value = false; epoch++; allowedPane.value = null; viewerId.value = ""; displays.value = []; selected.value = ""; acknowledged.clear(); helperConnected.value = false; }
async function enable() {
  if (!conn || !targetPane.value) return;
  const paneId = targetPane.value, version = ++epoch;
  error.value = "";
  try {
    const result = await conn.request("preview.watch", { paneId, origin: location.origin, viewId: props.tabId });
    if (version !== epoch || dead) return;
    allowedPane.value = paneId; viewerId.value = result.viewerId;
    await poll(true);
    if (!helperConnected.value && version === epoch && !dead) {
      helperStarting.value = true;
      const id = result.viewerId, machine = machines.selectedId;
      helperStart = controller.startHelper(machine, id).then(async () => {
        if (dead || version !== epoch) { await controller.stopHelper(id).catch(() => undefined); return; }
        await poll(true);
      }).catch(() => { /* Another browser PC or an older server retains the manual route. */ })
        .finally(() => { if (version === epoch) helperStarting.value = false; });
      await helperStart;
    }
  } catch (e) { if (version === epoch) error.value = e instanceof Error ? e.message : String(e); }
}
async function disable() { reset(); await conn?.request("preview.unwatch", { viewId: props.tabId }).catch(() => undefined); }
async function poll(force = false) {
  if (!conn || busy || view.connectionState !== "open") return;
  const now = Date.now();
  if (!force && now - lastPoll < (props.active ? 250 : 10_000)) return;
  lastPoll = now;
  busy = true; const version = epoch;
  try {
    const [list, result] = await Promise.all([
      conn.request("preview.list", targetPane.value ? { paneId: targetPane.value } : {}),
      allowedPane.value ? conn.request("preview.poll", { viewId: props.tabId }) : Promise.resolve(null),
    ]);
    if (dead || version !== epoch) return;
    apps.value = list.apps;
    if (!allowedPane.value || !result) return;
    helperConnected.value = result.helper === true;
    // A remote machine must not turn this into a generic URL-opening feature.
    displays.value = result.displays.filter((d) => {
      if (d.app.paneId !== allowedPane.value || !PreviewLocalOrigin.safeParse(d.origin).success) return false;
      try { const u = new URL(d.url); return u.origin === d.origin && u.pathname === "/.soda-preview/bootstrap" && !u.search && /^#[A-Za-z0-9_-]{43}$/.test(u.hash) && d.expiresAt > Date.now(); } catch { return false; }
    });
    const fresh = displays.value.filter((d) => !acknowledged.has(d.requestId));
    if (fresh.length) selected.value = fresh.at(-1)!.requestId;
    else if (!current.value) selected.value = displays.value[0]?.requestId ?? "";
    await nextTick();
    if (version !== epoch || dead) return;
    if (!props.active) return;
    for (const d of fresh) {
      acknowledged.add(d.requestId);
      // ACK means the view was offered to this UI, not that iframe contents are correct.
      await conn.request("preview.ack", { requestId: d.requestId });
    }
  } catch (e) { if (!dead && version === epoch) error.value = e instanceof Error ? e.message : String(e); }
  finally { busy = false; }
}
async function register() {
  error.value = "";
  if (!conn || !targetPane.value) return;
  try {
    if (allowedPane.value !== targetPane.value) await enable();
    if (allowedPane.value !== targetPane.value) return;
    await helperStart;
    const app = await conn.request("preview.register", { paneId: targetPane.value, name: name.value, port: Number(port.value), replace: true });
    await poll(true);
    if (helperConnected.value) await open(app);
  }
  catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
async function open(app: PreviewApp) {
  if (opening.value) return;
  error.value = ""; opening.value = true;
  try { await conn?.request("preview.open", { appId: app.id, ...(viewerId.value ? { viewerId: viewerId.value } : {}) }); }
  catch (e) { await conn?.request("preview.abort_open", { appId: app.id }).catch(() => undefined); error.value = e instanceof Error ? e.message : String(e); }
  finally { opening.value = false; }
}
async function closeDisplay() {
  if (current.value) await conn?.request("preview.close", { requestId: current.value.requestId }).catch(() => undefined);
  await poll(true);
}
watch(() => [machines.selectedId, targetPane.value, view.connectionState], () => { if (allowedPane.value) { void conn?.request("preview.unwatch", { viewId: props.tabId }).catch(() => undefined); reset(); } });
watch(() => [targetPane.value, view.connectionState], () => { if (targetPane.value && view.connectionState === "open") void enable(); }, { immediate: true });
watch(error, value => { if (value) infoOpen.value = true; });
watch(() => props.active, active => { if (active) void poll(true); else maximized.value = false; });
const timer = setInterval(() => void poll(), 250);
onBeforeUnmount(() => { dead = true; clearInterval(timer); if (allowedPane.value) void conn?.request("preview.unwatch", { viewId: props.tabId }).catch(() => undefined); reset(); });
</script>

<template>
  <section ref="surface" class="preview-window" :class="{ 'soda-viewport-maximized': maximized, 'has-app': !!current }" :popover="maximized ? 'manual' : undefined" tabindex="-1" role="region" aria-label="Webプレビュー" data-web-preview @keydown.capture="maximizeKey">
    <header><strong>Webプレビュー</strong><button v-if="current" :aria-expanded="infoOpen" @click="infoOpen = !infoOpen">情報・設定</button><button :aria-pressed="maximized" @click="toggleMaximize">{{ maximized ? "元に戻す" : "最大化" }}</button></header>
    <div v-show="!current || infoOpen" class="preview-controls">
    <label>表示元のペイン <select v-model="sourcePane" aria-label="表示元のペイン"><option value="">自動選択</option><option v-for="p in panes" :key="p.id" :value="p.id">{{ p.label || p.title || p.id.slice(0,8) }}</option></select></label>
    <div class="preview-tools">
      <template v-if="!allowedPane"><p>このpaneの開発アプリを表示します。PC側で補助プログラムを動かします。</p><button :disabled="!targetPane" @click="enable">このpaneでエージェントからの表示を許可</button></template>
      <template v-else><span>{{ helperConnected ? "ブラウザPCのhelperに接続済み" : helperStarting ? "helperを自動起動しています…" : "ブラウザPCのhelperが未接続です" }}</span><button @click="disable">許可を取り消す</button><template v-if="!helperConnected && !helperStarting"><p>このブラウザPCでhelperを自動起動できませんでした。ブラウザを使うPCで次を実行してください（ログイン済みのsodactl）。</p><code data-preview-helper-command>{{ helperCommand }}</code></template></template>
      <form @submit.prevent="register"><input v-model="name" aria-label="アプリ名" maxlength="80"><input v-model="port" aria-label="ポート" type="number" min="1" max="65535"><button :disabled="opening">{{ helperConnected ? "登録して開く" : "登録" }}</button></form>
      <div class="preview-apps"><span v-for="app in apps" :key="app.id">{{ app.name }} :{{ app.port }} <button :disabled="!allowedPane || !helperConnected || opening || app.state === 'stopped'" @click="open(app)">開く</button></span></div>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <nav v-if="displays.length"><select v-model="selected" aria-label="表示するアプリ"><option v-for="d in displays" :key="d.requestId" :value="d.requestId">{{ d.app.name }}</option></select><button @click="refresh++">更新</button><button @click="closeDisplay">表示を閉じる</button><a v-if="current" :href="current.url" target="_blank" rel="noopener noreferrer">別タブで開く</a></nav>
    <p class="preview-help">初回はこのSodashitsuサイトへの「ローカルネットワークアクセス」を許可してください。表示されない場合は別タブで開くか、ブラウザのサイト権限を確認してください。</p>
    </div>
    <iframe v-for="d in displays" v-show="d.requestId === selected" :key="d.requestId + ':' + refresh" :src="d.url" :title="d.app.name" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerpolicy="no-referrer" data-preview-frame />
    <p v-if="!current" class="preview-empty">{{ opening ? "アプリを開いています…" : helperConnected ? "ポートを指定して「登録して開く」を押すか、登録済みアプリを開いてください。" : "ブラウザPCのhelperを接続すると、登録したアプリを開けます。" }}</p>
  </section>
</template>

<style scoped>
.preview-window { position:relative; width:100%; height:100%; min-width:0; box-sizing:border-box; display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--soda-menu-border); background:var(--soda-bg); color:var(--soda-fg); box-shadow:0 8px 32px #0006; min-height:0; }
.preview-controls { min-height:0; overflow:auto; }
.has-app .preview-controls { position:absolute; top:48px; right:8px; z-index:3; width:min(640px,calc(100% - 34px)); max-height:calc(100% - 80px); overflow:auto; padding:8px; background:var(--soda-bg); border:1px solid var(--soda-menu-border); }
.preview-window.soda-viewport-maximized { padding:0; gap:0; border:0; }
.soda-viewport-maximized > header { position:absolute; top:8px; right:8px; z-index:4; max-width:calc(100% - 32px); padding:4px 8px; border-radius:4px; background:var(--soda-bg); }
.soda-viewport-maximized > iframe { position:absolute; inset:0; width:100%; height:100%; border:0; box-sizing:border-box; }
header, nav, .preview-apps, form { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
header strong { flex:1; } .preview-tools p, .preview-help { margin:4px 0; font-size:12px; } code { display:block; overflow-wrap:anywhere; user-select:all; margin:6px 0; }
iframe { flex:1; width:100%; min-height:0; border:1px solid var(--soda-menu-border); background:white; } .preview-empty { flex:1; padding:24px; } input { max-width:180px; } .preview-help { opacity:.8; }
</style>
