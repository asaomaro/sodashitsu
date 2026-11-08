import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm,rename,stat,utimes} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {CodexChildObservationCache} from "./CodexChildObservationCache.js";
vi.mock("node:fs/promises",async importOriginal=>{const actual=await importOriginal<typeof import("node:fs/promises")>();return {...actual,lstat:vi.fn(actual.lstat)};});
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const turn=(model:string,effort?:string)=>JSON.stringify({timestamp:"2026-11-08T00:00:01Z",type:"turn_context",payload:{model,effort}})+"\n";
const message=(bytes:number)=>'{"type":"response_item","payload":{"type":"message","content":[{"type":"output_text","text":"'+'x'.repeat(bytes)+'"}]}}\n';
async function fixture(){const home=await mkdtemp(join(tmpdir(),"soda-child-cache-generated-"));dirs.push(home);const parent=randomUUID(),dir=join(home,"sessions","2026","11","08");await mkdir(dir,{recursive:true});const owner={paneId:"p",instanceId:"i",generation:0};const cache=new CodexChildObservationCache();return {home,parent,dir,owner,cache};}
const meta=(parent:string,child:string)=>JSON.stringify({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:parent}}}}})+"\n";
it("continues two 70MiB records to EOF with 4MiB/child and 16MiB/parent budgets",async()=>{
 const f=await fixture(),items=[{id:randomUUID(),startedAt:0},{id:randomUUID(),startedAt:0}];
 for(const item of items)await writeFile(join(f.dir,`rollout-generated-${item.id}.jsonl`),meta(f.parent,item.id)+message(30*1024*1024)+JSON.stringify({type:"world_state",payload:{full:true,state:{generated_context:"x".repeat(67500)}}})+"\n"+turn("actual-model","medium")+message(40*1024*1024));
 const parse=JSON.parse,guard=vi.spyOn(JSON,"parse").mockImplementation((text,...args)=>{if(typeof text==="string"&&text.length>256*1024)throw Error("giant JSON.parse forbidden");return parse(text,...args);});
 let calls=0,known=0;const started=performance.now();
 try{
  for(;calls<30;calls++){const value=await f.cache.read(f.home,f.parent,items,()=>true,f.owner);expect(f.cache.progress().bytes).toBeLessThanOrEqual(16*1024*1024);known=[...value.values()].filter(v=>v.model==="actual-model"&&v.reasoningEffort==="medium").length;if(known===2)break;}
  expect(known).toBe(2);expect(calls+1).toBeLessThanOrEqual(23);expect(f.cache.progress().offsets.every((n,i)=>n===f.cache.progress().targets[i])).toBe(true);
  console.log(JSON.stringify({generated:true,children:2,recordMiB:70,calls:calls+1,impliedPollSeconds:calls*2,elapsedMs:Math.round(performance.now()-started),known,parseBound:256*1024}));
 }finally{guard.mockRestore();f.cache.close();}
},20000);
it("prioritizes appended suffix while prefix is pending and clears missing effort on the same new turn",async()=>{
 const f=await fixture(),child=randomUUID(),item={id:child,startedAt:0},file=join(f.dir,`rollout-generated-${child}.jsonl`);await writeFile(file,meta(f.parent,child)+message(10*1024*1024)+turn("old-model","low")+message(10*1024*1024));
 try{
  expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBeUndefined();
  const next=turn("suffix-model");await appendFile(file,next.slice(0,-1));expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBeUndefined();
  await appendFile(file,"\n");const observed=(await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child);expect(observed).toMatchObject({model:"suffix-model",modelBasis:"turn"});expect(observed).not.toHaveProperty("reasoningEffort");
 }finally{f.cache.close();}
});
it("invalidates replacement, truncation, same-size rewrite, creation floor and scope",async()=>{
 const f=await fixture(),child=randomUUID(),file=join(f.dir,`rollout-generated-${child}.jsonl`),item={id:child,startedAt:0},first=meta(f.parent,child)+turn("old-model","high");await writeFile(file,first);
 try{
  expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBe("old-model");
  const before=await stat(file),fresh=meta(f.parent,child)+turn("new-model");await writeFile(file,fresh.trimEnd()+" ".repeat(first.length-fresh.length)+"\n");await utimes(file,before.atime,before.mtime);
  const rewritten=(await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child);expect(rewritten?.model).toBe("new-model");expect(rewritten).not.toHaveProperty("reasoningEffort");
  await rename(file,file+".old");await writeFile(file,meta(f.parent,child)+turn("replacement","low"));expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBe("replacement");
  await writeFile(file,meta(f.parent,child));expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBeUndefined();
  await writeFile(file,meta(f.parent,child)+turn("inherited","high"));expect((await f.cache.read(f.home,f.parent,[{...item,startedAt:Date.parse("2026-11-08T00:00:02Z")}],()=>true,f.owner)).get(child)?.model).toBeUndefined();
  await appendFile(file,JSON.stringify({type:"future_unknown",payload:{model:"not-authoritative"}})+"\n");expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBeUndefined();
  expect((await f.cache.read(f.home,f.parent,[item],()=>false,f.owner)).size).toBe(0);expect(f.cache.progress().cacheSize).toBe(0);
 }finally{f.cache.close();}
});
it("rotates all 64 children fairly without evicting progress or exceeding cache bounds",async()=>{
 const f=await fixture(),items=Array.from({length:64},()=>({id:randomUUID(),startedAt:0}));
 for(const item of items)await writeFile(join(f.dir,`rollout-generated-${item.id}.jsonl`),meta(f.parent,item.id)+turn("actual","medium"));
 try{
  let known=0;for(let n=0;n<16;n++){const value=await f.cache.read(f.home,f.parent,items,()=>true,f.owner);known=[...value.values()].filter(v=>v.model==="actual").length;expect(known).toBe((n+1)*4);expect(f.cache.progress().cacheSize).toBeLessThanOrEqual(64);expect(f.cache.progress().bytes).toBeLessThanOrEqual(16*1024*1024);}expect(known).toBe(64);
 }finally{f.cache.close();}
});

