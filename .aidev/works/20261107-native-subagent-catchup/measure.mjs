// Own generated record only. No real user record, process, pane or daemon is queried.
import {mkdtemp,mkdir,open,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
import {NativeSubagentReader} from '../../../packages/server/dist/agent/NativeSubagentReader.js';
import {NativeSubagentService} from '../../../packages/server/dist/agent/NativeSubagentService.js';
const root=new URL('./',import.meta.url),home=await mkdtemp(join(tmpdir(),'soda-catchup-measure-')),CHUNK=4*1024*1024;
try{
 const rows=(await readFile(new URL('../../../packages/server/src/agent/fixtures/native-subagents/codex.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse),sessionId=rows[0].payload.thread_id;
 const directory=join(home,'sessions','2026','11','07');await mkdir(directory,{recursive:true});const fd=await open(join(directory,`rollout-fixture-${sessionId}.jsonl`),'wx'),prefix=Buffer.from(JSON.stringify(rows[0])+'\n{"type":"response_item","payload":{"text":"'),suffix=Buffer.from('"}}\n');let left=32*1024*1024-prefix.length-suffix.length;const pad=Buffer.alloc(65536,120);
 try{await fd.write(prefix);while(left){const n=Math.min(left,pad.length);await fd.write(pad.subarray(0,n));left-=n;}await fd.write(suffix);}finally{await fd.close();}
 const reader=new NativeSubagentReader({codexHome:home}),source={paneId:'generated',instanceId:'generated',kind:'codex',sessionId},times=[],cpu=process.cpuUsage();
 try{for(let i=0;i<8;i++){const start=performance.now(),value=await reader.read(source);times.push(performance.now()-start);assert.equal(reader.progress(source).offset,(i+1)*CHUNK);assert.equal(reader.progress(source).pending,i<7);if(i<7)assert.equal(value,undefined);else assert.equal(value.count,1);}}finally{reader.close();}
 const used=process.cpuUsage(cpu);
 let clock=0,offset=0,publishedAt;const timers=[],delays=[];const pane={id:'generated',agent:{kind:'codex',instanceId:'generated'},agentSession:{kind:'codex',sessionId:'generated'}};
 const service=new NativeSubagentService({session:{snapshot:()=>({panes:[pane]}),getPane:()=>pane,setAgentSubagents:(_id,value)=>{assert.equal(offset,116);assert.equal(value.count,1);pane.agent.subagents=value;publishedAt=clock;return true},hasVerifiedAgentSession:()=>true},bus:{subscribe:()=>({dispose(){}})},reader:{read:async()=>{offset++;return offset===116?{count:1,items:[]}:undefined},progress:()=>({offset:offset*CHUNK,pending:offset<116}),forget(){},close(){}},now:()=>clock,setTimer:(fn,ms)=>{const t={fn,ms};timers.push(t);return t},clearTimer:()=>{}});
 service.start();for(let i=0;i<116;i++){const timer=timers.shift();delays.push(timer.ms);clock+=timer.ms;timer.fn();await new Promise(r=>setImmediate(r));}service.close();assert.ok(publishedAt<=45000);
 const receipt={fixtureBytes:32*1024*1024,chunks:8,maxReadBytes:CHUNK,readMs:times,totalReadMs:times.reduce((a,b)=>a+b,0),totalCpuMs:(used.user+used.system)/1000,catchupDelayMs:250,simulated464MiB:{reads:116,oldFixedPollDelayMs:116*2000,newPublishedAtMs:publishedAt,normalDelays:delays.filter(n=>n!==250),burstCapTicks:32,burstDeadlineMs:10000,cooldownMs:2000},realUserRecordsRead:false};await writeFile(new URL('measurement.json',root),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await rm(home,{recursive:true,force:true});}
