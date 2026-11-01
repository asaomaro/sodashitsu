<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import type { ResourceMonitorSnapshot,ResourceProcess } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
const conn=inject(ConnectionKey),data=ref<ResourceMonitorSnapshot|null>(null),error=ref(""),busy=ref(false),paused=ref(false);
const search=ref(""),group=ref("all"),sort=ref<"cpu"|"memory"|"name">("memory");
const history=ref<{cpu:number|null;memory:number}[]>([]);
const groups:Record<ResourceProcess["group"],string>={server:"操舵室本体",agent:"エージェント",terminal:"端末",service:"関連プロセス",app:"デスクトップアプリ"};
const rows=computed(()=>{
 const query=search.value.trim().toLocaleLowerCase();
 return (data.value?.processes??[]).filter(p=>(group.value==="all"||group.value===p.group)&&(!query||`${p.name} ${p.label} ${p.pid} ${p.platform}`.toLocaleLowerCase().includes(query))).slice().sort((a,b)=>sort.value==="name"?a.name.localeCompare(b.name,"ja"):sort.value==="cpu"?(b.cpuPercent??-1)-(a.cpuPercent??-1):(b.rssBytes??-1)-(a.rssBytes??-1));
});
const totals=computed(()=>{
 const processes=data.value?.processes??[],cpu=processes.filter(p=>p.cpuPercent!==null),memory=processes.filter(p=>p.rssBytes!==null);
 return {count:processes.length,cpuCount:cpu.length,memoryCount:memory.length,
  cpu:cpu.length?cpu.reduce((sum,p)=>sum+p.cpuPercent!,0):null,
  rss:memory.length?memory.reduce((sum,p)=>sum+p.rssBytes!,0):null};
});
const appCount=computed(()=>new Set(data.value?.processes.filter(p=>p.group==="app").map(p=>p.source)).size);
const memoryPercent=computed(()=>{const s=data.value?.system;return s&&s.memoryTotalBytes?100*(s.memoryTotalBytes-s.memoryAvailableBytes)/s.memoryTotalBytes:0;});
function bytes(value:number|null|undefined){if(value==null)return "—";if(value>=1024**3)return `${(value/1024**3).toFixed(2)} GiB`;return `${(value/1024**2).toFixed(1)} MiB`;}
function percent(value:number|null|undefined){return value==null?"—":`${value.toFixed(1)}%`;}
function line(key:"cpu"|"memory"){return history.value.map((sample,index)=>sample[key]==null?"":`${index*300/59},${58-Math.min(100,sample[key]!)*.54}`).filter(Boolean).join(" ");}
let timer:ReturnType<typeof setInterval>|undefined,dead=false;
async function refresh(manual=false){
 if(dead||busy.value||document.hidden||(!manual&&paused.value))return;
 busy.value=true;
 try{
  if(!conn)throw Error("接続がありません");
  const next=await conn.request("server.resource_monitor",{});
  if(dead)return;
  const changed=next.sampledAt!==data.value?.sampledAt;data.value=next;error.value="";
  if(changed)history.value=[...history.value,{cpu:next.system.cpuPercent,memory:memoryPercent.value}].slice(-60);
 }catch{if(!dead)error.value="リソース情報を取得できません。接続先とサーバの対応状況を確認してください。";}
 finally{if(!dead)busy.value=false;}
}
function visibility(){if(!document.hidden)void refresh();}
onMounted(()=>{void refresh();timer=setInterval(()=>{void refresh();},3000);document.addEventListener("visibilitychange",visibility);});
onBeforeUnmount(()=>{dead=true;clearInterval(timer);document.removeEventListener("visibilitychange",visibility);});
</script>
<template>
 <section class="resource-monitor" aria-label="リソースモニター">
  <header><div><h1>リソースモニター</h1><p>操舵室と作業中のプロセスの使用量</p></div><div class="resource-actions"><button @click="paused=!paused">{{paused?'自動更新を再開':'自動更新を一時停止'}}</button><button :disabled="busy" @click="refresh(true)">更新</button></div></header>
  <p v-if="error" role="alert" class="resource-error">{{error}}<span v-if="data"> 最後に取得した情報を表示しています。</span></p>
  <template v-if="data">
   <p class="resource-meta">{{data.system.hostname}} · {{data.system.cpuCount}} CPU · {{new Date(data.sampledAt).toLocaleTimeString()}} 更新 · {{paused?'一時停止中':'3秒ごとに更新'}}</p>
   <div class="resource-cards" aria-label="操舵室関連プロセスの合計">
    <article data-resource-total="cpu"><span>操舵室関連 CPU 合計</span><strong>{{percent(totals.cpu)}}</strong><small>取得済み {{totals.cpuCount}} / {{totals.count}} プロセス · 1コアを100%</small></article>
    <article data-resource-total="memory"><span>操舵室関連 メモリ合計 (RSS)</span><strong>{{bytes(totals.rss)}}</strong><small>取得済み {{totals.memoryCount}} / {{totals.count}} プロセス · 共有ページの重複を含む</small></article>
    <article><span>監視対象</span><strong>{{totals.count}} <small>プロセス</small></strong><small>デスクトップアプリ {{appCount}} 台を含む · 絞り込み前の全対象</small></article>
   </div>
   <div class="resource-cards resource-host-cards" aria-label="接続先ホスト全体の使用量">
    <article><span>ホスト CPU</span><strong>{{percent(data.system.cpuPercent)}}</strong><svg viewBox="0 0 300 60" aria-label="CPU使用率の推移"><polyline :points="line('cpu')" /></svg></article>
    <article><span>ホスト メモリ</span><strong>{{percent(memoryPercent)}}</strong><small>{{bytes(data.system.memoryTotalBytes-data.system.memoryAvailableBytes)}} / {{bytes(data.system.memoryTotalBytes)}}</small><svg viewBox="0 0 300 60" aria-label="メモリ使用率の推移"><polyline :points="line('memory')" /></svg></article>
   </div>
   <p v-for="warning in data.warnings" :key="warning" role="status" class="resource-error">{{warning}}</p>
   <div class="resource-filters"><label>検索<input v-model="search" type="search" placeholder="名前・PID・OS"></label><label>対象<select v-model="group" aria-label="対象"><option value="all">すべて</option><option v-for="(label,key) in groups" :key="key" :value="key">{{label}}</option></select></label><label>並べ替え<select v-model="sort" aria-label="並べ替え"><option value="memory">メモリの多い順</option><option value="cpu">CPUの多い順</option><option value="name">プロセス名順</option></select></label><span>{{rows.length}} 件</span></div>
   <div class="resource-table"><table><thead><tr><th>プロセス</th><th>対象・作業</th><th>OS / 接続元</th><th>PID</th><th class="numeric">CPU</th><th class="numeric">メモリ (RSS)</th><th class="numeric">スレッド</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td><strong>{{row.name}}</strong></td><td><span class="resource-badge">{{groups[row.group]}}</span><span>{{row.label}}</span><small v-if="row.paneId">pane {{row.paneId.slice(0,8)}}</small></td><td>{{row.platform}}<small>{{row.source==='server'?data.system.hostname:`アプリ ${row.source.slice(4,12)}`}}</small></td><td>{{row.pid}}</td><td class="numeric">{{percent(row.cpuPercent)}}</td><td class="numeric">{{bytes(row.rssBytes)}}</td><td class="numeric">{{row.threads??'—'}}</td></tr><tr v-if="!rows.length"><td colspan="7">表示するプロセスがありません。</td></tr></tbody></table></div>
   <p class="resource-note">CPUはプロセス単位では1コアを100%として表示します。初回や取得できない値は「—」です。ホストの数値は接続先サーバのOSが対象です。操舵室関連の合計は、一覧の全対象（別OSのデスクトップアプリを含む）を集計します。検索・絞り込みでは変わりません。取得できない値は合計から除き、取得済み件数を表示します。CPU合計は複数コア分で100%を超える場合があります。デスクトップアプリの値は接続している対応アプリから報告されます。画面を閉じると定期収集を止めます。</p>
  </template>
  <p v-else-if="!error" role="status">リソース情報を取得しています…</p>
 </section>
