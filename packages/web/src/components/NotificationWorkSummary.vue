<script setup lang="ts">
import {inject,onBeforeUnmount,ref,watch} from "vue";
import {type NotificationWorkSummary} from "@sodashitsu/protocol";
import {ConnectionKey} from "../injection.js";
import {useSettingsStore} from "../store/settings.js";
import {useMachinesStore} from "../store/machines.js";
const props=defineProps<{paneId:string;noticeKey:string}>();
const conn=inject(ConnectionKey,null),settings=useSettingsStore(),machines=useMachinesStore();
const state=ref<NotificationWorkSummary|null>(null);
let epoch=0,reading=false,timer:ReturnType<typeof setTimeout>|undefined;
function reset(){++epoch;reading=false;if(timer)clearTimeout(timer);timer=undefined;state.value=null;}
async function read(refresh=false){
 const own=epoch;
 if(!conn||reading||settings.summarySettings.notificationSummary===false)return;
 reading=true;
 if(refresh)state.value={status:"summarizing",text:"",message:"要約を更新しています。"};
 try{
  const value=await conn.request("notification.summary",{paneId:props.paneId,key:props.noticeKey,refresh});
  if(own!==epoch)return;state.value=value;
  if(value.status==="waiting"||value.status==="summarizing")timer=setTimeout(()=>{timer=undefined;void read();},2000);
 }catch{if(own===epoch)state.value={status:"error",text:"",message:"要約を取得できません。通知が解消されたか、接続を確認してください。"};}finally{if(own===epoch)reading=false;}
}
watch(()=>[props.paneId,props.noticeKey,machines.selectedId,settings.summarySettings.kind,settings.summarySettings.model,settings.summarySettings.notificationSummary],()=>{reset();void read();},{immediate:true});
onBeforeUnmount(reset);
</script>
<template>
 <section v-if="conn && settings.summarySettings.notificationSummary !== false && state?.status !== 'disabled'" class="notification-work-summary" @click.stop>
  <strong>作業要約・判断事項</strong>
  <p class="summary-status">{{ state?.message ?? '作業要約を確認しています。' }}</p>
  <p v-if="state?.status==='ready'" class="summary-text">{{ state.text }}</p>
  <button data-assistant-action type="button" :disabled="state?.status==='waiting'||state?.status==='summarizing'" @click="read(true)">要約を再試行</button>
 </section>
</template>
<style scoped>
.notification-work-summary{margin-top:.6em;padding:.6em;border:1px solid var(--soda-menu-border);border-radius:8px;white-space:normal;overflow-wrap:anywhere;font-size:.9em}
.summary-text{white-space:pre-wrap;margin:.5em 0}.summary-status{font-size:.9em;margin:.3em 0}
</style>