it("an old cancelled owner never retires the new owner's observation cache",async()=>{
 const f=await fixture(),child=randomUUID(),item={id:child,startedAt:0};await writeFile(join(f.dir,`rollout-generated-${child}.jsonl`),meta(f.parent,child)+turn("current-model","medium"));
 const safe=await import("./safeFile.js"),original=safe.readRange;let release!:()=>void,blocked=false,valid=true;
 const gate=new Promise<void>(resolve=>release=resolve),spy=vi.spyOn(safe,"readRange").mockImplementationOnce(async(fd,offset,length)=>{blocked=true;await gate;return original(fd,offset,length);});
 try{
  const old=f.cache.read(f.home,f.parent,[item],()=>valid,f.owner);await vi.waitFor(()=>expect(blocked).toBe(true));valid=false;
  const next=await f.cache.read(f.home,f.parent,[item],()=>true,{...f.owner,epoch:1});expect(next.get(child)?.model).toBe("current-model");
  release();expect((await old).size).toBe(0);expect(f.cache.progress().cacheSize).toBe(1);
 }finally{release?.();spy.mockRestore();f.cache.close();}
});

it("a timed-out failed open cannot erase the same owner's fresh observation",async()=>{
 const f=await fixture(),child=randomUUID(),item={id:child,startedAt:0};await writeFile(join(f.dir,`rollout-generated-${child}.jsonl`),meta(f.parent,child)+turn("fresh-model","medium"));
 const records=await import("./CodexChildRecord.js");let release!:()=>void,returned=false;
 const gate=new Promise<void>(resolve=>release=resolve),spy=vi.spyOn(records,"openCodexChildRecord").mockImplementationOnce(async()=>{await gate;returned=true;return undefined;});
 try{
  await f.cache.read(f.home,f.parent,[item],()=>true,f.owner);
  expect(returned).toBe(false);
  expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBe("fresh-model");
  release();await vi.waitFor(()=>expect(returned).toBe(true));await new Promise<void>(resolve=>setImmediate(resolve));
  expect(f.cache.progress().cacheSize).toBe(1);
  expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBe("fresh-model");
 }finally{release?.();spy.mockRestore();f.cache.close();}
},6000);
it.each([false,true])("a timed-out initial stat cannot replace a fresh same-owner entry (reject=%s)",async(reject)=>{
 const f=await fixture(),child=randomUUID(),item={id:child,startedAt:0};await writeFile(join(f.dir,`rollout-generated-${child}.jsonl`),meta(f.parent,child)+turn("fresh-model","medium"));
 const records=await import("./CodexChildRecord.js"),original=records.openCodexChildRecord;let release!:()=>void,returned=false;
 const gate=new Promise<void>(resolve=>release=resolve),spy=vi.spyOn(records,"openCodexChildRecord").mockImplementationOnce(async(...args)=>{const opened=await original(...args);if(opened){const stat=opened.fd.stat.bind(opened.fd);vi.spyOn(opened.fd,"stat").mockImplementationOnce(async(...args)=>{const result=await stat(...args);await gate;returned=true;if(reject)throw Error("generated late stat failure");return result;});}return opened;});
 try{await f.cache.read(f.home,f.parent,[item],()=>true,f.owner);expect(returned).toBe(false);expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBe("fresh-model");release();await vi.waitFor(()=>expect(returned).toBe(true));await new Promise<void>(resolve=>setImmediate(resolve));expect(f.cache.progress().known).toBe(1);}finally{release?.();spy.mockRestore();f.cache.close();}
},6000);
it("a timed-out path probe cannot invalidate a newer same-owner append",async()=>{
 const f=await fixture(),child=randomUUID(),item={id:child,startedAt:0},file=join(f.dir,`rollout-generated-${child}.jsonl`);await writeFile(file,meta(f.parent,child)+turn("old-model","low"));await f.cache.read(f.home,f.parent,[item],()=>true,f.owner);
 const fs=await import("node:fs/promises"),original=fs.lstat;let release!:()=>void,returned=false;
 const gate=new Promise<void>(resolve=>release=resolve),spy=vi.spyOn(fs,"lstat").mockImplementationOnce(async(...args)=>{const result=await original(...args);await gate;returned=true;return result;});
 try{await f.cache.read(f.home,f.parent,[item],()=>true,f.owner);expect(returned).toBe(false);await appendFile(file,turn("fresh-model","medium"));expect((await f.cache.read(f.home,f.parent,[item],()=>true,f.owner)).get(child)?.model).toBe("fresh-model");release();await vi.waitFor(()=>expect(returned).toBe(true));await new Promise<void>(resolve=>setImmediate(resolve));expect(f.cache.progress().known).toBe(1);}finally{release?.();spy.mockRestore();f.cache.close();}
},6000);
