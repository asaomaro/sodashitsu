import {afterEach,expect,it,vi} from "vitest";
import type {Pane,SubagentHistoryItem} from "@sodashitsu/protocol";
import {SubagentTerminalHistory} from "./SubagentTerminalHistory.js";
const paneId="12345678-1234-4234-8234-123456789012",parent="12345678-1234-4234-8234-123456789013",instance="12345678-1234-4234-8234-123456789014";
function fixture(){
 let pane:Pane={id:paneId,tabId:"12345678-1234-4234-8234-123456789011",label:"Generated",cwd:"/generated",shell:"node",cols:80,rows:24,status:"running",failure:null,busy:false,title:"Generated",rightClick:"pane",agent:{instanceId:instance,kind:"cursor",label:"Cursor",state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1,subagents:{count:2,items:[]}},agentSession:{kind:"cursor",sessionId:parent,reportedAt:1}},verified=true;
 const history=new SubagentTerminalHistory({getPane:()=>pane,hasVerifiedAgentSession:()=>verified});
 return{history,source:history.source(paneId)!,get pane(){return pane;},set pane(p:Pane){pane=p;},set verified(v:boolean){verified=v;}};
}
const item=(id="child"):Omit<SubagentHistoryItem,"entryId">=>({id,terminalStatus:"completed",startedAt:1000,hasTranscript:true});
afterEach(()=>vi.useRealTimers());
it("keeps unknown history distinct from a known empty collection and never changes active counts",async()=>{
 const f=fixture(),before=structuredClone(f.pane.agent?.subagents);
 expect(await f.history.read({paneId})).toMatchObject({status:"unavailable",items:[],incomplete:true});
 f.history.mark(f.source,"ok",false);expect(await f.history.read({paneId})).toMatchObject({status:"ok",items:[],incomplete:false});
 f.history.note(f.source,item(),"formal-stop",async()=>true);
 expect((await f.history.read({paneId})).items).toMatchObject([item()]);expect(f.pane.agent?.subagents).toEqual(before);f.history.close();
});
it("compares only exact source identity fields, independent of property order, and retains no extra source payload",async()=>{
 const f=fixture(),reordered={sessionId:f.source.sessionId,kind:f.source.kind,instanceId:f.source.instanceId,paneId:f.source.paneId,unused:"x".repeat(200000)};
 expect(f.history.note(reordered,item(),"event",async()=>true)).toBe(true);
 expect((await f.history.read({paneId})).items).toMatchObject([item()]);
 const stored=(f.history as unknown as {states:Map<string,{source:unknown}>}).states.get(paneId)?.source;
 expect(stored).toEqual(f.source);expect(stored).not.toHaveProperty("unused");f.history.close();
});
it("requires current verified parent instance/ref kind/session before accepting or returning notes",async()=>{
 const f=fixture();f.verified=false;expect(f.history.note(f.source,item(),"stop",async()=>true)).toBe(false);
 f.verified=true;expect(f.history.note(f.source,item(),"stop",async()=>true)).toBe(true);
 f.pane={...f.pane,agentSession:{kind:"codex",sessionId:parent,reportedAt:1}};expect((await f.history.read({paneId})).status).toBe("unavailable");
 f.pane={...f.pane,agent:{...f.pane.agent!,instanceId:"12345678-1234-4234-8234-123456789015"},agentSession:{kind:"cursor",sessionId:parent,reportedAt:1}};
 expect(f.history.note(f.source,item("other"),"late",async()=>true)).toBe(false);expect((await f.history.read({paneId})).items).toEqual([]);f.history.close();
});
it("rechecks exact parent and authorization after an asynchronous record proof",async()=>{
 const f=fixture();let resolve!:(value:boolean)=>void;f.history.note(f.source,item(),"stop",()=>new Promise(done=>{resolve=done;}));
 const pending=f.history.read({paneId});f.pane={...f.pane,agentSession:{kind:"cursor",sessionId:"12345678-1234-4234-8234-123456789016",reportedAt:1}};resolve(true);
 expect(await pending).toMatchObject({status:"unavailable",items:[],reset:true});f.history.close();
});
it("does not turn failed owned-record verification into an empty successful history",async()=>{
 const f=fixture();f.history.note(f.source,item(),"stop",async()=>false);expect(await f.history.read({paneId})).toMatchObject({status:"pending",items:[],incomplete:true});f.history.close();
});
it("uses bounded pages, collection revisions and explicit omission when older entries overflow",async()=>{
 const f=fixture();for(let i=0;i<257;i++)f.history.note(f.source,item("child-"+i),"event-"+i,async()=>true);
 const first=await f.history.read({paneId,limit:2});expect(first.items.map(i=>i.id)).toEqual(["child-256","child-255"]);expect(first).toMatchObject({offset:2,more:true,omittedBefore:true});
 const next=await f.history.read({paneId,limit:2,offset:first.offset,revision:first.revision!});expect(next.items.map(i=>i.id)).toEqual(["child-254","child-253"]);
 f.history.note(f.source,item("new"),"new-event",async()=>true);
 const reset=await f.history.read({paneId,limit:2,offset:next.offset,revision:first.revision!});expect(reset.reset).toBe(true);expect(reset.items[0]?.id).toBe("new");f.history.close();
});
it("discards a page if its collection changes during validation instead of mixing revisions",async()=>{
 const f=fixture();let resolve!:(value:boolean)=>void;f.history.note(f.source,item(),"stop",()=>new Promise(done=>{resolve=done;}));
 const reading=f.history.read({paneId});f.history.note(f.source,item("new"),"new-event",async()=>true);resolve(true);
 expect(await reading).toMatchObject({status:"pending",items:[],offset:0,reset:true});f.history.close();
});
it("replaces the whole observed settings pair, rejects inferred model labels and preserves unknown dates",async()=>{
 const f=fixture();f.history.note(f.source,{...item(),model:"old",modelBasis:"session",reasoningEffort:"high",reasoningEffortBasis:"session"},"first",async()=>true);
 f.history.note(f.source,{...item(),model:"next",modelBasis:"session"},"next",async()=>true);
 let value=(await f.history.read({paneId})).items[0]!;expect(value.model).toBe("next");expect(value).not.toHaveProperty("reasoningEffort");expect(value).not.toHaveProperty("endedAt");
 f.history.note(f.source,{id:"inferred",terminalStatus:"error",model:"requested-parent",type:"Explore"},"bad-model",async()=>true);
 value=(await f.history.read({paneId})).items[0]!;expect(value).not.toHaveProperty("model");expect(value).not.toHaveProperty("startedAt");f.history.close();
});
it("expires returned grants on authorization loss and explicit retirement without mutating source data",async()=>{
 const f=fixture();let allowed=true;f.history.note(f.source,item(),"stop",async()=>true);
 const grant=await f.history.grant(paneId,"child",()=>allowed);expect(grant?.current()).toBe(true);allowed=false;expect(grant?.current()).toBe(false);
 allowed=true;f.history.forget(paneId);expect(grant?.current()).toBe(false);expect(await f.history.grant(paneId,"child")).toBeUndefined();f.history.close();
});
it("bounds caller waiting and physical verifier slots, and discards late results",async()=>{
 vi.useFakeTimers();const f=fixture(),resolvers:Array<(v:boolean)=>void>=[];
 f.history.note(f.source,item(),"stop",()=>new Promise(resolve=>{resolvers.push(resolve);}));
 try{
  const calls=Array.from({length:8},()=>f.history.read({paneId}));await vi.advanceTimersByTimeAsync(1500);
  const results=await Promise.all(calls);expect(resolvers).toHaveLength(4);expect(results.every(r=>r.status==="pending"&&r.items.length===0)).toBe(true);
  for(const resolve of resolvers)resolve(true);await Promise.resolve();await Promise.resolve();expect(results.every(r=>r.items.length===0)).toBe(true);
 }finally{for(const resolve of resolvers)resolve(true);await Promise.resolve();f.history.close();}
});

