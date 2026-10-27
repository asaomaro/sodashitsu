<script setup lang="ts">
import {onBeforeUnmount,ref,watch} from "vue";
import {ReceivedDownloads,type ReceivedDownload} from "../desktop/receivedDownloads.js";
const props=defineProps<{enabled:boolean}>();
const keep=ref(false),entries=ref<ReceivedDownload[]>([]),notice=ref("");
const shelf=new ReceivedDownloads(next=>{entries.value=next;});
let dead=false;
watch([()=>props.enabled,keep],()=>{shelf.setActive(!dead&&props.enabled&&keep.value);notice.value="";},{flush:"sync"});
function begin(){return !dead&&props.enabled&&keep.value?shelf.begin():undefined;}
function publish(ticket:object|undefined,key:string,name:string,blob:Blob){
  if(dead||!props.enabled||!keep.value)return;
  try{shelf.add(ticket,key,name,blob);}catch{notice.value="ドラッグ用に保持できません。通常のダウンロード先を確認するか、保持中の項目を解放してください。";}
}
function drag(event:DragEvent,key:string){
  const entry=!dead&&props.enabled&&keep.value?shelf.take(key):undefined;
  if(!entry||!event.dataTransfer){event.preventDefault();return;}
  event.dataTransfer.clearData();event.dataTransfer.effectAllowed="copy";
  event.dataTransfer.setData("DownloadURL",`application/octet-stream:${entry.name}:${entry.url}`);
  notice.value="ドラッグ先で保存を確認してください。保存できない場合は「もう一度保存」を使ってください。";
}
function save(key:string){
  const entry=!dead&&props.enabled&&keep.value?shelf.take(key):undefined;if(!entry)return;
  const a=document.createElement("a");a.href=entry.url;a.download=entry.name;a.click();
  notice.value="ブラウザのダウンロードへ渡しました。保存先を確認してください。";
}
const timer=setInterval(()=>shelf.prune(),1000);
onBeforeUnmount(()=>{dead=true;clearInterval(timer);shelf.dispose();});
defineExpose({begin,publish});
</script>
<template>
  <section data-received-downloads aria-label="受信済みファイルの取り出し">
    <h4>受信済みファイルの取り出し（実験）</h4>
    <label><input v-model="keep" :disabled="!enabled" type="checkbox" />受信後、ドラッグ用にこの窓で一時保持</label>
    <p>有効にしてから受信を開始・再開したファイル・ZIPを、8件・合計100MiBまで、最後の操作から5分を期限とし、次の更新・操作時に破棄します。許可取消・切断・再読込・窓の終了でも解放します。接続先のエクスプローラー内からの直接ドラッグには対応していません。</p>
    <p>Chrome・Edge向けの実験機能です。手元のフォルダーへ一つずつドラッグしてください。実OSでの保存は未検証です。対応しない場合は通常のダウンロード、または「もう一度保存」を使ってください。</p>
    <ul>
      <li v-for="entry in entries" :key="entry.key" data-received-download>
        <a :href="entry.url" :download="entry.name" draggable="true" @dragstart="drag($event,entry.key)" @click.prevent="save(entry.key)">{{entry.name}} をドラッグ</a>
        （{{entry.bytes}} bytes）<button type="button" @click="save(entry.key)">もう一度保存</button><button type="button" @click="shelf.remove(entry.key)">解放</button>
      </li>
    </ul>
    <p v-if="notice" role="status">{{notice}}</p>
  </section>
</template>
