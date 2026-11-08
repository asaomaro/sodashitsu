import {afterEach,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm,symlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {Pane} from "@sodashitsu/protocol";
import {createSubagentUsageResolver} from "./SubagentUsageResolver.js";
import {SubagentUsageService} from "./SubagentUsageService.js";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const at="2026-11-08T00:00:01Z";
async function fixture(){
 const home=await mkdtemp(join(tmpdir(),"soda-child-usage-proof-"));dirs.push(home);const parent=randomUUID(),child=randomUUID(),dir=join(home,"sessions","2026","11","08");await mkdir(dir,{recursive:true});
 const item={id:child,startedAt:Date.parse(at)-1000,depth:1,hasTranscript:false},pane={id:"pane",agent:{kind:"codex",instanceId:"instance",subagents:{count:1,items:[item]}},agentSession:{kind:"codex",sessionId:parent}} as Pane;let verified=true;
 const session={getPane:()=>pane,hasVerifiedAgentSession:()=>verified},resolve=createSubagentUsageResolver({session,tracker:{transcriptSource:()=>undefined},museChildSession:()=>undefined,roots:{codexHome:home}});
 const file=join(dir,`rollout-generated-${child}.jsonl`),meta=(id=child,p=parent)=>JSON.stringify({type:"session_meta",payload:{id,source:{subagent:{thread_spawn:{parent_thread_id:p}}}}})+"\n",usage=JSON.stringify({type:"token_usage_record",timestamp:at,payload:{thread_id:child,response_id:"generated",usage:{input_tokens:100,cached_input_tokens:30,output_tokens:20,reasoning_output_tokens:5,total_tokens:120}}})+"\n";
 await writeFile(file,meta()+usage);return {home,file,parent,child,pane,item,resolve,meta,usage,session,set verified(v:boolean){verified=v;}};
}
it("queries exact numeric child records with transcript readability false, refusing wrong parent/self/unknown source",async()=>{
 const f=await fixture(),service=new SubagentUsageService({resolve:f.resolve});try{
  expect((await service.read("pane",f.child)).usage?.tokens?.total).toBe(120);expect(await service.read("pane",f.parent)).not.toHaveProperty("usage");expect(await service.read("pane",randomUUID())).not.toHaveProperty("usage");
  await writeFile(f.file,f.meta(f.child,randomUUID())+f.usage);expect(await service.read("pane",f.child)).not.toHaveProperty("usage");
  f.verified=false;expect(f.resolve("pane",f.child)).toBeUndefined();
 }finally{service.close();}
});
it("invalidates same-ID restarted children and changed parent instances before returning cached values",async()=>{
 const f=await fixture(),first=f.resolve("pane",f.child)!;expect(first.current()).toBe(true);f.item.startedAt++;expect(first.current()).toBe(false);expect(f.resolve("pane",f.child)?.key).not.toBe(first.key);
 const next=f.resolve("pane",f.child)!;f.pane.agent!.instanceId="replacement";expect(next.current()).toBe(false);
});
it("refuses a symlink child leaf even inside the correct root",async()=>{
 const f=await fixture(),outside=join(f.home,"outside.jsonl");await writeFile(outside,f.meta()+f.usage);await rm(f.file);await symlink(outside,f.file);
 const service=new SubagentUsageService({resolve:f.resolve});try{expect(await service.read("pane",f.child)).not.toHaveProperty("usage");}finally{service.close();}
});
