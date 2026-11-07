import type { Pane } from "@sodashitsu/protocol";
import {expect,it,vi} from "vitest";
import {NativeSubagentService} from "./NativeSubagentService.js";
import type {NativeSubagentSource} from "./NativeSubagentReader.js";
import type {Subagents} from "./SubagentTracker.js";
const CHUNK=4*1024*1024;
const pane=(id:string)=>({id,agent:{kind:"codex",instanceId:"instance-"+id},agentSession:{kind:"codex",sessionId:"session-"+id}}) as unknown as Pane;
function harness(chunks:Record<string,number>){
 let clock=0,active=0,maxActive=0,verified=true,progress=true;const panes=Object.keys(chunks).map(pane),positions=new Map<string,number>(),reads:{id:string;at:number}[]=[],timers:{fn:()=>void;ms:number;cancelled:boolean}[]=[];
 const key=(s:NativeSubagentSource)=>JSON.stringify(s),publish=vi.fn((id:string,value:Subagents|undefined)=>{const p=panes.find(p=>p.id===id);if(p?.agent){if(value) p.agent.subagents=value;else delete p.agent.subagents;}return true;});
 const reader={read:vi.fn(async(s:NativeSubagentSource):Promise<Subagents|undefined>=>{active++;maxActive=Math.max(maxActive,active);reads.push({id:s.paneId,at:clock});await Promise.resolve();positions.set(key(s),(positions.get(key(s))??0)+CHUNK);active--;return positions.get(key(s))!>=chunks[s.paneId]!*CHUNK?{count:1,countBasis:"alive" as const,items:[{id:"generated",startedAt:0,state:"unknown" as const}]}:undefined;}),progress:(s:NativeSubagentSource)=>({offset:progress?(positions.get(key(s))??0):0,pending:(positions.get(key(s))??0)<chunks[s.paneId]!*CHUNK,generation:0}),forget:vi.fn(),close:vi.fn()};
 const service=new NativeSubagentService({session:{snapshot:()=>({panes}),getPane:id=>panes.find(p=>p.id===id),setAgentSubagents:publish,hasVerifiedAgentSession:()=>verified},bus:{subscribe:()=>({dispose(){}})},reader,now:()=>clock,setTimer:(fn,ms)=>{const t={fn,ms,cancelled:false};timers.push(t);return t;},clearTimer:t=>{(t as typeof timers[number]).cancelled=true;}});
 async function tick(){const timer=timers.shift();if(!timer)throw Error("timer missing");clock+=timer.ms;if(!timer.cancelled){timer.fn();await new Promise<void>(r=>setImmediate(r));}return timer;}
 return{service,panes,reader,reads,publish,timers,tick,get clock(){return clock},get maxActive(){return maxActive},setVerified:(v:boolean)=>{verified=v;},stopProgress:()=>{progress=false;},advance:(ms:number)=>{clock+=ms;}};
}
it("catches up a 464MiB record within bounded bursts without publishing historical prefixes",async()=>{
 const h=harness({large:116});h.service.start();expect(h.timers[0]!.ms).toBe(2000);
 for(let i=0;i<116;i++){await h.tick();if(i<115)expect(h.publish).not.toHaveBeenCalled();}
 expect(h.publish).toHaveBeenLastCalledWith("large",expect.objectContaining({count:1,countBasis:"alive"}));expect(h.clock).toBeLessThanOrEqual(45000);expect(h.clock).toBeGreaterThan(30000);expect(h.maxActive).toBe(1);expect(h.timers[0]!.ms).toBeGreaterThan(250);h.service.close();
});
it("rotates only four catchup readers while normal sources still poll every two seconds",async()=>{
 const h=harness({a:100,b:100,c:100,d:100,e:100,f:100,g:100,h:100,quiet:1});h.service.start();await h.tick();expect(h.maxActive).toBe(4);const first=h.reads.length;
 await h.tick();expect(h.reads.length-first).toBe(4);expect(h.reads.slice(first).map(x=>x.id)).toEqual(["a","b","c","d"]);const second=h.reads.length;
 await h.tick();expect(h.reads.slice(second).map(x=>x.id)).toEqual(["e","f","g","h"]);
 for(let i=0;i<7;i++)await h.tick();expect(h.reads.filter(x=>x.id==="quiet").map(x=>x.at)).toEqual([2000,4000]);expect(h.maxActive).toBe(4);h.service.close();
});
it("stops fast scheduling on no progress and caps a slow burst by deadline before cooldown",async()=>{
 const no=harness({large:1000});no.stopProgress();no.service.start();await no.tick();expect(no.timers[0]!.ms).toBe(2000);no.service.close();
 const h=harness({large:1000});h.service.start();await h.tick();h.advance(10001);await h.tick();expect(h.timers[0]!.ms).toBe(2000);expect(h.publish).not.toHaveBeenCalled();h.service.close();
});
it.each(["unverified","instance","session","closed"])("a queued catchup never reads or publishes across %s",async change=>{
 const h=harness({large:100});h.service.start();await h.tick();expect(h.timers[0]!.ms).toBe(250);const calls=h.reader.read.mock.calls.length;
 if(change==="unverified")h.setVerified(false);
 if(change==="instance")h.panes[0]!.agent={...h.panes[0]!.agent!,instanceId:"other"};
 if(change==="session")h.panes[0]!.agentSession={kind:"codex",sessionId:"other",reportedAt:0};
 if(change==="closed")h.service.close();
 await h.tick();expect(h.reader.read).toHaveBeenCalledTimes(calls);expect(h.publish).not.toHaveBeenCalled();h.service.close();
});

