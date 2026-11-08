import {homedir} from 'node:os';import {join,sep} from 'node:path';import {lstat,realpath} from 'node:fs/promises';
import {FsSessionStore} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/session.js';
import {withSession} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/withSession.js';
import {parseArgs} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/cliArgs.js';
import {openCodexChildRecord} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/dist/agent/CodexChildRecord.js';
import {lookupCodexRecord,findCodexRecordFile} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/server/dist/agent/codexSession.js';
import {SubagentUsageRecordReader,verifyAppendedRecord} from '/tmp/soda-subagent-usage-reader.mjs';
const expectedProject='/workspaces/sodashitsu',home=process.env.CODEX_HOME??join(homedir(),'.codex');
const {opts}=parseArgs(['snapshot']);opts.token=undefined;
const reader=new SubagentUsageRecordReader(),begin=performance.now();let phase='session',valid=true;
try{await withSession(opts,new FsSessionStore(),async client=>{
 phase='formal-parent';const snap=(await client.hello()).snapshot;
 const candidates=snap.panes.filter(p=>{const t=snap.tabs.find(t=>t.id===p.tabId),w=snap.workspaces.find(w=>w.id===t?.workspaceId);return w?.projectDir===expectedProject&&p.cwd===expectedProject&&p.agent?.kind==='codex'&&p.agent.verified===true&&p.agentSession?.kind==='codex'&&(p.agent.subagents?.items?.length??0)>0;});
 if(candidates.length!==1)throw Error('scope');const before=candidates[0],items=before.agent.subagents.items;if(items.length>4)throw Error('bound');
 const scope=p=>JSON.stringify([p?.id,p?.tabId,p?.cwd,p?.agent?.instanceId,p?.agent?.kind,p?.agent?.verified,p?.agentSession?.kind,p?.agentSession?.sessionId]),expected=scope(before);
 const meta=await lookupCodexRecord(home,before.agentSession.sessionId),parentFile=await findCodexRecordFile(home,before.agentSession.sessionId),root=await realpath(join(home,'sessions'));
 if(meta?.cwd!==expectedProject||!parentFile||!parentFile.startsWith(root+sep)||await realpath(parentFile)!==parentFile)throw Error('parent');
 const parent=await lstat(parentFile,{bigint:true});if(!parent.isFile()||parent.isSymbolicLink()||parent.nlink!==1n||process.geteuid&&parent.uid!==BigInt(process.geteuid()))throw Error('parent');
 const check=async()=>{const now=(await client.hello()).snapshot,t=now.tabs.find(t=>t.id===before.tabId),w=now.workspaces.find(w=>w.id===t?.workspaceId),p=now.panes.find(p=>p.id===before.id),st=await lstat(parentFile,{bigint:true}).catch(()=>null);valid=performance.now()-begin<30000&&scope(p)===expected&&w?.projectDir===expectedProject&&items.every(i=>p?.agent?.subagents?.items?.filter(j=>j.id===i.id&&j.startedAt===i.startedAt).length===1)&&!!st&&!st.isSymbolicLink()&&st.dev===parent.dev&&st.ino===parent.ino&&st.size>=parent.size&&await realpath(parentFile)===parentFile;return valid;};
 phase='child-scan';for(let n=0;n<items.length;n++){
  const item=items[n],key=JSON.stringify([expected,item.id,item.startedAt]),open=()=>openCodexChildRecord(home,before.agentSession.sessionId,item.id);let result,calls=0,bytes=0;
  while(calls<40&&performance.now()-begin<30000){if(!await check())throw Error('scope');const record=await open();if(!record)throw Error('record');try{const st=await record.fd.stat({bigint:true});bytes=Number(st.size);result=await reader.read({key,kind:'codex',recordId:item.id,startedAt:item.startedAt},verifyAppendedRecord(record,st,open,()=>valid),()=>valid);}finally{await record.fd.close();}calls++;if(!result)throw Error('read');if(!await check())throw Error('scope');if(!result.scanning)break;}
  const entry=reader.entries.get(key);console.log(JSON.stringify({childIndex:n,calls,fileBytes:bytes,offset:entry?.offset,uniqueResponses:entry?.values.records,tokenFields:Object.keys(result?.tokens??{}).filter(k=>k!=='basis').sort(),contextKnown:result?.contextTokens!==undefined,windowKnown:result?.contextWindowTokens!==undefined,partial:result?.partial===true,scanning:result?.scanning===true,modelCalls:0}));
 }
 if(!await check())throw Error('scope');console.log(JSON.stringify({finished:true,formalParentUnique:true,parentNamespaceUnchanged:true,scopeUnchanged:true,children:items.length,elapsedMs:Math.round(performance.now()-begin),modelCalls:0}));
});}catch{console.log(JSON.stringify({finished:true,error:'metadata_unavailable',phase,modelCalls:0}));process.exitCode=1;}finally{reader.close();}
