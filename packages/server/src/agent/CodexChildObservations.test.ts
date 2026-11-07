import {expect,it} from "vitest";
import {codexChildTurn,readCodexChildObservations} from "./CodexChildObservations.js";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
const turn=(model:unknown,effort:unknown,at="2026-11-07T00:00:01Z")=>JSON.stringify({type:"turn_context",timestamp:at,payload:{model,effort}})+"\n";
it("tracks coherent latest child turn and clears omitted fields, never mixes old effort",()=>{
 const base=turn("model-old","low");
 expect(codexChildTurn(Buffer.from(base+turn("model-new","high")),0)).toEqual({model:"model-new",modelBasis:"turn",reasoningEffort:"high",reasoningEffortBasis:"turn"});
 expect(codexChildTurn(Buffer.from(base+turn("model-new",undefined)),0)).toEqual({model:"model-new",modelBasis:"turn"});
 expect(codexChildTurn(Buffer.from(base+turn(undefined,"high")),0)).toEqual({reasoningEffort:"high",reasoningEffortBasis:"turn"});
});
it("does not infer creation, model suffix or a turn older than child start",()=>{
 expect(codexChildTurn(Buffer.from(turn("model-high",undefined)),0)).not.toHaveProperty("reasoningEffort");
 expect(codexChildTurn(Buffer.from(turn("model","high")),Date.parse("2026-11-07T00:00:02Z"))).toEqual({});
 expect(codexChildTurn(Buffer.from(turn("model","high","invalid")),0)).toEqual({});
});
it("invalid/partial last turn does not revive older model or effort",()=>{
 for(const row of ['{"type":"turn_context"','{"type":"turn_context",broken}\n'])expect(codexChildTurn(Buffer.from(turn("old","low")+row),0)).toEqual({});
 expect(codexChildTurn(Buffer.from('fragment\n'+turn("new","high")),0,true)).toMatchObject({model:"new"});
});
it("requires both parent/child proof for transcript capability and invalidates late parent change",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-child-observation-generated-")),parent=randomUUID(),child=randomUUID(),dir=join(home,"sessions","2026","11","07");
 try{
  await mkdir(dir,{recursive:true});await writeFile(join(dir,`rollout-generated-${child}.jsonl`),JSON.stringify({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:parent}}}}})+"\n"+turn("actual","medium"));
  const items=[{id:child,startedAt:0,depth:1}],observed=await readCodexChildObservations(home,parent,items,()=>true);
  expect(observed.get(child)).toMatchObject({model:"actual",reasoningEffort:"medium",hasTranscript:true});
  expect((await readCodexChildObservations(home,randomUUID(),items,()=>true)).size).toBe(0);
  let current=true;const stale=readCodexChildObservations(home,parent,items,()=>current);current=false;expect((await stale).size).toBe(0);
 }finally{await rm(home,{recursive:true,force:true});}
});