it("measures bounded real-reader progress on generated 32MiB without exposing a historical prefix",async()=>{
 const {mkdtemp,mkdir,open,readFile,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
 const {NativeSubagentReader}=await import("./NativeSubagentReader.js");
 const home=await mkdtemp(join(tmpdir(),"soda-catchup-generated-"));
 try{
  const rows=(await readFile(new URL("./fixtures/native-subagents/codex.jsonl",import.meta.url),"utf8")).trim().split("\n").map(l=>JSON.parse(l));const sessionId=rows[0].payload.thread_id;
  const directory=join(home,"sessions","2026","11","07");await mkdir(directory,{recursive:true});const file=join(directory,`rollout-fixture-${sessionId}.jsonl`),fd=await open(file,"wx");
  const prefix=Buffer.from(JSON.stringify(rows[0])+'\n{"type":"response_item","payload":{"text":"'),suffix=Buffer.from('"}}\n');let left=32*1024*1024-prefix.length-suffix.length;const pad=Buffer.alloc(65536,120);
  try{await fd.write(prefix);while(left){const size=Math.min(left,pad.length);await fd.write(pad.subarray(0,size));left-=size;}await fd.write(suffix);}finally{await fd.close();}
  const reader=new NativeSubagentReader({codexHome:home}),source:NativeSubagentSource={paneId:"generated",instanceId:"generated",kind:"codex",sessionId};const times:number[]=[],cpu=process.cpuUsage();let offset=0;
  try{for(let i=0;i<8;i++){const started=performance.now(),value=await reader.read(source);times.push(performance.now()-started);const state=reader.progress(source)!;expect(state.offset-offset).toBe(CHUNK);offset=state.offset;if(i<7){expect(value).toBeUndefined();expect(state.pending).toBe(true);}else{expect(value?.count).toBe(1);expect(state.pending).toBe(false);}}}
  finally{reader.close();}
  const used=process.cpuUsage(cpu);console.log(JSON.stringify({fixtureBytes:32*1024*1024,chunks:8,maxReadBytes:CHUNK,readMs:times,totalCpuMs:(used.user+used.system)/1000,defaultCatchupDelayMs:250}));
 }finally{await rm(home,{recursive:true,force:true});}
});


it.each(["readerror","rotate"])("stops an existing fast burst after %s without offset-only authority",async mode=>{
 const h=harness({large:100});h.service.start();await h.tick();expect(h.timers[0]!.ms).toBe(250);
 if(mode==="readerror")h.reader.read.mockRejectedValueOnce(Error("generated read failure"));
 else{const original=h.reader.progress;let calls=0;h.reader.progress=s=>({...original(s),generation:calls++===0?0:1});}
 await h.tick();expect(h.timers[0]!.ms).toBeGreaterThan(250);expect(h.publish).not.toHaveBeenCalled();h.service.close();
});

it("does not overlap a pending source read and discards close before its continuation",async()=>{
 const h=harness({large:100});let done!:(value:Subagents|undefined)=>void;h.reader.read.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));h.service.start();await h.tick();
 expect(h.reader.read).toHaveBeenCalledTimes(1);await h.service.refresh();expect(h.reader.read).toHaveBeenCalledTimes(1);h.service.close();done({count:0,items:[]});await new Promise<void>(r=>setImmediate(r));expect(h.publish).not.toHaveBeenCalled();expect(h.timers).toHaveLength(0);
});
