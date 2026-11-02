import {openVerified,readRange} from '../agent/safeFile.js';
import {recordMessage,type ConversationService} from './ConversationService.js';
import {todoSnapshot} from './AgentTodos.js';
import {RpcError,type Pane,type SessionSnapshot} from '@sodashitsu/protocol';
import type {SummaryService} from './SummaryService.js';
export interface ReportWork {
 workspace:string;agent:string;kind:string;state:string;available:boolean;partial:boolean;
 messages:{role:'user'|'assistant';text:string;at?:string}[];
 todos:{text:string;status:string}[];summary?:{text:string;stale:boolean};
}
const text=(value:string,max=160)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);
/** Explicit report generation only. Never persists text in the numeric analytics index. */
export async function usageWorkContext(deps:{session:{snapshot():Pick<SessionSnapshot,'panes'|'tabs'|'workspaces'>;getPane(id:string):Pane|undefined};conversations?:ConversationService|undefined;summaries?:Pick<SummaryService,'cached'>|undefined},check:()=>void):Promise<{items:ReportWork[];omitted:number;verify:()=>void}> {
 check();if(!deps.conversations)return {items:[],omitted:0,verify:check};
 const snapshot=deps.session.snapshot(),panes=snapshot.panes.filter(p=>p.agent).sort((a,b)=>Number(b.agent?.state==='working')-Number(a.agent?.state==='working'));
 const items:ReportWork[]=[];const identities=new Map<ReportWork,{paneId:string;instanceId:string;sessionId:string|undefined}>();let remaining=16000;
 for(const pane of panes.slice(0,12)){
  check();const identity={paneId:pane.id,instanceId:pane.agent!.instanceId,sessionId:pane.agentSession?.sessionId};const tab=snapshot.tabs.find(t=>t.id===pane.tabId),workspace=snapshot.workspaces.find(w=>w.id===tab?.workspaceId);
  const item:ReportWork={workspace:text(workspace?.label??'不明'),agent:text(pane.agent?.name??pane.label??pane.agent?.label??pane.agent!.kind),kind:pane.agent!.kind,state:pane.agent!.state,available:false,partial:false,messages:[],todos:[]};
  try{
   const source=deps.conversations.source(pane.id),file=await deps.conversations.locate(source.kind,source.sessionId);check();const opened=await openVerified(file);
   if(opened){try{check();
    const start=Math.max(0,opened.st.size-256*1024),bytes=await readRange(opened.fd,start,opened.st.size-start);check();
    const lines=bytes.toString('utf8').split('\n');lines.pop();if(start)lines.shift();item.partial=start>0;
    for(const line of lines){let row:any;try{row=JSON.parse(line);}catch{item.partial=true;continue;}
     const message=recordMessage(row,source.kind);if(message&&!/^\s*(# AGENTS\.md|<INSTRUCTIONS>|<skills_instructions>|<environment_context>)/.test(message.text))item.messages.push({role:message.role,text:text(message.text,800),...(message.at&&message.at.length<=64&&Number.isFinite(Date.parse(message.at))?{at:message.at}:{})});
     const todos=todoSnapshot(row);if(todos)item.todos=todos.filter(t=>t.status!=='completed').slice(0,4).map(t=>({text:text(t.text,300),status:t.status}));
    }
    const recentUsers=item.messages.filter(m=>m.role==='user').slice(-2),recentAssistant=item.messages.filter(m=>m.role==='assistant').slice(-2);
    item.messages=[...recentUsers,...recentAssistant];item.available=item.messages.length>0||item.todos.length>0;
   }finally{await opened.fd.close();}}
   if(typeof deps.summaries?.cached==='function'){
    const saved=await deps.summaries.cached(pane.id);check();if(saved){item.summary={text:text(saved.text,1200),stale:saved.stale??false};item.available||=!!saved.text.trim();}
   }
   const current=deps.session.getPane(pane.id);
   if(current?.agent?.instanceId!==pane.agent?.instanceId||current?.agentSession?.sessionId!==source.sessionId)continue;
  }catch{check();item.partial=true;}
  const current=deps.session.getPane(pane.id);
  if(current?.agent?.instanceId!==pane.agent?.instanceId||current?.agentSession?.sessionId!==pane.agentSession?.sessionId)continue;
  const bounded=(value:string)=>{const result=value.slice(0,remaining);remaining-=result.length;if(result.length<value.length)item.partial=true;return result;};
  item.messages=item.messages.map(m=>({...m,text:bounded(m.text)})).filter(m=>m.text);
  item.todos=item.todos.map(t=>({...t,text:bounded(t.text)})).filter(t=>t.text);
  if(item.summary)item.summary.text=bounded(item.summary.text);
  item.available=!!(item.messages.length||item.todos.length||item.summary?.text);
  items.push(item);identities.set(item,identity);
 }
 check();const valid=items.filter(item=>{const expected=identities.get(item)!,current=deps.session.getPane(expected.paneId);return current?.agent?.instanceId===expected.instanceId&&current.agentSession?.sessionId===expected.sessionId;});
 return {items:valid,omitted:Math.max(0,panes.length-valid.length),verify:()=>{
  check();for(const item of valid){const expected=identities.get(item)!,current=deps.session.getPane(expected.paneId);if(current?.agent?.instanceId!==expected.instanceId||current?.agentSession?.sessionId!==expected.sessionId)throw new RpcError('agent_pane_busy','分析対象の作業が切り替わりました。再生成してください');}
 }};
}
