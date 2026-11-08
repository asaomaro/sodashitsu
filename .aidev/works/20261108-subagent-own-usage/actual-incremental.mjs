import {homedir} from 'node:os';import {join} from 'node:path';
import {FsSessionStore} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/session.js';
import {withSession} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/withSession.js';
import {parseArgs} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/cliArgs.js';
import {openCodexChildRecord} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/dist/agent/CodexChildRecord.js';
import {SubagentUsageRecordReader,verifyAppendedRecord} from '/tmp/soda-subagent-usage-reader.mjs';
const {opts}=parseArgs(['snapshot']);opts.token=undefined;const reader=new SubagentUsageRecordReader(),begin=performance.now();
let phase="session";try{await withSession(opts,new FsSessionStore(),async client=>{
 phase="snapshot";const before=(await client.hello()).snapshot.panes.filter(p=>p.agent?.kind==='codex'&&p.agentSession?.kind==='codex').sort((a,b)=>(b.agent.subagents?.items?.length??0)-(a.agent.subagents?.items?.length??0))[0];
 const scope=p=>JSON.stringify([p?.id,p?.agent?.instanceId,p?.agent?.kind,p?.agentSession?.kind,p?.agentSession?.sessionId]);
 if(!before||!(before.agent.subagents?.items?.length)){const panes=(await client.hello()).snapshot.panes;console.log(JSON.stringify({panes:panes.length,kinds:panes.reduce((m,p)=>(m[p.agent?.kind??p.agentKind??'none']=(m[p.agent?.kind??p.agentKind??'none']??0)+1,m),{}),paneFields:panes[0]?Object.keys(panes[0]).sort():[],codex:panes.filter(p=>p.agent?.kind==='codex').map(p=>({sessionKind:p.agentSession?.kind,sessionFields:Object.keys(p.agentSession??{}),children:p.agent.subagents?.count,items:p.agent.subagents?.items?.length,agentFields:Object.keys(p.agent)}))}));throw Error('unavailable');}
 phase="membership";const expected=scope(before),items=before.agent.subagents.items;if(items.length>4)throw Error('cardinality');let valid=true;
 for(let n=0;n<items.length;n++){
  const item=items[n],key=JSON.stringify([expected,item.id,item.startedAt]),open=()=>openCodexChildRecord(process.env.CODEX_HOME??join(homedir(),'.codex'),before.agentSession.sessionId,item.id);let result,calls=0,bytes=0;
  for(;calls<40&&performance.now()-begin<30000;calls++){
   const p=(await client.hello()).snapshot.panes.find(p=>p.id===before.id);valid=scope(p)===expected&&p.agent.subagents?.items?.some(i=>i.id===item.id&&i.startedAt===item.startedAt);if(!valid)throw Error('scope');
   phase="child-open";const r=await open();if(!r)throw Error('record');try{const st=await r.fd.stat({bigint:true});bytes=Number(st.size);const wrapped=verifyAppendedRecord(r,st,open,()=>valid);result=await reader.read({key,kind:'codex',recordId:item.id,startedAt:item.startedAt},wrapped,()=>valid);}finally{await r.fd.close();}
   if(!result)throw Error('read');if(!result.scanning)break;
  }
  const entry=reader.entries.get(key);console.log(JSON.stringify({childIndex:n,calls:calls+1,fileBytes:bytes,offset:entry?.offset,uniqueResponses:entry?.values.records,tokenFields:Object.keys(result?.tokens??{}).filter(k=>k!=='basis').sort(),contextKnown:result?.contextTokens!==undefined,windowKnown:result?.contextWindowTokens!==undefined,partial:result?.partial===true,scanning:result?.scanning===true,modelCalls:0}));
 }
 const after=(await client.hello()).snapshot.panes.find(p=>p.id===before.id);valid=scope(after)===expected&&items.every(i=>after.agent.subagents?.items?.some(j=>j.id===i.id&&j.startedAt===i.startedAt));
 console.log(JSON.stringify({finished:true,scopeUnchanged:valid,children:items.length,elapsedMs:Math.round(performance.now()-begin),modelCalls:0}));if(!valid)process.exitCode=1;
});}catch(e){console.log(JSON.stringify({finished:true,error:'metadata_unavailable',phase,errorClass:e?.constructor?.name,modelCalls:0}));process.exitCode=1;}finally{reader.close();}
