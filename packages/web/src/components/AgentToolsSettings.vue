<script setup lang="ts">
import {
  AGENT_HEADER_ACTIONS,
  HEADER_ACTION_LABELS,
  SummarySettingsSchema,
  type AgentHeaderAction,
} from "@sodashitsu/protocol";
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import type { AssistantModelCatalog } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useMachinesStore } from "../store/machines.js";
import { useSettingsStore } from "../store/settings.js";
const settings=useSettingsStore(),machines=useMachinesStore(),conn=inject(ConnectionKey,null),error=ref("");
const loading=ref(false),catalogMessage=ref(""),rows=ref<AssistantModelCatalog["models"]>([]);
const catalogs=new Map<string,AssistantModelCatalog>(),profiles=new Map<string,{model:string;effort:string}>();
let epoch=0;
const profileKey=(kind:string)=>JSON.stringify([machines.selectedId,kind]);
function visibility(action: AgentHeaderAction,event: Event){settings.setAgentActionSettings({...settings.agentActionSettings,[action]:(event.target as HTMLSelectElement).value as "display"|"menu"|"hidden"});}
function save(patch:Record<string,unknown>){
 const parsed=SummarySettingsSchema.safeParse({...settings.summarySettings,...patch,sessionId:""});
 if(!parsed.success){error.value="種類・モデル・effortの組み合わせを確認してください。";return;}
 settings.setSummarySettings(parsed.data);profiles.set(profileKey(parsed.data.kind),{model:parsed.data.model,effort:parsed.data.effort??""});error.value="";
}
const modelOptions=computed(()=>{
 const options=[{id:"",label:"エージェントの既定値"},...rows.value];
 const saved=settings.summarySettings.model;if(saved&&!options.some(row=>row.id===saved))options.push({id:saved,label:`保存済み：${saved}`});
 return options;
});
const effortOptions=computed(()=>{
 const config=settings.summarySettings,model=rows.value.find(row=>row.id===config.model),tiers=model?.efforts??[];
 const options=[{id:"",label:"エージェントの既定値"},...tiers.filter(Boolean).map(id=>({id,label:id}))];
 if(!model&&config.effort&&!options.some(row=>row.id===config.effort))options.push({id:config.effort,label:`保存済み：${config.effort}`});
 return options;
});
async function loadModels(force=false){
 if(!settings.summaryConfigured){++epoch;loading.value=false;rows.value=[];catalogMessage.value="未設定の場合は従来のシンプルな通知を使います。";return;}
 const own=++epoch,kind=settings.summarySettings.kind,machine=machines.selectedId,key=JSON.stringify([machine,kind]);
 loading.value=true;rows.value=[];catalogMessage.value="モデル候補を読み込んでいます。";
 if(force)catalogs.delete(key);
 let catalog:AssistantModelCatalog;
 try{
  catalog=catalogs.get(key)??await conn!.request("agent.model_options",{kind});
  if(own!==epoch||kind!==settings.summarySettings.kind||machine!==machines.selectedId)return;
  if(catalog.models.length)catalogs.set(key,catalog);
 }catch{catalog={models:[],message:"モデル候補を取得できません。既定値または保存済みの指定を選べます。"};}
 if(own!==epoch||kind!==settings.summarySettings.kind||machine!==machines.selectedId)return;
 rows.value=catalog.models;catalogMessage.value=catalog.message;loading.value=false;
 const config=settings.summarySettings,model=rows.value.find(row=>row.id===config.model);
 if(model&&config.effort&&!model.efforts.includes(config.effort))save({effort:""});
}
function changeKind(event:Event){
 const old=settings.summarySettings;if(settings.summaryConfigured)profiles.set(profileKey(old.kind),{model:old.model,effort:old.effort??""});
 const kind=(event.target as HTMLSelectElement).value;if(!kind){settings.clearSummarySettings();return;}const profile=profiles.get(profileKey(kind))??{model:"",effort:""};save({kind,...profile});
}
function changeModel(event:Event){save({model:(event.target as HTMLSelectElement).value,effort:""});}
watch(()=>[settings.summarySettings.kind,machines.selectedId,settings.summaryConfigured],()=>void loadModels(),{immediate:true});
onBeforeUnmount(()=>{++epoch;});
</script>
<template>
  <section class="settings-section" aria-labelledby="settings-agent-tools">
    <h3 id="settings-agent-tools" class="settings-heading">ペインのエージェント操作</h3>
    <p>
      表示はヘッダーとメニュー、メニューに表示はメニューだけに出します。対応しないエージェントでは表示されません。
    </p>
    <div class="agent-tool-options">
      <label v-for="action in AGENT_HEADER_ACTIONS" :key="action">
        {{ HEADER_ACTION_LABELS[action] }}
        <select
          :aria-label="HEADER_ACTION_LABELS[action] + 'の表示'"
          :value="settings.agentActionSettings[action]"
          @change="visibility(action, $event)"
        >
          <option value="display">表示</option>
          <option value="menu">メニューに表示</option>
          <option value="hidden">非表示</option>
        </select>
      </label>
    </div>
    <h4>会話・通知の作業要約</h4>
    <label>種類
      <select aria-label="要約エージェントの種類" :value="settings.summaryConfigured?settings.summarySettings.kind:''" @change="changeKind"><option value="">未設定（従来の通知）</option>
        <option value="claude">Claude Code</option><option value="codex">Codex</option><option value="muse">Muse Code</option><option value="agy">Antigravity CLI</option><option value="copilot">GitHub Copilot CLI</option><option value="grok">Grok Build</option><option value="cursor">Cursor CLI</option>
      </select>
    </label>
    <label>モデル
      <select aria-label="要約エージェントのモデル" :value="settings.summarySettings.model" :disabled="loading||!settings.summaryConfigured" @change="changeModel">
        <option v-for="row in modelOptions" :key="row.id" :value="row.id">{{row.label}}</option>
      </select>
    </label>
    <label>effort
      <select aria-label="要約エージェントのeffort" :value="settings.summarySettings.effort??''" :disabled="loading||!settings.summaryConfigured" @change="save({effort:($event.target as HTMLSelectElement).value})">
        <option v-for="row in effortOptions" :key="row.id" :value="row.id">{{row.label}}</option>
      </select>
    </label>
    <p role="status">{{catalogMessage}}</p>
    <button data-assistant-action type="button" :disabled="loading||!settings.summaryConfigured" @click="loadModels(true)">モデル候補を再取得</button>
    <label><input type="checkbox" :disabled="!settings.summaryConfigured" :checked="settings.summaryConfigured&&settings.summarySettings.notificationSummary !== false" @change="settings.setSummarySettings({...settings.summarySettings,notificationSummary:($event.target as HTMLInputElement).checked})">通知に作業要約・判断事項・返信案を表示</label>
    <p>操舵室とデスクトップアシスタントで同じ通知要約を共有します。船長とは別の専用セッションで処理し、船長の割り当ては不要です。</p>
    <label
      ><input
        type="checkbox"
        :disabled="!settings.summaryConfigured" :checked="settings.summarySettings.autoUpdate === true"
        @change="
          settings.setSummarySettings({
            ...settings.summarySettings,
            autoUpdate: ($event.target as HTMLInputElement).checked,
            sessionId: '',
          })
        "
      />ターン終了後に要約を自動更新</label
    >
    <p>
      要約は会話ごとに保存します。更新は前回の要約と追加分から行い、作業中の会話には送信しません。要約用セッションは自動管理します。自動更新を有効にするとモデルの利用が増えます。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
label {
  display: block;
  margin-block: 8px;
}
.agent-tool-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
input,
select {
  background: var(--soda-input-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
}
option {
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
}
</style>
