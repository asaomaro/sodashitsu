<script setup lang="ts">
import {inject,ref,watch,onBeforeUnmount} from 'vue';
import type {AssistantSettingsResult} from '@sodashitsu/protocol';
import {ConnectionKey} from '../injection.js';
const props=withDefaults(defineProps<{active?:boolean}>(),{active:true});
const connection=inject(ConnectionKey),state=ref<AssistantSettingsResult>(),busy=ref(false),message=ref('');
let generation=0,writeVersion=0,timer:ReturnType<typeof setTimeout>|undefined;
const labels={disabled:'無効',preparing:'初回準備中',starting:'起動中',running:'起動済み',stopping:'停止中',error:'準備・起動を確認してください'};
function schedule(current:number){clearTimeout(timer);if(current!==generation||!props.active)return;timer=setTimeout(()=>void load(current),2000);}
async function load(current:number){if(busy.value){schedule(current);return;}const version=writeVersion;try{const result=await connection!.request('assistant.settings.get',{});if(current===generation&&version===writeVersion)state.value=result;}catch{if(current===generation)message.value='アシスタントの設定を取得できません。';}finally{schedule(current);}}
watch(()=>props.active,active=>{const current=++generation;clearTimeout(timer);state.value=undefined;busy.value=false;message.value='';++writeVersion;if(active)void load(current);},{immediate:true});
onBeforeUnmount(()=>{++generation;clearTimeout(timer);});
async function setEnabled(enabled:boolean){if(busy.value||!state.value?.canConfigure)return;busy.value=true;++writeVersion;const current=generation;try{const result=await connection!.request('assistant.settings.set',{enabled});if(current===generation){state.value=result;message.value=enabled?'有効にしました。準備・起動状況を確認しています。':'無効にしました。準備中の処理とアシスタントを停止します。';}}catch{if(current===generation)message.value='保存できません。このPCのlocalhost画面から設定してください。';}finally{if(current===generation)busy.value=false;}}
</script>
<template>
 <section class="settings-section" aria-labelledby="settings-assistant">
  <h3 class="settings-heading" id="settings-assistant">デスクトップアシスタント</h3>
  <p>デスクトップの船長キャラクターや通知領域から、通知への返答・吹き出しチャットを利用できます。専用アプリの手動導入は不要です。</p>
  <p>初回は共通ランタイムをダウンロードします。Windows・WSLではWindowsのデスクトップに表示します。無効時はアシスタントの常駐プロセスを起動しません。</p>
  <label><input type="checkbox" :checked="state?.enabled" :disabled="busy||!state?.canConfigure" @change="setEnabled(($event.target as HTMLInputElement).checked)" />デスクトップアシスタントを有効にする</label>
  <button v-if="state?.enabled&&state.phase==='error'" type="button" :disabled="busy||!state.canConfigure" @click="setEnabled(true)">準備・起動を再試行</button>
  <p v-if="state">状態：{{labels[state.phase]}}</p><p v-if="state?.message" role="status">{{state.message}}</p>
  <p v-if="state&&!state.canConfigure">有効・無効の変更は、このPCのlocalhost画面または端末版で行ってください。</p>
  <p>起動後、キャラクターまたは通知領域のメニューから表示方法・モデル・effortなどを設定できます。操舵室へのログイン後、専用エージェントを選んで開始してください。</p>
  <p v-if="message" role="status">{{message}}</p>
 </section>
</template>
