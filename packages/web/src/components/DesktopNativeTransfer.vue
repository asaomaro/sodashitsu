<script setup lang="ts">
import {onBeforeUnmount,ref,watch} from "vue";
import {DesktopNativeBridge} from "@sodashitsu/client-core/desktop/DesktopNativeBridge";
import {DesktopNativeHelperDescriptor} from "@sodashitsu/protocol";
import {DesktopNativeHelperRpc} from "../desktop/nativeHelperRpc.js";
import {DesktopNativeDrag} from "../desktop/nativeDrag.js";
import type {DesktopFileClient} from "../desktop/fileClient.js";
type Point={x:number;y:number;clientX:number;clientY:number};
const props=defineProps<{files:DesktopFileClient;granted:boolean;inputEnabled:boolean}>();
const emit=defineEmits<{fallback:[point:Point|undefined];handoff:[];release:[]}>();
const parentOrigin=location.origin;
const viewerId=crypto.randomUUID(),enabled=ref(false),connected=ref(false),starting=ref(false),status=ref(""),manual=ref("");
let rpc:DesktopNativeHelperRpc|undefined,bridge:DesktopNativeBridge|undefined,core:DesktopNativeDrag|undefined,abort:AbortController|undefined,version=0,dead=false,cleaning=false;
function stop(){
 if(cleaning)return;cleaning=true;++version;const oldCore=core,oldBridge=bridge,oldRpc=rpc,oldAbort=abort;core=undefined;bridge=undefined;rpc=undefined;abort=undefined;enabled.value=connected.value=starting.value=false;
 try{oldCore?.stop();oldAbort?.abort();oldBridge?.stop();if(oldRpc)void oldRpc.stop(viewerId).catch(()=>{}).finally(()=>oldRpc.close());}finally{cleaning=false;}
}
async function connect(useManual=false){
 stop();const generation=version;starting.value=true;status.value="このPCの補助プログラムを確認しています";const signal=(abort=new AbortController()).signal;
 try{
  let descriptor;
  if(useManual){const url=new URL(manual.value.trim());descriptor=DesktopNativeHelperDescriptor.parse({id:url.searchParams.get("id"),origin:url.origin,url:url.href});}
  else{rpc=new DesktopNativeHelperRpc(()=>{if(generation===version){stop();status.value="補助プログラムとの接続が終了しました";}});descriptor=await rpc.start(viewerId);}
  if(dead||generation!==version)return;
  const local=await DesktopNativeBridge.connect(descriptor,{signal,event:value=>core?.event(value),closed:()=>{if(generation===version){stop();status.value="補助プログラムとの接続が終了しました";}}});
  if(dead||generation!==version){local.stop();return;}bridge=local;connected.value=enabled.value=true;
  core=new DesktopNativeDrag({files:props.files,origin:location.origin,send:value=>local.send(value),valid:fresh=>!dead&&connected.value&&enabled.value&&props.granted&&(!fresh||props.inputEnabled),fallback:point=>emit("fallback",point),handoff:()=>emit("handoff"),release:()=>emit("release"),status:value=>{status.value=value;}});status.value="Explorerへの直接ドラッグが有効です";
 }catch{if(generation===version){stop();status.value="このPCの補助プログラムを確認できません。手動で起動する場合は下の接続先を使ってください";}}
 finally{if(generation===version)starting.value=false;}
}
watch(enabled,value=>{if(!value)core?.cancel();});watch(()=>props.granted,value=>{if(!value)core?.cancel();});watch(()=>props.inputEnabled,value=>{if(!value)core?.interrupt();});watch(()=>props.files,()=>stop());
onBeforeUnmount(()=>{dead=true;stop();});
defineExpose({begin:(point:Point)=>core?.begin(point)??false,pointer:(point:Point,event:"move"|"down"|"up",buttons:number)=>core?.pointer(point,event,buttons)??false,sent:(seq:number)=>core?.sent(seq),ack:(seq:number)=>core?.ack(seq),interrupt:()=>core?.interrupt(),stop});
</script>
<template>
 <details data-native-desktop-transfer>
  <summary>Explorerへの直接ドラッグ</summary>
  <p>ファイル転送を許可し、このPCの補助プログラムを準備してください。共有元のExplorerで選択したファイルを、このPCのExplorerへドラッグしてコピーできます。</p>
  <button :disabled="!granted||starting" @click="connect(false)">このPCで直接ドラッグを準備</button>
  <button :disabled="!connected&&!starting" @click="stop">補助プログラムを停止</button>
  <label><input v-model="enabled" type="checkbox" :disabled="!connected||!granted" />直接ドラッグを有効にする</label>
  <output role="status">{{status}}</output>
  <details><summary>補助プログラムを手動で起動する</summary>
   <p>ブラウザPCで次を実行し、表示されたURLを入力してください。</p>
   <code>sodactl desktop native-helper --origin {{parentOrigin}}</code>
   <label>補助プログラムのURL <input v-model="manual" data-native-helper-url /></label><button :disabled="!granted||starting||!manual" @click="connect(true)">手動の補助プログラムへ接続</button>
  </details>
 </details>
</template>
