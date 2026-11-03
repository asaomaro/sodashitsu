<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from "vue";
import { ConnectionKey, ViewSyncKey } from "../injection.js";
import { paneNameOf } from "@sodashitsu/client-core";
import { assistantPanelTarget, assistantPanelPane } from "../actions/assistantPanelLink.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { useAskStore } from "../store/ask.js";
import PaneLayout from "./PaneLayout.vue";
import TerminalPane from "./TerminalPane.vue";
import AskDialog from "./AskDialog.vue";
import Toast from "./Toast.vue";
import ReconnectOverlay from "./ReconnectOverlay.vue";

const session = useSessionStore();
const view = useViewStore();
const asks = useAskStore();
const target = (() => { try { return assistantPanelTarget(location.hash); } catch { return null; } })();
const source = computed(() => {
  if (!target) return null;
  try { return assistantPanelPane(target, session.panes, session.tabs); } catch { return null; }
});
const label = computed(() => source.value ? paneNameOf(source.value.pane) : "通知への応答");
const questionFinished = computed(() => !!target?.assistantAsk && !asks.queue.some(a => a.askId === target.assistantAsk));
// A deliberately opened reply terminal owns its size from the first view, before subscribe/input.
const conn=inject(ConnectionKey,undefined),viewSync=inject(ViewSyncKey,undefined);
let fitted=false;
const stopFit=target&&!target.assistantAsk&&conn&&viewSync?viewSync.onViewEstablished(()=>{
  if(!source.value)return;
  fitted=true;void conn.request("client.fit",{enabled:true}).catch(()=>view.toast("端末をウィンドウに合わせられませんでした。開き直してください。"));
},true):undefined;
onBeforeUnmount(()=>{stopFit?.();if(fitted&&conn)void conn.request("client.fit",{enabled:false}).catch(()=>undefined);});

</script>

<template>
  <main class="assistant-response" data-assistant-response>
    <header><strong>{{ label }}</strong><span>{{ source ? session.workspaces.get(source.tab.workspaceId)?.label : '' }}</span></header>
    <p v-if="target?.assistantAsk && questionFinished" role="status">この質問は終了したか、対応済みです。この窓を閉じられます。</p>
    <div v-else-if="source && !target?.assistantAsk && view.connectionState === 'open'" class="assistant-response-terminal">
      <PaneLayout :workspace-id="source.tab.workspaceId" :tab-id="source.tab.id" :layout="{ type: 'pane', paneId: source.pane.id }" follow-resize>
        <template #pane="{ paneId }"><TerminalPane :pane-id="paneId" /></template>
      </PaneLayout>
    </div>
    <AskDialog />
    <Teleport to="#soda-ask-dialog" :disabled="!view.askOpen" defer><Toast /><ReconnectOverlay /></Teleport>
  </main>
</template>

<style scoped>
.assistant-response{display:flex;flex-direction:column;height:100dvh;min-width:0;overflow:hidden;background:#172438;color:#edf3fa;color-scheme:dark}
.assistant-response header{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;border-bottom:2px solid #c9a64f;flex:0 0 auto;overflow-wrap:anywhere}
.assistant-response header span{color:#aebfd2;font-size:13px}
.assistant-response-terminal{flex:1;min-height:0;position:relative}
.assistant-response>p{padding:16px}
</style>