</template>
<style scoped>
.resource-monitor{height:100%;min-height:0;overflow:auto;padding:24px;color:var(--soda-fg);background:var(--soda-bg);box-sizing:border-box}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}h1{font-size:22px;margin:0}header p,.resource-meta,.resource-note{opacity:.75;font-size:13px;line-height:1.7}header p{margin:4px 0}.resource-actions{display:flex;gap:8px;flex-wrap:wrap}button,input,select{font:inherit;color:inherit;background:var(--soda-menu-bg);border:1px solid var(--soda-menu-border);border-radius:7px;padding:7px 10px}button{cursor:pointer}button:disabled{opacity:.5}.resource-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:18px 0}.resource-host-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.resource-cards article{position:relative;overflow:hidden;min-height:140px;padding:18px;border:1px solid var(--soda-menu-border);background:var(--soda-menu-bg);border-radius:12px;display:flex;flex-direction:column;gap:10px}.resource-cards article>span{font-size:12px;opacity:.8}.resource-cards strong{font-size:29px;letter-spacing:-1px;z-index:1}.resource-cards small{font-size:12px;opacity:.75}.resource-cards svg{position:absolute;bottom:0;left:0;width:100%;height:52px;opacity:.6}.resource-cards polyline{stroke:#2bd1b8;fill:none;stroke-width:2}.resource-filters{display:flex;gap:16px;align-items:end;flex-wrap:wrap;margin:22px 0 14px}.resource-filters label{display:flex;flex-direction:column;gap:5px;font-size:12px}.resource-filters span{font-size:12px;opacity:.7;margin-left:auto}.resource-table{overflow-x:auto;border:1px solid var(--soda-menu-border);border-radius:10px}table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}th{text-align:left;background:var(--soda-menu-bg);font-weight:500;opacity:.85}th,td{padding:12px 14px;border-bottom:1px solid var(--soda-menu-border)}tbody tr:last-child td{border-bottom:0}td small{display:block;opacity:.6;font-size:11px;margin-top:4px}td>span{display:block}.numeric{text-align:right;font-variant-numeric:tabular-nums}.resource-badge{font-size:10px;color:#2bd1b8;margin-bottom:4px}.resource-error{padding:10px;border:1px solid #c9a64f;color:#e3c77f;border-radius:7px}.resource-note{max-width:1000px;margin-top:18px}
@media(max-width:1100px){.resource-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.resource-monitor{padding:14px}.resource-cards{gap:8px}.resource-cards article{padding:12px;min-height:120px}.resource-cards strong{font-size:23px}.resource-actions button{font-size:12px}.resource-filters{gap:8px}.resource-filters input{max-width:150px}}
</style>
