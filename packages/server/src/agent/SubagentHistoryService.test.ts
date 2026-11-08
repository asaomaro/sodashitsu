import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {Pane} from "@sodashitsu/protocol";
import {SubagentHistoryService} from "./SubagentHistoryService.js";
import type {SubagentTerminalBinding} from "./SubagentTerminalBinding.js";
import {openVerified} from "./safeFile.js";
import {entriesOfLine} from "./SubagentTranscript.js";
const paneId="12345678-1234-4234-8234-123456789012",parent="12345678-1234-4234-8234-123456789013",instance="12345678-1234-4234-8234-123456789014";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),"soda-ended-child-service-"));dirs.push(dir);const file=join(dir,"generated.jsonl");await writeFile(file,JSON.stringify({type:"assistant",message:{content:"Generated child answer"}})+"\n");
 const pane:Pane={id:paneId,tabId:parent,label:"Generated",cwd:dir,shell:"node",cols:80,rows:24,status:"running",failure:null,busy:false,title:"Generated",rightClick:"pane",agent:{instanceId:instance,kind:"cursor",label:"Cursor",state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1},agentSession:{kind:"cursor",sessionId:parent,reportedAt:1}};
 let generation=1,verified=true,closed=0,opened=0,allowed=true;
 const source={paneId,instanceId:instance,kind:"cursor",sessionId:parent};
 const record=async()=>{const value=await openVerified(file);if(!value)return;opened++;const close=value.fd.close.bind(value.fd);value.fd.close=async()=>{closed++;await close();};return{...value,unchanged:async()=>true};};
 const make=():SubagentTerminalBinding=>{const own=generation;return{source,item:{id:"child",startedAt:1000,terminalStatus:"completed",hasTranscript:true},eventId:"event-"+own,key:"namespace-"+own,kind:"cursor",recordId:"child",current:()=>generation===own&&verified,
 verify:async check=>check()&&generation===own&&verified,openRecord:async(purpose,check)=>purpose==="transcript"&&check()&&generation===own&&verified?record():undefined,entries:entriesOfLine};};
 let binding=make();const collect=vi.fn(async()=>({status:"ok" as const,bindings:[binding],incomplete:true}));
 const service=new SubagentHistoryService({session:{getPane:()=>pane,hasVerifiedAgentSession:()=>verified},collect});
 return{service,pane,record,collect,get binding(){return binding;},set binding(v:SubagentTerminalBinding){binding=v;},allowed:()=>allowed,set allowedValue(v:boolean){allowed=v;},set verified(v:boolean){verified=v;},get opened(){return opened;},get closed(){return closed;},next(){generation++;binding=make();}};
}
it("keeps terminal rows separate, reads after the listing lease ends, and never uses current child routes",async()=>{
 const f=await fixture();try{
  const list=await f.service.read({paneId});expect(list).toMatchObject({status:"ok",items:[{id:"child",terminalStatus:"completed"}],incomplete:true});expect(f.pane.agent?.subagents).toBeUndefined();
  const params={paneId,agentId:"child",entryId:list.items[0]!.entryId};
  const page=await f.service.transcript(params);expect(page).toMatchObject({status:"ok",running:false,state:"unknown",terminalStatus:"completed",entries:[{kind:"say",text:"Generated child answer"}]});
  expect(await f.service.usageRead(params)).toMatchObject({status:"unavailable"});expect(await f.service.transcript({...params,agentId:"other"})).toMatchObject({status:"unreadable"});
  expect(f.opened).toBe(f.closed);
 }finally{f.service.close();}
});
it("does not switch an old selected history to a new attempt with the same child id",async()=>{
 const f=await fixture();try{
  const old=(await f.service.read({paneId})).items[0]!;f.next();const next=(await f.service.read({paneId})).items[0]!;expect(next.entryId).not.toBe(old.entryId);
  expect(await f.service.transcript({paneId,agentId:"child",entryId:old.entryId})).toMatchObject({status:"unreadable",entries:[]});
  expect(await f.service.usageRead({paneId,agentId:"child",entryId:old.entryId})).toMatchObject({status:"unavailable"});
  expect(await f.service.transcript({paneId,agentId:"child",entryId:next.entryId})).toMatchObject({status:"ok"});
  f.verified=false;expect(await f.service.transcript({paneId,agentId:"child",entryId:next.entryId})).toMatchObject({status:"unreadable"});expect(f.opened).toBe(f.closed);
 }finally{f.service.close();}
});
it("discards a late open on authorization loss and still physically closes the owned record",async()=>{
 const f=await fixture();let resolve!:(value:Awaited<ReturnType<typeof f.record>>)=>void;
 try{
  const binding=f.binding;f.binding={...binding,openRecord:()=>new Promise(done=>{resolve=done;})};const list=await f.service.read({paneId});
  const reading=f.service.transcript({paneId,agentId:"child",entryId:list.items[0]!.entryId},f.allowed);
  await vi.waitFor(()=>expect(resolve).toBeTypeOf("function"));f.allowedValue=false;resolve(await f.record());expect(await reading).toMatchObject({status:"unreadable",entries:[]});expect(f.opened).toBe(f.closed);
 }finally{f.service.close();}
});
it("discards provider-owned numeric callbacks after parent revocation without using a current fallback",async()=>{
 const f=await fixture();let resolve!:(u:import('@sodashitsu/protocol').SubagentUsage)=>void;
 f.binding={...f.binding,readUsage:()=>new Promise(done=>{resolve=done;})};const item=(await f.service.read({paneId})).items[0]!;
 const result=f.service.usageRead({paneId,agentId:'child',entryId:item.entryId});await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));f.verified=false;resolve({source:'cursor-db',consumptionScope:'self',contextTokens:1,contextWindowTokens:2,partial:true});expect(await result).toMatchObject({status:'unavailable'});expect(f.opened).toBe(f.closed);f.service.close();
});
