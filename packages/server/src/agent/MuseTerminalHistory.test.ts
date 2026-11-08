import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm,rename,readFile,utimes,lstat} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";import {randomUUID} from "node:crypto";
import type {Pane} from "@sodashitsu/protocol";
import {NativeSubagentRecords} from "./NativeSubagentRecords.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import {SubagentHistoryService} from "./SubagentHistoryService.js";
const parent="01a1b40b-85fb-7eb2-bacf-afa29c999bc9",birthUs=1794022023366977;
const versions:Record<string,number>={spawn_accepted:4,resume_context_recorded:1,child_session_bound:1,start_attested:1,status_updated:1,attempt_admitted:1,runtime_observed:2,result_ready:2};
const dirs:string[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
async function setup(){
 const home=await mkdtemp(join(tmpdir(),"soda-muse-terminal-"));dirs.push(home);const dataHome=join(home,"data"),cwd=join(home,"work"),child=randomUUID(),id=randomUUID(),paneId=randomUUID(),instanceId=randomUUID();await mkdir(cwd);
 const dir=join(dataHome,"muse","sessions","2026","11","07",parent),nested=join(dir,"subagent",child);await mkdir(nested,{recursive:true});const file=join(dir,"session.jsonl"),childFile=join(nested,"session.jsonl");
 const event=(kind:string,fields:Record<string,unknown>={},at=birthUs)=>({schema_version:1,id:randomUUID(),stream:{kind:"session",id:parent},recorded_at:at,record_type:"event",durability:"durable",payload_type:"subagent.control."+kind,payload_schema_version:versions[kind]??1,payload:{kind:"subagent_control",record:{kind,subagent_id:id,parent_session_id:parent,...fields}}});
 const spawn=()=>event("spawn_accepted",{role:"workflow-agent",objective:"Generated public child task"},birthUs-2000),bound=()=>event("child_session_bound",{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"},birthUs-1000);
 const lines=(rows:unknown[])=>rows.map(row=>JSON.stringify(row)).join("\n")+"\n";
 await writeFile(file,lines([spawn(),bound(),event("start_attested"),event("result_ready",{},birthUs+3000000)]));
 const usage=(at:number,input=100,stream=child)=>({schema_version:1,payload_schema_version:1,stream:{kind:"session",id:stream},recorded_at:at,payload_type:"runtime.session",payload:{kind:"run",event:{kind:"goal_usage_attribution",record:{schema_version:1,usage_family:"provider",usage_id:randomUUID(),model:"generated",quantity:{reported:true,unit:"tokens",input_tokens:input,output_tokens:20,cached_tokens:30}}}}});
 await writeFile(childFile,lines([usage(birthUs-1,999999),usage(birthUs+1),usage(birthUs+1,999999,parent),{schema_version:1,payload_schema_version:1,stream:{kind:"session",id:child},recorded_at:birthUs+2000000,payload_type:"runtime.session",payload:{kind:"run",event:{kind:"workflow_child_result_submitted",child_session_stream:{kind:"session",id:child},payload:{text:"Generated public Muse child result"}}}}]));
 let valid=true;const source={paneId,instanceId,kind:"muse" as const,sessionId:parent};
 const reader=new NativeSubagentReader({dataHome},undefined,{forget(){},async readMany(){return new Map();}});
 const pane={id:paneId,cwd,agent:{instanceId,kind:"muse",state:"idle",verified:true},agentSession:{kind:"muse",sessionId:parent}} as unknown as Pane;
 const session={getPane:()=>pane,hasVerifiedAgentSession:()=>valid};const bindings=()=>reader.museTerminals(source,()=>valid);
 const history=new SubagentHistoryService({session,collect:()=>bindings()});
 return{home,dataHome,cwd,child,id,file,childFile,event,spawn,bound,lines,usage,source,reader,pane,bindings,history,set valid(value:boolean){valid=value;}};
}
it("requires a durable attested start, exact binding and literal result_ready; closing alone is not terminal history",async()=>{
 const f=await setup();try{
  const fold=new NativeSubagentRecords("muse",parent);fold.consume(f.spawn());fold.consume(f.bound());fold.consume(f.event("start_attested"));fold.consume(f.event("status_updated",{control_status:"closing"}));expect(fold.snapshot()?.count).toBe(0);expect(fold.museTerminals()).toEqual([]);
  fold.consume(f.event("result_ready",{},birthUs+1000000));expect(fold.museTerminals()).toMatchObject([{id:f.id,childSession:f.child,startedAt:birthUs/1000,endedAt:(birthUs+1000000)/1000}]);
  fold.consume(f.event("status_updated",{control_status:"closed"}));expect(fold.museTerminals()).toHaveLength(1);
  const unowned=new NativeSubagentRecords("muse",parent);unowned.consume(f.bound());unowned.consume(f.event("result_ready"));expect(unowned.museTerminals()).toEqual([]);
 }finally{f.history.close();f.reader.close();}
});
it("serves exact readonly history body and birth-filtered child usage without parent counters or active resurrection",async()=>{
 const f=await setup();try{
  expect(await f.reader.read(f.source)).toEqual({count:0,items:[]});const list=await f.history.read({paneId:f.source.paneId});expect(list.items).toHaveLength(1);const item=list.items[0]!,selection={paneId:f.source.paneId,agentId:f.id,entryId:item.entryId};expect(item).toMatchObject({terminalStatus:"completed",startedAt:Math.floor(birthUs/1000),endedAt:Math.floor((birthUs+3000000)/1000)});expect(item).not.toHaveProperty("model");
  expect(await f.history.transcript(selection)).toMatchObject({status:"ok",entries:[{kind:"say",text:"Generated public Muse child result"}]});
  expect(await f.history.usageRead(selection)).toMatchObject({status:"ok",usage:{consumptionScope:"self",tokens:{input:70,cacheRead:30,output:20}}});
  expect((await f.history.usageRead(selection)).usage?.tokens).not.toHaveProperty("total");expect(await f.history.usageRead({...selection,entryId:randomUUID()})).not.toHaveProperty("usage");
  await f.reader.read(f.source);expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(item.entryId);expect(f.reader.museChildSession(f.source,f.id)).toBeUndefined();
 }finally{f.history.close();f.reader.close();}
});
it.each(["spawn_accepted","resume_context_recorded","child_session_bound","attempt_admitted","future-state"])("retires old end on %s and never regrants a mere resumed/running child",async kind=>{
 const f=await setup();try{
  await f.reader.read(f.source);const item=(await f.history.read({paneId:f.source.paneId})).items[0]!,selection={paneId:f.source.paneId,agentId:f.id,entryId:item.entryId};
  await appendFile(f.file,f.lines([kind==="child_session_bound"?f.bound():f.event(kind)]));expect((await f.history.transcript(selection)).status).toBe("unreadable");await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);
  await appendFile(f.file,f.lines([f.event("status_updated",{control_status:"running"}),f.event("result_ready",{},birthUs+4000000)]));await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);expect(await f.history.usageRead(selection)).not.toHaveProperty("usage");
  await appendFile(f.file,f.lines([f.bound(),f.event("start_attested",{},birthUs+5000000),f.event("result_ready",{},birthUs+6000000)]));await f.reader.read(f.source);const next=(await f.history.read({paneId:f.source.paneId})).items[0]!;expect(next.entryId).not.toBe(item.entryId);
 }finally{f.history.close();f.reader.close();}
});
it("rejects foreign/unknown layout, nondurable or unfamiliar schema and invalid/missing formal time",async()=>{
 const f=await setup();try{
  const examples=[{...f.event("result_ready"),durability:"volatile"},{...f.event("result_ready"),payload_schema_version:99},{...f.event("result_ready"),recorded_at:NaN}];
  for(const bad of examples){const fold=new NativeSubagentRecords("muse",parent);[f.spawn(),f.bound(),f.event("start_attested"),bad].forEach(row=>fold.consume(row));expect(fold.museTerminals()).toEqual([]);}
  const fold=new NativeSubagentRecords("muse",parent);[f.spawn(),f.event("child_session_bound",{child_session_id:f.child,schema_version:1,storage_layout:"future"}),f.event("start_attested"),f.event("result_ready")].forEach(row=>fold.consume(row));expect(fold.museTerminals()).toEqual([]);
  const foreign=new NativeSubagentRecords("muse",randomUUID());[f.spawn(),f.bound(),f.event("start_attested"),f.event("result_ready")].forEach(row=>foreign.consume(row));expect(foreign.museTerminals()).toBeUndefined();
 }finally{f.history.close();f.reader.close();}
});
it("requires newline-complete EOF, namespace revision and fresh source; unrelated append keeps an existing selector",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const binding=f.bindings().bindings[0]!,item=(await f.history.read({paneId:f.source.paneId})).items[0]!;
  await appendFile(f.file,f.lines([{schema_version:1,stream:{kind:"session",id:parent},payload_type:"unrelated"}]));expect(await binding.verify(()=>true)).toBe(false);await f.reader.read(f.source);expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(item.entryId);
  const original=await readFile(f.file,"utf8"),before=await lstat(f.file);await writeFile(f.file,original.replaceAll(parent,randomUUID()));await utimes(f.file,before.atime,before.mtime);expect(await binding.verify(()=>true)).toBe(false);await f.reader.read(f.source);expect(binding.current()).toBe(false);
  await rename(f.file,f.file+".old");await writeFile(f.file,original.trimEnd());await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);await appendFile(f.file,"\n");await f.reader.read(f.source);const next=f.bindings().bindings[0]!;expect(next.key).not.toBe(binding.key);f.valid=false;expect(next.current()).toBe(false);f.valid=true;f.reader.forget(f.source.paneId);expect(next.current()).toBe(false);
 }finally{f.history.close();f.reader.close();}
});
it("keeps the physical quota through close and rejects a late retired Muse verification",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const binding=f.bindings().bindings[0]!,original=(f.reader as any).open.bind(f.reader);let closing=0,opens=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const spy=vi.spyOn(f.reader as any,"open").mockImplementation(async(...args:unknown[])=>{const opened=await original(...args);if(opened&&opens++<4){const close=opened.fd.close.bind(opened.fd);opened.fd.close=async()=>{closing++;await gate;await close();};}return opened;});
  const jobs=Array.from({length:4},()=>binding.verify(()=>true));await vi.waitFor(()=>expect(closing).toBe(4));expect(await binding.verify(()=>true)).toBe(false);f.valid=false;release();expect(await Promise.all(jobs)).toEqual([false,false,false,false]);spy.mockRestore();f.valid=true;expect(await binding.verify(()=>true)).toBe(true);
 }finally{f.history.close();f.reader.close();}
});
it("revokes earlier terminal proof after a malformed time, unknown schema or invalid binding",async()=>{
 const f=await setup();try{
  for(const row of [{...f.event("start_attested"),recorded_at:undefined},{...f.event("result_ready"),payload_schema_version:99},{...f.event("child_session_bound"),schema_version:99},f.event("child_session_bound",{child_session_id:f.child,schema_version:1,storage_layout:"unknown"})]){
   const fold=new NativeSubagentRecords("muse",parent);[f.spawn(),f.bound(),f.event("start_attested"),f.event("result_ready")].forEach(value=>fold.consume(value));expect(fold.museTerminals()).toHaveLength(1);fold.consume(row);expect(fold.museTerminals()).toEqual([]);
  }
 }finally{f.history.close();f.reader.close();}
});
it.each(["volatile","unknown-schema","unknown-record"])("never promotes a %s binding through later valid start/result",async variant=>{
 const f=await setup();try{
  const bound=f.bound();if(variant==="volatile")bound.durability="volatile";else if(variant==="unknown-schema")bound.payload_schema_version=99;else bound.record_type="unknown";
  const rows=[f.spawn(),bound,f.event("start_attested"),f.event("result_ready",{},birthUs+3000000)];
  const fold=new NativeSubagentRecords("muse",parent);rows.forEach(row=>fold.consume(row));expect(fold.museTerminals()).toEqual([]);expect(fold.museChildSession(f.id)).toBe(f.child);
  await writeFile(f.file,f.lines(rows));await f.reader.read(f.source);expect((await f.history.read({paneId:f.source.paneId})).items).toHaveLength(0);
  await appendFile(f.file,f.lines([f.bound(),f.event("start_attested",{},birthUs+4000000),f.event("result_ready",{},birthUs+5000000)]));await f.reader.read(f.source);expect((await f.history.read({paneId:f.source.paneId})).items).toHaveLength(1);
 }finally{f.history.close();f.reader.close();}
});
it("bounds private history bindings and never admits an unaccepted or missing raw child",async()=>{
 const f=await setup();try{
  const fold=new NativeSubagentRecords("muse",parent),first=randomUUID();
  for(let n=0;n<257;n++)fold.consume(f.event("child_session_bound",{subagent_id:n===0?first:randomUUID(),child_session_id:randomUUID(),schema_version:1,storage_layout:"nested_session_v1"}));
  expect((fold as any).museHistoryBindings.size).toBe(256);
  for(let n=0;n<300;n++)fold.consume(f.event("child_session_bound",{subagent_id:randomUUID(),schema_version:1,storage_layout:"nested_session_v1"}));
  expect((fold as any).museHistoryBindings.size).toBe(256);const replacement=randomUUID();fold.consume(f.event("child_session_bound",{subagent_id:first,child_session_id:replacement,schema_version:1,storage_layout:"nested_session_v1"}));expect(fold.museChildSession(first)).toBe(replacement);expect((fold as any).museHistoryBindings.get(first)).toBe(replacement);expect((fold as any).museHistoryBindings.size).toBe(256);
 }finally{f.history.close();f.reader.close();}
});
