import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm,rename,readFile,lstat,utimes} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";import {randomUUID} from "node:crypto";
import type {Pane} from "@sodashitsu/protocol";
import {NativeSubagentRecords} from "./NativeSubagentRecords.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import {SubagentHistoryService} from "./SubagentHistoryService.js";
import * as safeFile from "./safeFile.js";
const dirs:string[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const born="2026-11-08T00:00:00Z",end="2026-11-08T00:00:02Z";
async function setup(family="subagent",terminal="completed"){
 const home=await mkdtemp(join(tmpdir(),"soda-copilot-terminal-"));dirs.push(home);const cwd=join(home,"work");await mkdir(cwd);const parent=randomUUID(),child="tool_"+randomUUID(),paneId=randomUUID(),instanceId=randomUUID(),dir=join(home,"session-state",parent);await mkdir(dir,{recursive:true});const file=join(dir,"events.jsonl");
 const event=(phase:string,id=randomUUID(),call=child,time=phase==="started"?born:end)=>({id,type:family+"."+phase,timestamp:time,data:{toolCallId:call,agentName:"explore",agentDescription:"Generated Copilot child"}});
 const lines=(rows:unknown[])=>rows.map(row=>JSON.stringify(row)).join("\n")+"\n";
 const header={id:randomUUID(),type:"session.start",timestamp:born,data:{sessionId:parent,model:"PARENT_MODEL",totalTokens:999999,text:"PARENT_BODY_MUST_NOT_BE_CHILD"}};
 await writeFile(file,lines([header,event("started"),event(terminal)]));let valid=true;const source={paneId,instanceId,kind:"copilot" as const,sessionId:parent};
 const reader=new NativeSubagentReader({copilotHome:home});const pane={id:paneId,cwd,agent:{instanceId,kind:"copilot",state:"idle",verified:true},agentSession:{kind:"copilot",sessionId:parent}} as unknown as Pane;
 const history=new SubagentHistoryService({session:{getPane:()=>pane,hasVerifiedAgentSession:()=>valid},collect:()=>bindings()});const bindings=()=>reader.copilotTerminals(source,()=>valid);
 return{home,cwd,parent,child,file,event,lines,header,source,reader,history,bindings,pane,set valid(value:boolean){valid=value;}};
}
it.each(["custom_agent","subagent"])("accepts owned %s completed/failed only, without terminal-only or selector inference",async family=>{
 const f=await setup(family);try{
  const fold=new NativeSubagentRecords("copilot",f.parent);fold.consume(f.event("completed"));expect(fold.copilotTerminals()).toEqual([]);const start=f.event("started");fold.consume(start);fold.consume(f.event("failed"));expect(fold.snapshot()).toEqual({count:0,items:[]});expect(fold.copilotTerminals()).toMatchObject([{terminalStatus:"error",id:f.child,startedAt:Date.parse(born),endedAt:Date.parse(end)}]);
  fold.consume({type:"subagent.selected",data:{agentName:"other"}});fold.consume({type:"subagent.deselected"});fold.consume(start);expect(fold.copilotTerminals()).toHaveLength(1);expect(fold.snapshot()?.count).toBe(0);
  fold.consume(f.event("future_state"));expect(fold.copilotTerminals()).toBeUndefined();fold.consume(f.event("completed"));expect(fold.copilotTerminals()).toEqual([]);
 }finally{f.history.close();f.reader.close();}
});
it.each(["completed","failed"])("lists %s readonly metadata without reading parent body/counters as child data",async terminal=>{
 const f=await setup("subagent",terminal);try{
  expect(await f.reader.read(f.source)).toEqual({count:0,items:[]});const range=vi.spyOn(safeFile,"readRange");const list=await f.history.read({paneId:f.source.paneId});expect(list.items).toHaveLength(1);const item=list.items[0]!,selection={paneId:f.source.paneId,agentId:f.child,entryId:item.entryId};expect(item).toMatchObject({id:f.child,terminalStatus:terminal==="failed"?"error":"completed",type:"explore"});expect(item).not.toHaveProperty("model");expect(item).not.toHaveProperty("reasoningEffort");expect(item).not.toHaveProperty("hasTranscript");
  expect(await f.history.transcript(selection)).toMatchObject({status:"unreadable",entries:[],reason:expect.stringContaining("Copilot")});const usage=await f.history.usageRead(selection);expect(usage).toMatchObject({status:"unavailable",reason:expect.stringContaining("まだ接続されていません")});expect(usage).not.toHaveProperty("usage");expect(range).not.toHaveBeenCalled();
  expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(item.entryId);expect(await f.history.usageRead({...selection,entryId:randomUUID()})).not.toHaveProperty("usage");
 }finally{f.history.close();f.reader.close();}
});
it("retires old entry on a unique restart and never infers completion from idle, age, model or unknown status",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const item=(await f.history.read({paneId:f.source.paneId})).items[0]!,selection={paneId:f.source.paneId,agentId:f.child,entryId:item.entryId};
  await appendFile(f.file,f.lines([f.event("started",randomUUID(),f.child,"2026-11-08T00:00:03Z")]));expect((await f.history.transcript(selection)).status).toBe("unreadable");expect((await f.reader.read(f.source))?.count).toBe(1);expect(f.bindings().bindings).toHaveLength(0);
  await appendFile(f.file,f.lines([{type:"session.idle",timestamp:"2099-01-01T00:00:00Z",data:{model:"end-looking"}},f.event("future_status")]));expect(await f.reader.read(f.source)).toBeUndefined();expect(f.bindings().status).toBe("unavailable");
  await appendFile(f.file,f.lines([f.event("completed",randomUUID(),f.child,"2026-11-08T00:00:04Z")]));await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);
  await appendFile(f.file,f.lines([f.event("started",randomUUID(),f.child,"2026-11-08T00:00:05Z"),f.event("completed",randomUUID(),f.child,"2026-11-08T00:00:06Z")]));await f.reader.read(f.source);expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).not.toBe(item.entryId);
 }finally{f.history.close();f.reader.close();}
});
it("requires complete EOF and rejects stale namespace/source while keeping unrelated append/relist identity",async()=>{
 const f=await setup();try{
  const text=await readFile(f.file,"utf8");await writeFile(f.file,text.trimEnd());await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);await appendFile(f.file,"\n");await f.reader.read(f.source);const binding=f.bindings().bindings[0]!,first=(await f.history.read({paneId:f.source.paneId})).items[0]!;
  await appendFile(f.file,f.lines([{type:"session.idle"}]));expect(await binding.verify(()=>true)).toBe(false);await f.reader.read(f.source);expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(first.entryId);await f.reader.read(f.source);expect(await binding.verify(()=>true)).toBe(true);
  const before=await lstat(f.file),original=await readFile(f.file,"utf8");await writeFile(f.file,original.replaceAll(f.child,"tool_"+randomUUID()));await utimes(f.file,before.atime,before.mtime);expect(await binding.verify(()=>true)).toBe(false);await f.reader.read(f.source);expect(binding.current()).toBe(false);
  await rename(f.file,f.file+".old");await writeFile(f.file,original);await f.reader.read(f.source);const next=f.bindings().bindings[0]!;expect(next.key).not.toBe(binding.key);expect(f.reader.copilotTerminals({...f.source,instanceId:randomUUID()},()=>true).status).toBe("unavailable");f.valid=false;expect(next.current()).toBe(false);f.valid=true;f.reader.forget(f.source.paneId);expect(next.current()).toBe(false);
 }finally{f.history.close();f.reader.close();}
});
it("bounds private terminal ownership without poisoning existing sequential current counts",async()=>{
 const f=await setup();try{
  const fold=new NativeSubagentRecords("copilot",f.parent);for(let n=0;n<257;n++){const id="call_"+n;fold.consume(f.event("started",randomUUID(),id));fold.consume(f.event("completed",randomUUID(),id));expect(fold.snapshot()).toEqual({count:0,items:[]});}expect(fold.copilotTerminals()).toHaveLength(256);expect(fold.copilotTerminals()?.some(item=>item.id==="call_0")).toBe(false);
 }finally{f.history.close();f.reader.close();}
});
it("keeps physical verification slots through close and rejects late results after fresh proof retires",async()=>{
 const f=await setup();let release=()=>{};try{
  await f.reader.read(f.source);const binding=f.bindings().bindings[0]!,original=(f.reader as any).open.bind(f.reader);let closing=0,opens=0;const gate=new Promise<void>(resolve=>{release=resolve;});const spy=vi.spyOn(f.reader as any,"open").mockImplementation(async(...args:unknown[])=>{const opened=await original(...args);if(opened&&opens++<4){const close=opened.fd.close.bind(opened.fd);opened.fd.close=async()=>{closing++;await gate;await close();};}return opened;});
  const jobs=Array.from({length:4},()=>binding.verify(()=>true));await vi.waitFor(()=>expect(closing).toBe(4));expect(await binding.verify(()=>true)).toBe(false);f.valid=false;release();expect(await Promise.all(jobs)).toEqual([false,false,false,false]);spy.mockRestore();f.valid=true;expect(await binding.verify(()=>true)).toBe(true);
 }finally{release();f.history.close();f.reader.close();}
});
it("fails closed for malformed, ephemeral and backwards terminal records",async()=>{
 const f=await setup();try{
  for(const bad of [{...f.event("completed"),ephemeral:true},{...f.event("completed"),timestamp:"bad"},{...f.event("completed"),data:{}},{...f.event("completed"),id:""}]){const fold=new NativeSubagentRecords("copilot",f.parent);fold.consume(f.event("started"));fold.consume(bad);expect(fold.copilotTerminals()).toBeUndefined();}
  const fold=new NativeSubagentRecords("copilot",f.parent);fold.consume(f.event("started"));fold.consume(f.event("completed",randomUUID(),f.child,"2026-11-07T00:00:00Z"));expect(fold.copilotTerminals()).toEqual([]);
 }finally{f.history.close();f.reader.close();}
});
it.skipIf(!process.geteuid)("does not grant metadata from a foreign-owned parent while preserving current folding",async()=>{
 const f=await setup();try{
  const original=(f.reader as any).open.bind(f.reader);vi.spyOn(f.reader as any,"open").mockImplementation(async(...args:unknown[])=>{const opened=await original(...args);if(opened){const stat=opened.fd.stat.bind(opened.fd);opened.fd.stat=async(options?:{bigint?:boolean})=>{const value=await stat(options);return options?.bigint?Object.assign(value,{uid:BigInt(process.geteuid!()+1)}):value;};}return opened;});
  expect(await f.reader.read(f.source)).toEqual({count:0,items:[]});expect(f.bindings().bindings).toHaveLength(0);expect(f.bindings().status).toBe("unavailable");
 }finally{f.history.close();f.reader.close();}
});