it("retires grants when the same child ID is replaced, even if the formal event label and public metadata stay equal",async()=>{
 const f=fixture();f.history.note(f.source,item(),"same-event",async()=>true);
 const first=await f.history.grant(paneId,"child");expect(first?.current()).toBe(true);
 f.history.note(f.source,item(),"same-event",async()=>true);expect(first?.current()).toBe(false);
 const next=await f.history.grant(paneId,"child");expect(next?.current()).toBe(true);
 f.history.note(f.source,{...item(),startedAt:2000},"new-attempt",async()=>true);expect(next?.current()).toBe(false);
 const latest=await f.history.grant(paneId,"child");f.history.forget(paneId);f.history.note(f.source,item(),"new-state",async()=>true);expect(latest?.current()).toBe(false);f.history.close();
});
it("does not publish an old entry whose proof is replaced during asynchronous validation",async()=>{
 const f=fixture();let finish!:(value:boolean)=>void;f.history.note(f.source,item(),"same-event",()=>new Promise(resolve=>{finish=resolve;}));
 const reading=f.history.read({paneId});f.history.note(f.source,item(),"same-event",async()=>false);finish(true);
 expect(await reading).toMatchObject({status:"pending",items:[],incomplete:true});f.history.close();
});

it("mints history entry IDs and never grants a later birth with an earlier selected ID",async()=>{
 const f=fixture();f.history.note(f.source,item(),"old-attempt",async()=>true);const first=(await f.history.read({paneId})).items[0]!;
 expect(first.entryId).toMatch(/^[a-f0-9-]{36}$/);expect(await f.history.grant(paneId,"child",()=>true,first.entryId)).toBeDefined();
 f.history.note(f.source,item(),"old-attempt",async()=>true);expect((await f.history.read({paneId})).items[0]?.entryId).toBe(first.entryId);
 f.history.note(f.source,{...item(),startedAt:2000},"new-attempt",async()=>true);const next=(await f.history.read({paneId})).items[0]!;expect(next.entryId).not.toBe(first.entryId);
 expect(await f.history.grant(paneId,"child",()=>true,first.entryId)).toBeUndefined();expect(await f.history.grant(paneId,"child",()=>true,next.entryId)).toBeDefined();f.history.close();
});
