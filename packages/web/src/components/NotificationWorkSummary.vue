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
 if(!conn||reading||!settings.summaryConfigured||settings.summarySettings.notificationSummary===false)return;
 reading=true;
 if(refresh)state.value={status:"summarizing",text:"",message:"要約を更新しています。"};
 try{
  const value=await conn.request("notification.summary",{paneId:props.paneId,key:props.noticeKey,refresh,expectedSettings:{kind:settings.summarySettings.kind,model:settings.summarySettings.model,effort:settings.summarySettings.effort??"",notificationSummary:true}});
  if(own!==epoch)return;state.value=value;
  if(value.status==="waiting"||value.status==="summarizing")timer=setTimeout(()=>{timer=undefined;void read();},2000);
 }catch{if(own===epoch)state.value={status:"error",text:"",message:"要約を取得できません。通知が解消されたか、接続を確認してください。"};}finally{if(own===epoch)reading=false;}
}
watch(()=>[props.paneId,props.noticeKey,machines.selectedId,settings.summaryConfigured,settings.summarySettings.kind,settings.summarySettings.model,settings.summarySettings.effort,settings.summarySettings.notificationSummary],()=>{reset();void read();},{immediate:true});
onBeforeUnmount(reset);
</script>
<template>
 <p v-if="conn && settings.summaryConfigured && settings.summarySettings.notificationSummary !== false && state?.status === 'ready' && state.headline" class="notification-headline" @click.stop>{{ state.headline }}</p>
</template>
<style scoped>
.notification-headline{margin:.3em 0;white-space:normal;overflow-wrap:anywhere;font-size:.95em}
</style>
