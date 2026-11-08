import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm,readFile,rename,lstat,utimes,symlink,link} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";import {randomUUID} from "node:crypto";
import type {Pane} from "@sodashitsu/protocol";
import {AntigravityTerminalHistory} from "./AntigravityTerminalHistory.js";
import {readAgyTerminalSnapshot} from "./AntigravityTerminalSnapshot.js";
import {SubagentHistoryService} from "./SubagentHistoryService.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import * as extra from "../conversation/ExtraAgentRecords.js";
import * as safeFile from "./safeFile.js";
import * as snapshotModule from "./AntigravityTerminalSnapshot.js";
const parent="11111111-1111-4111-8111-111111111111",child="22222222-2222-4222-8222-222222222222";
const dirs:string[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
async function setup(state="SUBAGENT_STATE_KILLED"){
 const home=await mkdtemp(join(tmpdir(),"soda-agy-terminal-"));dirs.push(home);const brain=join(home,".gemini/antigravity-cli/brain"),system=join(brain,parent,".system_generated"),folder=join(system,"subagents"),parentFile=join(system,"logs/transcript.jsonl"),childFile=join(brain,child,".system_generated/logs/transcript.jsonl");await mkdir(folder,{recursive:true});await mkdir(join(system,"logs"));await mkdir(join(brain,child,".system_generated/logs"),{recursive:true});
 const original=await readFile(new URL("./fixtures/agy-subagents/parent.jsonl",import.meta.url),"utf8");await writeFile(parentFile,original+JSON.stringify({step_index:99,source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",created_at:"2026-11-07T04:12:00Z",input_tokens:999999,output_tokens:999,model:"PARENT_MODEL"})+"\n");
 const descriptor={conversationId:child,spawnStepIndex:2,state,subagentDescriptor:{typeName:"worker",role:"Generated child"}};const file=join(folder,child+".json");await writeFile(file,JSON.stringify(descriptor));
 await writeFile(childFile,[{step_index:0,source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",created_at:"2026-11-07T04:11:24Z",content:"PRIVATE_PLAN_NOT_PUBLIC"},{step_index:1,source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",created_at:"2026-11-07T04:11:25Z",input_tokens:100,output_tokens:20,cache_read_tokens:30,model:"child-model-not-a-parent-copy",tool_calls:[{name:"send_message",args:{Recipient:JSON.stringify(parent),Message:JSON.stringify("Generated public AGY child request")}}]}].map(v=>JSON.stringify(v)).join("\n")+"\n");
 let valid=true;const paneId=randomUUID(),instanceId=randomUUID(),cwd=join(home,"work");await mkdir(cwd);const source={paneId,instanceId,kind:"agy" as const,sessionId:parent};const cache=new AntigravityTerminalHistory({home});const pane={id:paneId,cwd,agent:{instanceId,kind:"agy",state:"idle",verified:true},agentSession:{kind:"agy",sessionId:parent}} as unknown as Pane;
 const history=new SubagentHistoryService({session:{getPane:()=>pane,hasVerifiedAgentSession:()=>valid},collect:(scope,allowed)=>cache.read(scope,()=>valid,allowed)});
 return{home,brain,system,folder,parentFile,childFile,file,descriptor,source,cache,pane,history,bindings:()=>cache.read(source,()=>valid),set valid(value:boolean){valid=value;}};
}
it("returns only explicit KILLED as aborted, omits guessed end time/model and reads child-only public requests/usage",async()=>{
 const f=await setup();try{
  const page=await f.history.read({paneId:f.source.paneId});expect(page.items).toHaveLength(1);const item=page.items[0]!,selection={paneId:f.source.paneId,agentId:child,entryId:item.entryId};expect(item).toMatchObject({terminalStatus:"aborted",startedAt:Date.parse("2026-11-07T04:11:23Z"),hasTranscript:true});expect(item).not.toHaveProperty("endedAt");expect(item).not.toHaveProperty("model");expect(item).not.toHaveProperty("reasoningEffort");
  const body=await f.history.transcript(selection);expect(body).toMatchObject({status:"ok",entries:[{kind:"tool",name:"send_message",text:"【親への送信要求】\nGenerated public AGY child request"}]});expect(JSON.stringify(body)).not.toContain("PRIVATE_PLAN");
  expect(await f.history.usageRead(selection)).toMatchObject({status:"ok",usage:{consumptionScope:"self",tokens:{input:100,output:20,cacheRead:30}}});expect((await f.history.usageRead(selection)).usage?.tokens).not.toHaveProperty("total");expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(item.entryId);
  const reader=new NativeSubagentReader({home:f.home});try{expect(await reader.read(f.source)).toEqual({count:0,countBasis:"alive",items:[]});}finally{reader.close();}
 }finally{f.history.close();f.cache.close();}
});
it("never infers termination from ALIVE, idle-like parent DONE or missing/unknown descriptor",async()=>{
 const f=await setup("SUBAGENT_STATE_ALIVE");try{
  const snapshot=await readAgyTerminalSnapshot(parent,{home:f.home},()=>true,()=>{});expect(snapshot?.facts).toEqual([]);expect((await f.history.read({paneId:f.source.paneId})).items).toHaveLength(0);
  await writeFile(f.file,JSON.stringify({...f.descriptor,state:"SUBAGENT_STATE_FUTURE"}));expect((await f.bindings()).status).toBe("unavailable");await rm(f.file);expect((await f.bindings()).status).toBe("unavailable");
 }finally{f.history.close();f.cache.close();}
});
it("rejects old entry before/after revival and does not switch it to a later KILLED generation",async()=>{
 const f=await setup();try{
  const first=(await f.history.read({paneId:f.source.paneId})).items[0]!,selection={paneId:f.source.paneId,agentId:child,entryId:first.entryId};
  await writeFile(f.file,JSON.stringify({...f.descriptor,state:"SUBAGENT_STATE_ALIVE"}));expect((await f.history.transcript(selection)).status).toBe("unreadable");expect((await f.history.read({paneId:f.source.paneId})).items).toHaveLength(0);
  await writeFile(f.file,JSON.stringify(f.descriptor));const next=(await f.history.read({paneId:f.source.paneId})).items[0]!;expect(next.entryId).not.toBe(first.entryId);expect(await f.history.usageRead(selection)).not.toHaveProperty("usage");
 }finally{f.history.close();f.cache.close();}
});
it("caches unchanged parent parsing, preserves grants only after an unrelated append reaches complete EOF",async()=>{
 const f=await setup();try{
  const first=(await f.history.read({paneId:f.source.paneId})).items[0]!,selection={paneId:f.source.paneId,agentId:child,entryId:first.entryId};const range=vi.spyOn(safeFile,"readRange");await f.bindings();expect(range).not.toHaveBeenCalled();range.mockRestore();
  await appendFile(f.parentFile,JSON.stringify({step_index:100,source:"SYSTEM",type:"SYSTEM_MESSAGE",status:"DONE",created_at:"2026-11-07T04:13:00Z"}));expect((await f.history.transcript(selection)).status).toBe("unreadable");expect((await f.bindings()).status).toBe("unavailable");
  await appendFile(f.parentFile,"\n");expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(first.entryId);expect((await f.history.transcript(selection)).status).toBe("ok");
 }finally{f.history.close();f.cache.close();}
});
it("retires namespace on same-size parent rewrite/truncate and requires fresh source after forget/close",async()=>{
 const f=await setup();try{
  const first=(await f.bindings()).bindings[0]!,text=await readFile(f.parentFile,"utf8"),before=await lstat(f.parentFile);await writeFile(f.parentFile,text.replace("PARENT_MODEL","OTHER_MODELX"));await utimes(f.parentFile,before.atime,before.mtime);expect(await first.verify(()=>true)).toBe(false);const next=(await f.bindings()).bindings[0]!;expect(first.current()).toBe(false);expect(next.key).not.toBe(first.key);
  await writeFile(f.parentFile,"{\n");expect((await f.bindings()).status).toBe("unavailable");await writeFile(f.parentFile,text);const last=(await f.bindings()).bindings[0]!;expect(last.key).not.toBe(next.key);f.valid=false;expect(last.current()).toBe(false);f.valid=true;f.cache.forget(f.source.paneId);expect(last.current()).toBe(false);f.cache.close();expect((await f.bindings()).status).toBe("unavailable");
 }finally{f.history.close();f.cache.close();}
});
it.each(["step","uuid","partial","oversize","unproven","missing-other"])("rejects incomplete or foreign %s proof rather than inventing stopped metadata",async change=>{
 const f=await setup();try{
  if(change==="step")await writeFile(f.file,JSON.stringify({...f.descriptor,spawnStepIndex:999}));
  if(change==="uuid")await writeFile(f.file,JSON.stringify({...f.descriptor,conversationId:randomUUID()}));
  if(change==="partial")await writeFile(f.file,"{");
  if(change==="oversize")await writeFile(f.file," ".repeat(32769));
  if(change==="unproven")await writeFile(f.parentFile,(await readFile(f.parentFile,"utf8")).replace("invoke_subagent","run_command"));
  if(change==="missing-other"){const original=(await readFile(f.parentFile,"utf8")).trim().split("\n").map(line=>JSON.parse(line));const call={...original[0],step_index:109},result={...original[1],step_index:110,content:original[1].content.replaceAll(child,randomUUID())};await appendFile(f.parentFile,JSON.stringify(call)+"\n"+JSON.stringify(result)+"\n");}
  expect((await f.bindings()).status).toBe("unavailable");
 }finally{f.history.close();f.cache.close();}
});
it("cannot follow descriptor links or counterfeit child records outside the owned namespace",async()=>{
 const f=await setup();try{
  await rename(f.file,f.file+".outside");await symlink(f.file+".outside",f.file);expect((await f.bindings()).status).toBe("unavailable");await rm(f.file);await rename(f.file+".outside",f.file);const first=(await f.history.read({paneId:f.source.paneId})).items[0]!,selection={paneId:f.source.paneId,agentId:child,entryId:first.entryId};await rename(f.childFile,f.childFile+".outside");await symlink(f.childFile+".outside",f.childFile);expect((await f.history.transcript(selection)).status).toBe("unreadable");expect(await f.history.usageRead(selection)).not.toHaveProperty("usage");
 }finally{f.history.close();f.cache.close();}
});
it("keeps physical slots through parent FD close and rejects late results after source proof retires",async()=>{
 const f=await setup();let release=()=>{};try{
  const binding=(await f.bindings()).bindings[0]!,original=extra.openExtra;let closes=0,opens=0;const gate=new Promise<void>(resolve=>{release=resolve;});const spy=vi.spyOn(extra,"openExtra").mockImplementation(async(...args:Parameters<typeof extra.openExtra>)=>{const value=await original(...args);if(value&&args[1]===parent&&opens++<4){const close=value.fd.close.bind(value.fd);value.fd.close=async()=>{closes++;await gate;await close();};}return value;});
  const jobs=Array.from({length:4},()=>binding.verify(()=>true));await vi.waitFor(()=>expect(closes).toBe(4));expect(await binding.verify(()=>true)).toBe(false);f.valid=false;release();expect(await Promise.all(jobs)).toEqual([false,false,false,false]);spy.mockRestore();
 }finally{release();f.history.close();f.cache.close();}
});

it("does not let a late retired scan replace a fresh same-source cache",async()=>{
 const f=await setup();let release=()=>{};try{
  const original=snapshotModule.readAgyTerminalSnapshot,gate=new Promise<void>(resolve=>{release=resolve;});const spy=vi.spyOn(snapshotModule,"readAgyTerminalSnapshot").mockImplementationOnce(async(...args)=>{await gate;return original(...args);});
  const old=f.bindings();await vi.waitFor(()=>expect(spy).toHaveBeenCalledOnce());f.cache.forget(f.source.paneId);const fresh=(await f.bindings()).bindings[0]!;expect(fresh.current()).toBe(true);release();expect((await old).status).toBe("unavailable");expect(fresh.current()).toBe(true);expect(await fresh.verify(()=>true)).toBe(true);
 }finally{release();f.history.close();f.cache.close();}
});
it("bounds cached parent sources and retires an evicted source's old binding",async()=>{
 const f=await setup();try{
  const first=(await f.bindings()).bindings[0]!;for(let n=0;n<64;n++)await f.cache.read({...f.source,paneId:randomUUID(),instanceId:randomUUID()},()=>true);
  expect((f.cache as any).states.size).toBe(64);expect(first.current()).toBe(false);
 }finally{f.history.close();f.cache.close();}
});
