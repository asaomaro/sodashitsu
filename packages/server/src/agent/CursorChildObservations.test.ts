import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm,appendFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {afterEach,expect,it,vi} from "vitest";
import type {Pane} from "@sodashitsu/protocol";
import {CursorChildRecords,type CursorChildRecord} from "./CursorChildRecord.js";
import {CursorChildObservations} from "./CursorChildObservations.js";
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close();});
function owner(){
 const parent=randomUUID(),child=randomUUID(),pane={id:randomUUID(),agent:{kind:"cursor",instanceId:randomUUID()},agentSession:{kind:"cursor",sessionId:parent}} as Pane;
 let verified=true,pid=true;
 const session={getPane:(id:string)=>id===pane.id?pane:undefined,hasVerifiedAgentSession:()=>verified,usageReportVerdict:()=>({verdict:pid?"accept" as const:"reject" as const})};
 const observation=(extra:Record<string,unknown>={})=>({type:"cursor_child",phase:"observation",kind:"cursor",paneId:pane.id,sessionId:child,childId:child,contextSessionId:child,generationId:"generation-1",model:"child-observed",reasoningEffort:"high",...extra});
 const stop=(extra:Record<string,unknown>={})=>({type:"cursor_child",phase:"stop",kind:"cursor",paneId:pane.id,sessionId:parent,parentId:parent,childId:child,contextSessionId:parent,logicalId:"logical-task",childType:"Explore",status:"completed",...extra});
 return{parent,child,pane,session,observation,stop,verified:(v:boolean)=>verified=v,pid:(v:boolean)=>pid=v};
}
async function fixture(){
 const f=owner(),root=await mkdtemp(join(tmpdir(),"soda-cursor-private-observation-")),config=join(root,"config"),data=join(root,"data"),group=join(config,"chats",createHash("md5").update("/generated/project").digest("hex"));
 const db=(file:string,value:unknown)=>{const sql=new DatabaseSync(file);try{sql.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);");sql.prepare("INSERT INTO meta VALUES ('0',?)").run(Buffer.from(JSON.stringify(value)).toString("hex"));}finally{sql.close();}};
 const parentDb=join(group,f.parent,"store.db"),childDb=join(group,f.child,"store.db"),parentFile=join(data,"projects","generated","agent-transcripts",f.parent,`${f.parent}.jsonl`),childFile=join(dirname(parentFile),"subagents",`${f.child}.jsonl`);
 for(const path of[parentDb,childDb,parentFile,childFile])await mkdir(dirname(path),{recursive:true});
 db(parentDb,{agentId:f.parent,createdAt:1});db(childDb,{agentId:f.child,createdAt:1000,subagentInfo:{parentAgentId:f.parent,rootParentAgentId:f.parent,toolCallId:"generated-tool",typeName:"Explore"},lastUsedModel:"parent-fallback-forbidden"});
 await writeFile(parentFile,'{"role":"user","message":{"content":[]}}\n');await writeFile(childFile,'{"role":"assistant","message":{"content":[]}}\n{"type":"turn_ended","status":"success"}\n');
 const controller=new CursorChildObservations({session:f.session,records:new CursorChildRecords({home:root,cursorConfigHome:config,cursorDataHome:data})});
 cleanups.push(async()=>{controller.close();await rm(root,{recursive:true,force:true});});return{...f,controller,childFile};
}
it("stores only exact child-self settings privately without manufacturing current membership or using DB fallback",async()=>{
 const f=await fixture();f.controller.offer(f.observation({sessionId:f.parent,childId:f.parent,contextSessionId:f.parent,generationId:"parent",model:"parent"}));expect(f.controller.binding(f.pane.id,f.parent)).toBeUndefined();
 f.controller.offer(f.observation());await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)?.settings).toEqual({model:"child-observed",modelBasis:"session",reasoningEffort:"high",reasoningEffortBasis:"session"}),{timeout:3000});
 expect(f.pane.agent).not.toHaveProperty("subagents");expect(f.controller.terminals(f.pane.id)).toMatchObject({items:[],incomplete:true});
 f.controller.offer(f.observation({generationId:"generation-2",model:"child-next",reasoningEffort:undefined}));await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)?.settings).toEqual({model:"child-next",modelBasis:"session"}),{timeout:3000});
 f.controller.offer(f.observation({generationId:"generation-3",model:undefined,reasoningEffort:undefined}));await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)?.settings).toEqual({}),{timeout:3000});
});
it("requires Stop plus exact DB/type/terminal proof and never clears a child observation from parent-common fields",async()=>{
 const f=await fixture();f.controller.offer(f.observation());await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)).toBeDefined(),{timeout:3000});
 const old=f.controller.binding(f.pane.id,f.child)!;
 f.controller.offer(f.stop({model:"parent-model",reasoningEffort:"low"}));await vi.waitFor(()=>expect(f.controller.terminals(f.pane.id).items).toHaveLength(1),{timeout:3000});
 const binding=f.controller.binding(f.pane.id,f.child)!;expect(binding).toMatchObject({terminal:"completed",lineage:{createdAt:1000},settings:{model:"child-observed",reasoningEffort:"high"}});expect(old.current()).toBe(false);
 let allowed=true;const opened=await binding.openRecord(()=>allowed);expect(opened).toBeDefined();allowed=false;expect(await opened?.unchanged()).toBe(false);await opened?.fd.close();expect(await binding.openRecord(()=>false)).toBeUndefined();
 f.controller.offer(f.observation({generationId:"late",model:"late-result"}));await new Promise(r=>setTimeout(r,100));expect(f.controller.binding(f.pane.id,f.child)?.settings.model).toBe("child-observed");
 await appendFile(f.childFile,'{"role":"user","message":{"content":[]}}\n');expect(await binding.openRecord()).toBeUndefined();f.controller.forget(f.pane.id);expect(binding.current()).toBe(false);
});
it("retires an old terminal proof when a new child-file revision has a fresh self observation, without inferring alive state",async()=>{
 const f=await fixture();f.controller.offer(f.observation());f.controller.offer(f.stop());
 await vi.waitFor(()=>expect(f.controller.terminals(f.pane.id).items).toHaveLength(1),{timeout:3000});const old=f.controller.terminals(f.pane.id).items[0]!;
 await appendFile(f.childFile,'{"role":"user","message":{"content":[]}}\n{"role":"assistant","message":{"content":[]}}\n{"type":"turn_ended","status":"success"}\n');
 f.controller.offer(f.observation({generationId:"next-generation",model:"new-self-model",reasoningEffort:undefined}));
 await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)?.settings).toEqual({model:"new-self-model",modelBasis:"session"}),{timeout:3000});
 expect(old.current()).toBe(false);expect(f.controller.terminals(f.pane.id).items).toEqual([]);expect(f.pane.agent).not.toHaveProperty("subagents");
 f.controller.offer(f.stop());await vi.waitFor(()=>expect(f.controller.terminals(f.pane.id).items).toHaveLength(1),{timeout:3000});
 expect(f.controller.terminals(f.pane.id).items[0]?.settings).toEqual({model:"new-self-model",modelBasis:"session"});
 expect(f.controller.terminals(f.pane.id).items[0]?.key).not.toBe(old.key);
});
it.each(["parent","refkind","instance","verified","pid"])("rejects changed %s owner before private data is returned",async change=>{
 const f=await fixture();f.controller.offer(f.observation());await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)).toBeDefined(),{timeout:3000});const b=f.controller.binding(f.pane.id,f.child)!;
 if(change==="parent")f.pane.agentSession!.sessionId=randomUUID();if(change==="refkind")f.pane.agentSession!.kind="codex";if(change==="instance")f.pane.agent!.instanceId=randomUUID();if(change==="verified")f.verified(false);if(change==="pid")f.pid(false);
 expect(b.current()).toBe(false);expect(await b.openRecord()).toBeUndefined();expect(f.controller.binding(f.pane.id,f.child)).toBeUndefined();expect(f.controller.terminals(f.pane.id)).toMatchObject({status:"unavailable",incomplete:true});
});
function fakeRecord(f:ReturnType<typeof owner>,closed:()=>void,terminal?:"completed"):CursorChildRecord{
 return {lineage:{id:f.child,parentId:f.parent,rootParentId:f.parent,toolCallId:"tool",type:"Explore",createdAt:1000},...(terminal?{terminal}:{}),fd:{stat:async()=>({dev:1n,ino:2n,size:3n,mtimeNs:4n,ctimeNs:5n}),close:async()=>closed()},unchanged:async()=>true} as unknown as CursorChildRecord;
}
it.each(["close","expiry"])("bounds receipt queue and physical jobs and discards late results on %s",async mode=>{
 const f=owner(),finish:Array<(v:CursorChildRecord)=>void>=[];let closed=0,now=0;
 const records={open:vi.fn(()=>new Promise<CursorChildRecord>(resolve=>finish.push(resolve))),close:vi.fn()};const c=new CursorChildObservations({session:f.session,records,now:()=>now});
 try{
 for(let n=0;n<1000;n++)c.offer(f.observation({childId:randomUUID(),sessionId:undefined})); // malformed cannot reserve resources
 for(let n=0;n<1000;n++){const id=randomUUID();c.offer(f.observation({childId:id,sessionId:id,contextSessionId:id}));}
 expect(records.open).toHaveBeenCalledTimes(2);expect((Reflect.get(c,"queue") as unknown[]).length).toBeLessThanOrEqual(64);
 const state=(Reflect.get(c,"states") as Map<string,{slots:Map<string,{binding?:unknown}>}>).get(f.pane.id)!,retired=[...state.slots.values()];
 if(mode==="close")c.close();else now=6000;
 finish.forEach(resolve=>resolve(fakeRecord(f,()=>closed++)));await vi.waitFor(()=>expect(closed).toBe(2));expect(retired.every(slot=>slot.binding===undefined)).toBe(true);expect(c.binding(f.pane.id,f.child)).toBeUndefined();
 }finally{c.close();}expect(records.close).toHaveBeenCalledOnce();
});
it("rejects duplicate generation conflicts and never restores the old settings from a replay",async()=>{
 const f=await fixture();f.controller.offer(f.observation());await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)).toBeDefined(),{timeout:3000});
 f.controller.offer(f.observation({model:"conflicting"}));await vi.waitFor(()=>expect(f.controller.binding(f.pane.id,f.child)).toBeUndefined(),{timeout:3000});
 f.controller.offer(f.observation());await new Promise(r=>setTimeout(r,100));expect(f.controller.binding(f.pane.id,f.child)).toBeUndefined();expect(f.pane.agent).not.toHaveProperty("subagents");
});
it.each(["type","status"])("does not create a terminal binding from mismatched Stop %s",async field=>{
 const f=await fixture();f.controller.offer(f.stop(field==="type"?{childType:"Different"}:{status:"error"}));
 await vi.waitFor(()=>expect(Reflect.get(f.controller,"active")).toBe(0),{timeout:3000});expect(f.controller.terminals(f.pane.id).items).toEqual([]);expect(f.controller.binding(f.pane.id,f.child)).toBeUndefined();
});
it("does not let an older asynchronous observation overwrite the newer child settings",async()=>{
 const f=owner();let finish!:(record:CursorChildRecord)=>void,closed=0,calls=0;
 const records={open:()=>++calls===1?new Promise<CursorChildRecord>(resolve=>finish=resolve):Promise.resolve(fakeRecord(f,()=>closed++)),close:()=>{}};
 const c=new CursorChildObservations({session:f.session,records});
 try{
  c.offer(f.observation());c.offer(f.observation({generationId:"newer",model:"newer-observed"}));
  expect(calls).toBe(1);finish(fakeRecord(f,()=>closed++));
  await vi.waitFor(()=>expect(c.binding(f.pane.id,f.child)?.settings.model).toBe("newer-observed"));
  await vi.waitFor(()=>expect(closed).toBe(2));expect(c.binding(f.pane.id,f.child)?.settings.model).toBe("newer-observed");
 }finally{c.close();}
});
it("serializes an immediate same-child Stop after its slow AAR proof without losing observed settings",async()=>{
 const f=owner();let finish!:(record:CursorChildRecord)=>void,calls=0;
 const records={open:()=>++calls===1?new Promise<CursorChildRecord>(resolve=>finish=resolve):Promise.resolve(fakeRecord(f,()=>{},"completed")),close:()=>{}};
 const c=new CursorChildObservations({session:f.session,records});
 try{
  c.offer(f.observation());c.offer(f.stop());for(let i=0;i<20;i++)await Promise.resolve();
  finish(fakeRecord(f,()=>{},"completed"));await vi.waitFor(()=>expect(c.terminals(f.pane.id).items).toHaveLength(1));
  expect(c.terminals(f.pane.id).items[0]?.settings).toEqual({model:"child-observed",modelBasis:"session",reasoningEffort:"high",reasoningEffortBasis:"session"});
 }finally{c.close();}
});
it("bounds deduplication to fixed digests and becomes incomplete instead of evicting IDs into a replay window",async()=>{
 const f=owner(),records={open:async()=>fakeRecord(f,()=>{}),close:()=>{}},c=new CursorChildObservations({session:f.session,records});
 try{
  const settle=async()=>{for(let i=0;i<50&&Reflect.get(c,"active")>0;i++)await Promise.resolve();expect(Reflect.get(c,"active")).toBe(0);};
  for(let i=0;i<=4096;i++){c.offer(f.observation({generationId:`generation-${i}`,model:`model-${i}`,ignoredOutput:"x".repeat(300)}));await settle();}
  const state=(Reflect.get(c,"states") as Map<string,{events:Map<string,{hash:string}>}>).get(f.pane.id)!;
  expect(state.events.size).toBe(4096);expect([...state.events.values()].every(v=>v.hash.length===64)).toBe(true);
  expect(c.binding(f.pane.id,f.child)).toMatchObject({settings:{},incomplete:true});c.offer(f.observation());await settle();expect(c.binding(f.pane.id,f.child)?.settings).toEqual({});
  c.forget(f.pane.id);expect(state.events.size).toBe(0);
 }finally{c.close();}
},5000);
