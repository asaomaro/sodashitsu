<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { PreviewLocalOrigin, type PreviewApp, type PreviewDisplay } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";

const conn = inject(ConnectionKey, null), view = useViewStore(), machines = useMachinesStore();
const shown = ref(false), allowedPane = ref<string | null>(null), viewerId = ref(""), apps = ref<PreviewApp[]>([]), displays = ref<PreviewDisplay[]>([]), selected = ref(""), error = ref(""), name = ref("web"), port = ref(5173), refresh = ref(0);
const current = computed(() => displays.value.find((d) => d.requestId === selected.value));
const helperCommand = computed(() => `sodactl ${machines.selectedId === "local" ? "" : `--machine ${machines.selectedId} `}preview helper --viewer ${viewerId.value} --url ${location.origin}`);
let dead = false, epoch = 0, busy = false;
const acknowledged = new Set<string>();
function reset() { epoch++; allowedPane.value = null; viewerId.value = ""; displays.value = []; selected.value = ""; acknowledged.clear(); }
async function enable() {
  if (!conn || !view.focusedPaneId) return;
  const paneId = view.focusedPaneId, version = ++epoch;
  error.value = "";
  try {
    const result = await conn.request("preview.watch", { paneId, origin: location.origin });
    if (version !== epoch || dead) return;
    allowedPane.value = paneId; viewerId.value = result.viewerId;
    await poll();
  } catch (e) { if (version === epoch) error.value = e instanceof Error ? e.message : String(e); }
}
async function disable() { reset(); await conn?.request("preview.unwatch", {}).catch(() => undefined); }
async function poll() {
  if (!conn || busy || !shown.value || view.connectionState !== "open") return;
  busy = true; const version = epoch;
  try {
    const list = await conn.request("preview.list", view.focusedPaneId ? { paneId: view.focusedPaneId } : {});
    if (dead || version !== epoch) return;
    apps.value = list.apps;
    if (!allowedPane.value) return;
    const result = await conn.request("preview.poll", {});
    if (dead || version !== epoch) return;
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
    for (const d of fresh) {
      acknowledged.add(d.requestId);
      // ACK means the view was offered to this UI, not that iframe contents are correct.
      await conn.request("preview.ack", { requestId: d.requestId });
    }
  } catch (e) { if (!dead && version === epoch) error.value = e instanceof Error ? e.message : String(e); }
  finally { busy = false; }
}
async function register() {
  if (!conn || !view.focusedPaneId) return;
  try { await conn.request("preview.register", { paneId: view.focusedPaneId, name: name.value, port: Number(port.value), replace: true }); await poll(); }
  catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
async function open(app: PreviewApp) {
  error.value = "";
  try { await conn?.request("preview.open", { appId: app.id, ...(viewerId.value ? { viewerId: viewerId.value } : {}) }); }
  catch (e) { await conn?.request("preview.abort_open", { appId: app.id }).catch(() => undefined); error.value = e instanceof Error ? e.message : String(e); }
}
async function closeDisplay() {
  if (current.value) await conn?.request("preview.close", { requestId: current.value.requestId }).catch(() => undefined);
  await poll();
}
watch(() => [machines.selectedId, view.focusedPaneId, view.connectionState], () => { if (allowedPane.value) { void conn?.request("preview.unwatch", {}).catch(() => undefined); reset(); } });
watch(shown, (value) => { if (value) void poll(); else void disable(); });
const timer = setInterval(() => void poll(), 750);
onBeforeUnmount(() => { dead = true; clearInterval(timer); if (allowedPane.value) void conn?.request("preview.unwatch", {}).catch(() => undefined); reset(); });
</script>

<template>
  <button class="preview-launch" data-web-preview-toggle @click="shown = !shown">Webプレビュー</button>
  <section v-if="shown" class="preview-window" role="dialog" aria-label="Webプレビュー" data-web-preview>
    <header><strong>Webプレビュー</strong><button @click="shown = false">閉じる</button></header>
    <div class="preview-tools">
      <template v-if="!allowedPane"><p>このpaneの開発アプリを表示します。PC側で補助プログラムを動かします。</p><button :disabled="!view.focusedPaneId" @click="enable">このpaneでエージェントからの表示を許可</button></template>
      <template v-else><span>このpaneの表示要求を受付中</span><button @click="disable">許可を取り消す</button><p>ブラウザを使うPCで次を実行してください（ログイン済みのsodactl）。</p><code data-preview-helper-command>{{ helperCommand }}</code></template>
      <form @submit.prevent="register"><input v-model="name" aria-label="アプリ名" maxlength="80"><input v-model="port" aria-label="ポート" type="number" min="1" max="65535"><button>登録</button></form>
      <div class="preview-apps"><span v-for="app in apps" :key="app.id">{{ app.name }} :{{ app.port }} <button :disabled="!allowedPane || app.state === 'stopped'" @click="open(app)">開く</button></span></div>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <nav v-if="displays.length"><select v-model="selected" aria-label="表示するアプリ"><option v-for="d in displays" :key="d.requestId" :value="d.requestId">{{ d.app.name }}</option></select><button @click="refresh++">更新</button><button @click="closeDisplay">表示を閉じる</button><a v-if="current" :href="current.url" target="_blank" rel="noopener noreferrer">別タブで開く</a></nav>
    <p class="preview-help">初回はこのSodashitsuサイトへの「ローカルネットワークアクセス」を許可してください。表示されない場合は別タブで開くか、ブラウザのサイト権限を確認してください。</p>
    <iframe v-for="d in displays" v-show="d.requestId === selected" :key="d.requestId + ':' + refresh" :src="d.url" :title="d.app.name" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerpolicy="no-referrer" data-preview-frame />
    <p v-if="!current" class="preview-empty">登録したアプリを選ぶか、エージェントからの表示要求を待ちます。</p>
  </section>
</template>

<style scoped>
.preview-launch { position:fixed; right:16px; bottom:30px; z-index:35; }
.preview-window { position:fixed; inset:8% 4% 6% 16%; z-index:150; display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--soda-menu-border); background:var(--soda-bg); color:var(--soda-fg); box-shadow:0 8px 32px #0006; min-height:0; }
header, nav, .preview-apps, form { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
header strong { flex:1; } .preview-tools { max-height:35%; overflow:auto; } .preview-tools p, .preview-help { margin:4px 0; font-size:12px; } code { display:block; overflow-wrap:anywhere; user-select:all; margin:6px 0; }
iframe { flex:1; width:100%; min-height:0; border:1px solid var(--soda-menu-border); background:white; } .preview-empty { flex:1; padding:24px; } input { max-width:180px; } .preview-help { opacity:.8; }
</style>
