import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm,rename,utimes,lstat} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";import {randomUUID} from "node:crypto";
import type {Pane} from "@sodashitsu/protocol";
import {NativeSubagentRecords} from "./NativeSubagentRecords.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import {SubagentHistoryService} from "./SubagentHistoryService.js";
const dirs:string[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const born="2026-11-08T00:00:00Z",ended="2026-11-08T00:00:02Z";
async function setup(){
 const home=await mkdtemp(join(tmpdir(),"soda-codex-terminal-"));dirs.push(home);const cwd=join(home,"work");await mkdir(cwd);
 const parent=randomUUID(),child=randomUUID(),paneId=randomUUID(),instanceId=randomUUID(),dir=join(home,"sessions","2026","11","08");await mkdir(dir,{recursive:true});
 const file=join(dir,`rollout-generated-${parent}.jsonl`),childFile=join(dir,`rollout-generated-${child}.jsonl`);
 const head=(id=parent,path=cwd)=>({type:"session_meta",payload:{id,cwd:path}});
 const event=(kind:string,id=kind,thread=parent,time=kind==="started"?born:ended)=>({type:"event_msg",timestamp:time,payload:{type:"item_completed",thread_id:thread,item:{type:"SubAgentActivity",id,agent_thread_id:child,kind,agent_path:"generated-child",model:"creation-only"}}});
 const lines=(rows:unknown[])=>rows.map(row=>JSON.stringify(row)).join("\n")+"\n";
 await writeFile(file,lines([head(),event("started"),event("completed")]));
 await writeFile(childFile,lines([{type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:parent}}}}},{type:"response_item",timestamp:ended,payload:{type:"message",role:"assistant",content:[{type:"output_text",text:"Generated public child result"}]}},{type:"token_usage_record",timestamp:ended,payload:{thread_id:child,response_id:"owned-response",usage:{input_tokens:100,cached_input_tokens:30,output_tokens:20,reasoning_output_tokens:5,total_tokens:120},thread_token_usage:{total_tokens:999999}}}]));
 let valid=true;const source={paneId,instanceId,kind:"codex" as const,sessionId:parent};
 const reader=new NativeSubagentReader({codexHome:home},async()=>new Map());
 const pane={id:paneId,cwd,agent:{instanceId,kind:"codex",state:"idle",verified:true},agentSession:{kind:"codex",sessionId:parent}} as unknown as Pane;
 const session={getPane:()=>pane,hasVerifiedAgentSession:()=>valid};
 const bindings=()=>reader.codexTerminals(source,()=>valid,cwd);
 const history=new SubagentHistoryService({session,collect:()=>bindings()});
 return {home,cwd,parent,child,file,childFile,head,event,lines,source,reader,history,bindings,pane,set valid(value:boolean){valid=value;}};
}
it("keeps only formally owned terminal facts and never adds them to current counts",()=>{
 const parent=randomUUID(),child=randomUUID(),fold=new NativeSubagentRecords("codex",parent);
 const row=(kind:string,id:string,thread=parent)=>({type:"event_msg",timestamp:kind==="started"?born:ended,payload:{type:"item_completed",thread_id:thread,item:{type:"SubAgentActivity",id,agent_thread_id:child,kind}}});
 fold.consume(row("completed","unowned"));expect(fold.codexTerminals()).toEqual([]);fold.consume(row("started","foreign",randomUUID()));fold.consume(row("interrupted","no-start"));expect(fold.codexTerminals()).toEqual([]);
 fold.consume(row("started","own"));fold.consume(row("interrupted","aborted"));expect(fold.snapshot()).toEqual({count:0,items:[]});expect(fold.codexTerminals()).toMatchObject([{terminalStatus:"aborted",startedAt:Date.parse(born),endedAt:Date.parse(ended)}]);
 fold.consume(row("future-kind","unknown"));expect(fold.codexTerminals()).toEqual([]);fold.consume(row("completed","after-unknown"));expect(fold.codexTerminals()).toEqual([]);
});
it("serves exact-entry child history and child-only usage while current count stays zero",async()=>{
 const f=await setup();try{
  expect(await f.reader.read(f.source)).toEqual({count:0,items:[]});const page=await f.history.read({paneId:f.source.paneId});expect(page.items).toHaveLength(1);const item=page.items[0]!;
  expect(item).toMatchObject({id:f.child,terminalStatus:"completed",startedAt:Date.parse(born),endedAt:Date.parse(ended)});expect(item).not.toHaveProperty("model");expect(item).not.toHaveProperty("reasoningEffort");
  const selected={paneId:f.source.paneId,agentId:f.child,entryId:item.entryId};expect((await f.history.transcript(selected)).entries).toMatchObject([{kind:"say",text:"Generated public child result"}]);
  expect((await f.history.usageRead(selected)).usage).toMatchObject({consumptionScope:"self",tokens:{total:120}});expect(await f.history.usageRead({...selected,entryId:randomUUID()})).not.toHaveProperty("usage");
  const next=await f.history.read({paneId:f.source.paneId});expect(next.items[0]?.entryId).toBe(item.entryId);expect(await f.reader.read(f.source)).toEqual({count:0,items:[]});
 }finally{f.history.close();f.reader.close();}
});
it("rejects a followup before catchup and retires its old selection after catchup",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const item=(await f.history.read({paneId:f.source.paneId})).items[0]!;const selected={paneId:f.source.paneId,agentId:f.child,entryId:item.entryId};
  await appendFile(f.file,f.lines([f.event("interacted","followup")]));expect((await f.history.transcript(selected)).status).toBe("unreadable");
  expect((await f.reader.read(f.source))?.count).toBe(1);expect(f.bindings().bindings).toHaveLength(0);expect((await f.history.transcript(selected)).status).toBe("unreadable");
  await appendFile(f.file,f.lines([f.event("completed","new-terminal")]));expect((await f.reader.read(f.source))?.count).toBe(0);const fresh=(await f.history.read({paneId:f.source.paneId})).items[0]!;expect(fresh.entryId).not.toBe(item.entryId);expect(await f.history.usageRead(selected)).not.toHaveProperty("usage");
 }finally{f.history.close();f.reader.close();}
});
it("keeps a same terminal selection across an unrelated append and an unchanged EOF poll",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const binding=f.bindings().bindings[0]!;const first=(await f.history.read({paneId:f.source.paneId})).items[0]!;
  await appendFile(f.file,f.lines([{type:"event_msg",payload:{type:"token_count"}}]));expect(await binding.verify(()=>true)).toBe(false);
  await f.reader.read(f.source);expect(await binding.verify(()=>true)).toBe(true);expect((await f.history.read({paneId:f.source.paneId})).items[0]?.entryId).toBe(first.entryId);
  await f.reader.read(f.source);expect(binding.current()).toBe(true);expect(await binding.verify(()=>true)).toBe(true);
 }finally{f.history.close();f.reader.close();}
});
it("refolds a same-size rewrite and rejects old namespaces after rotation or forget",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const binding=f.bindings().bindings[0]!,before=await lstat(f.file);const original=await import("node:fs/promises").then(fs=>fs.readFile(f.file,"utf8"));
  await writeFile(f.file,original.replaceAll(f.parent,randomUUID()));await utimes(f.file,before.atime,before.mtime);expect(await binding.verify(()=>true)).toBe(false);await f.reader.read(f.source);expect(binding.current()).toBe(false);expect(f.bindings().bindings).toHaveLength(0);
  await rename(f.file,f.file+".old");await writeFile(f.file,original);await f.reader.read(f.source);const next=f.bindings().bindings[0]!;expect(next.key).not.toBe(binding.key);
  f.reader.forget(f.source.paneId);expect(next.current()).toBe(false);expect(f.bindings().status).toBe("unavailable");
 }finally{f.history.close();f.reader.close();}
});
it("requires complete EOF, matching parent cwd/header, fresh owner and the child's exact relation",async()=>{
 const f=await setup();try{
  await writeFile(f.file,JSON.stringify(f.head())+"\n"+JSON.stringify(f.event("started"))+"\n"+JSON.stringify(f.event("completed")));
  expect(await f.reader.read(f.source)).toBeUndefined();expect(f.bindings().bindings).toHaveLength(0);await appendFile(f.file,"\n");await f.reader.read(f.source);const binding=f.bindings().bindings[0]!;
  expect(f.reader.codexTerminals(f.source,()=>true,join(f.cwd,"wrong")).bindings).toHaveLength(0);f.valid=false;expect(binding.current()).toBe(false);f.valid=true;
  await writeFile(f.childFile,JSON.stringify({type:"session_meta",payload:{id:f.child,source:{subagent:{thread_spawn:{parent_thread_id:randomUUID()}}}}})+"\n");expect(await binding.openRecord("transcript",()=>true)).toBeUndefined();
 }finally{f.history.close();f.reader.close();}
});

