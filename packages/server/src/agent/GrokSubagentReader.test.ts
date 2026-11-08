import { afterEach, expect, it,vi } from "vitest";
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink, rename, utimes,truncate } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GrokSubagentReader } from "./GrokSubagentReader.js";
const parent="12345678-1234-4234-8234-123456789012",child="12345678-1234-4234-8234-123456789013";
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
function event(kind:string,index:number,extra:Record<string,unknown>={}){return JSON.stringify({method:"_x.ai/session/update",params:{sessionId:parent,update:{sessionUpdate:kind,subagent_id:child,child_session_id:child,attempt_id:"attempt",...extra},_meta:{eventId:"event-"+index,agentTimestampMs:index*1000}}})+"\n";}
const start=()=>event("subagent_spawned",1,{parent_session_id:parent,model:"resolved-child"});
const finish=()=>event("subagent_finished",2,{status:"completed"});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-grok-native-reader-"));roots.push(root);
 const base=join(root,"sessions",encodeURIComponent("/generated")),dir=join(base,parent);await mkdir(dir,{recursive:true});
 const file=join(dir,"updates.jsonl"),source={paneId:"pane",instanceId:"instance",sessionId:parent},reader=new GrokSubagentReader({grokHome:root});
 return {root,base,dir,file,source,reader};
}
it("reads exact parent lifecycle once, preserves EOF snapshot and observes appended finish",async()=>{
 const f=await fixture();await writeFile(f.file,start());
 expect((await f.reader.read(f.source,()=>true))?.items[0]).toMatchObject({model:"resolved-child",modelBasis:"creation",state:"unknown"});
 expect((await f.reader.read(f.source,()=>true))?.count).toBe(1);
 await appendFile(f.file,finish());expect(await f.reader.read(f.source,()=>true)).toEqual({count:0,countBasis:"alive",items:[]});
 expect((await f.reader.read(f.source,()=>true))?.count).toBe(0);f.reader.close();
});
it("replaces creation with latest exact child session settings as a pair",async()=>{
 const f=await fixture();await writeFile(f.file,start());const dir=join(f.base,child);await mkdir(dir);
 const row=(effort?:string)=>JSON.stringify({method:"_x.ai/session/update",params:{sessionId:child,_meta:{agentTimestampMs:3000},update:{sessionUpdate:"model_changed",model_id:"selected-child",reasoning_effort:effort}}})+"\n";
 await writeFile(join(dir,"updates.jsonl"),row("high"));
 expect((await f.reader.read(f.source,()=>true))?.items[0]).toMatchObject({model:"selected-child",modelBasis:"session",reasoningEffort:"high",reasoningEffortBasis:"session"});
 await appendFile(join(dir,"updates.jsonl"),row());
 const item=(await f.reader.read(f.source,()=>true))?.items[0];expect(item?.model).toBe("selected-child");expect(item?.reasoningEffort).toBeUndefined();f.reader.close();
});
it("does not expose an incomplete prefix, unfinished line or chunk-boundary stale active state",async()=>{
 const f=await fixture(),padding='{"unrelated":"'+"x".repeat(1000)+'"}\n';
 await writeFile(f.file,start()+padding.repeat(Math.ceil(4*1024*1024/padding.length))+finish());
 expect(await f.reader.read(f.source,()=>true)).toBeUndefined();expect(f.reader.progress(f.source)?.pending).toBe(true);
 expect((await f.reader.read(f.source,()=>true))?.count).toBe(0);
 await appendFile(f.file,'{"incomplete":');expect(await f.reader.read(f.source,()=>true)).toBeUndefined();expect(f.reader.progress(f.source)?.pending).toBe(false);f.reader.close();
});
it("refuses unverified scope, retired instances, removed files and symlink leaves",async()=>{
 const f=await fixture();await writeFile(f.file,start());
 expect(await f.reader.read(f.source,()=>false)).toBeUndefined();
 let current=true;const reading=f.reader.read(f.source,()=>current);current=false;expect(await reading).toBeUndefined();
 expect((await f.reader.read(f.source,()=>true))?.count).toBe(1);
 const inFlight=f.reader.read(f.source,()=>true);f.reader.forget(f.source.paneId);expect(await inFlight).toBeUndefined();
 await rename(f.file,f.file+".saved");await symlink(f.file+".saved",f.file);expect(await f.reader.read(f.source,()=>true)).toBeUndefined();f.reader.close();
});
it("resets after rotation/truncation and rejects unsafe oversized line rather than a fake zero",async()=>{
 const f=await fixture();await writeFile(f.file,start());expect((await f.reader.read(f.source,()=>true))?.count).toBe(1);
 await rename(f.file,f.file+".old");await writeFile(f.file,start()+finish());expect((await f.reader.read(f.source,()=>true))?.count).toBe(0);
 await writeFile(f.file,start());expect((await f.reader.read(f.source,()=>true))?.count).toBe(1);
 await writeFile(f.file,'{"huge":"'+"x".repeat(256*1024)+'"}\n');expect(await f.reader.read(f.source,()=>true)).toBeUndefined();f.reader.close();
});
it("does not reuse an EOF fold after an in-place same-size record replacement",async()=>{
 const f=await fixture();await writeFile(f.file,start());expect((await f.reader.read(f.source,()=>true))?.items[0]?.model).toBe("resolved-child");
 const rewritten=start().replace("resolved-child","observed-child");expect(Buffer.byteLength(rewritten)).toBe(Buffer.byteLength(start()));
 await writeFile(f.file,rewritten);await utimes(f.file,new Date(),new Date(Date.now()+1000));
 expect((await f.reader.read(f.source,()=>true))?.items[0]?.model).toBe("observed-child");f.reader.close();
});
it("recovers after an initially invalid oversized line is shortened in place to a normal record",async()=>{
 const f=await fixture();await writeFile(f.file,'{"bad":"'+"x".repeat(256*1024)+'"}\n');
 expect(await f.reader.read(f.source,()=>true)).toBeUndefined();
 await writeFile(f.file,start());expect((await f.reader.read(f.source,()=>true))?.count).toBe(1);f.reader.close();
});
it("grants a terminal attempt only from a fresh EOF namespace and rechecks parent proof around child records",async()=>{
 const f=await fixture();await writeFile(f.file,start()+finish());const dir=join(f.base,child);await mkdir(dir);await writeFile(join(dir,"chat_history.jsonl"),JSON.stringify({type:"assistant",content:"Generated child result"})+"\n");await writeFile(join(dir,"usage.json"),JSON.stringify({sessionId:child}));
 try{
  expect(f.reader.terminals(f.source,()=>true).status).toBe("unavailable");await f.reader.read(f.source,()=>true);
  const result=f.reader.terminals(f.source,()=>true);expect(result).toMatchObject({status:"ok",bindings:[{kind:"grok",item:{terminalStatus:"completed",startedAt:1000,endedAt:2000}}]});const target=result.bindings[0]!;
  expect(await target.verify(()=>true)).toBe(true);const text=await target.openRecord("transcript",()=>true);expect(text).toBeDefined();expect(await text?.unchanged()).toBe(true);await text?.fd.close();const ledger=await target.openRecord("usage",()=>true);expect(ledger).toBeDefined();await ledger?.fd.close();
  await appendFile(f.file,event("subagent_spawned",3,{parent_session_id:parent,attempt_id:"new-attempt",model:"resolved-child"}));expect(await target.verify(()=>true)).toBe(false);expect(await target.openRecord("transcript",()=>true)).toBeUndefined();
  await f.reader.read(f.source,()=>true);expect(target.current()).toBe(false);expect(f.reader.terminals(f.source,()=>true).bindings).toEqual([]);
  await appendFile(f.file,event("subagent_finished",4,{attempt_id:"new-attempt",status:"completed"}));await f.reader.read(f.source,()=>true);expect(f.reader.terminals(f.source,()=>true).bindings[0]?.key).not.toBe(target.key);
 }finally{f.reader.close();}
});
it.each(["forget","rotate","rewrite"])("invalidates an old terminal namespace after %s even with identical lifecycle bytes",async mode=>{
 const f=await fixture();await writeFile(f.file,start()+finish());try{
  await f.reader.read(f.source,()=>true);const old=f.reader.terminals(f.source,()=>true).bindings[0]!;
  if(mode==="forget")f.reader.forget(f.source.paneId);else if(mode==="rotate"){await rename(f.file,f.file+".old");await writeFile(f.file,start()+finish());}else{await writeFile(f.file,start()+finish());await utimes(f.file,new Date(),new Date(Date.now()+1000));}
  if(mode!=="forget")expect(await old.verify(()=>true)).toBe(false);
  await f.reader.read(f.source,()=>true);const next=f.reader.terminals(f.source,()=>true).bindings[0]!;expect(next.key).not.toBe(old.key);expect(old.current()).toBe(false);expect(await old.verify(()=>true)).toBe(false);expect(await next.verify(()=>true)).toBe(true);
 }finally{f.reader.close();}
});
it("fails closed on partial parents, missing attempts, changed scope and child symlinks",async()=>{
 const f=await fixture();await writeFile(f.file,start()+finish());const dir=join(f.base,child);await mkdir(dir);const outside=join(f.root,"generated-outside");await writeFile(outside,"{}\n");await symlink(outside,join(dir,"chat_history.jsonl"));
 try{
  await f.reader.read(f.source,()=>true);let allowed=true;const old=f.reader.terminals(f.source,()=>allowed).bindings[0]!;expect(await old.openRecord("transcript",()=>true)).toBeUndefined();
  allowed=false;expect(old.current()).toBe(false);expect(await old.verify(()=>true)).toBe(false);expect(f.reader.terminals({...f.source,instanceId:"other"},()=>true).status).toBe("unavailable");allowed=true;
  await appendFile(f.file,'{"incomplete":');await f.reader.read(f.source,()=>true);expect(f.reader.terminals(f.source,()=>true).status).toBe("pending");expect(await old.verify(()=>true)).toBe(false);
 }finally{f.reader.close();}
});

