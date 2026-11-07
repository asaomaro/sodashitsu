import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink, rename, utimes } from "node:fs/promises";
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