it("holds four physical verification slots through FD close and rejects late retired results",async()=>{
 const f=await setup();try{
  await f.reader.read(f.source);const binding=f.bindings().bindings[0]!;
  const original=(f.reader as any).open.bind(f.reader);let closing=0,opens=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const spy=vi.spyOn(f.reader as any,"open").mockImplementation(async(...args:unknown[])=>{const value=await original(...args);if(value&&opens++<4){const close=value.fd.close.bind(value.fd);value.fd.close=async()=>{closing++;await gate;await close();};}return value;});
  const jobs=Array.from({length:4},()=>binding.verify(()=>true));await vi.waitFor(()=>expect(closing).toBe(4));
  expect(await binding.verify(()=>true)).toBe(false);f.reader.forget(f.source.paneId);release();expect(await Promise.all(jobs)).toEqual([false,false,false,false]);spy.mockRestore();
  await f.reader.read(f.source);const next=f.bindings().bindings[0]!;expect(await next.verify(()=>true)).toBe(true);expect(await next.verify(()=>false)).toBe(false);
 }finally{f.history.close();f.reader.close();}
});
it("does not accept a later session header after a scalar first record or a missing terminal timestamp",async()=>{
 const f=await setup();try{
  await writeFile(f.file,f.lines([false,f.head(),f.event("started"),f.event("completed")]));await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);
  await rename(f.file,f.file+".scalar");await writeFile(f.file,f.lines([{type:"response_item",payload:{type:"message",content:"x".repeat(300000)}},f.head(),f.event("started"),f.event("completed")]));await f.reader.read(f.source);expect(f.bindings().bindings).toHaveLength(0);
  await rename(f.file,f.file+".oversize");const terminal=f.event("completed") as any;delete terminal.timestamp;await writeFile(f.file,f.lines([f.head(),f.event("started"),terminal]));expect(await f.reader.read(f.source)).toBeUndefined();expect(f.bindings().bindings).toHaveLength(0);
 }finally{f.history.close();f.reader.close();}
});

it("publishes only after incremental large-parent EOF and never restarts an unchanged cold scan",async()=>{
 const f=await setup();try{
  await writeFile(f.file,f.lines([f.head(),f.event("started"),{type:"response_item",payload:{type:"message",content:"x".repeat(9*1024*1024)}},f.event("completed")]));
  let previous=0,calls=0;do{const value=await f.reader.read(f.source);const progress=f.reader.progress(f.source)!;expect(progress.offset).toBeGreaterThan(previous);expect(progress.offset-previous).toBeLessThanOrEqual(4*1024*1024);previous=progress.offset;calls++;if(progress.pending){expect(value).toBeUndefined();expect(f.bindings().bindings).toHaveLength(0);}else break;}while(calls<4);
  expect(calls).toBe(3);expect(f.bindings().bindings).toHaveLength(1);const position=f.reader.progress(f.source)!;await f.reader.read(f.source);expect(f.reader.progress(f.source)).toEqual(position);expect((await f.history.read({paneId:f.source.paneId})).items).toHaveLength(1);
 }finally{f.history.close();f.reader.close();}
});