it("bounds physical attempt verifiers until their actual parent handles close and rejects late owner changes",async()=>{
 const f=await fixture();await writeFile(f.file,start()+finish());let verified=true;
 try{
  await f.reader.read(f.source,()=>true);const target=f.reader.terminals(f.source,()=>verified).bindings[0]!,original=Reflect.get(f.reader,"open").bind(f.reader),release:Array<()=>Promise<void>>=[];
  const spy=vi.spyOn(f.reader as any,"open").mockImplementation(()=>new Promise(resolve=>{release.push(async()=>resolve(await original(parent)));}));
  try{
   const calls=Array.from({length:4},()=>target.verify(()=>true));expect(release).toHaveLength(4);expect(await target.verify(()=>true)).toBe(false);verified=false;
   await Promise.all(release.map(finish=>finish()));expect(await Promise.all(calls)).toEqual([false,false,false,false]);expect(Reflect.get(f.reader,"proofSlots")).toBe(0);
  }finally{spy.mockRestore();}
 }finally{f.reader.close();}
});
it("refuses over-limit child files without reading their body",async()=>{
 const f=await fixture();await writeFile(f.file,start()+finish());const dir=join(f.base,child);await mkdir(dir);const file=join(dir,"chat_history.jsonl");await writeFile(file,"");await truncate(file,512*1024*1024+1);
 try{await f.reader.read(f.source,()=>true);const target=f.reader.terminals(f.source,()=>true).bindings[0]!;expect(await target.openRecord("transcript",()=>true)).toBeUndefined();}finally{f.reader.close();}
});
