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
it("reads Claude self usage only through the hook-bound parent transcript path",async()=>{
 const f=await fixture(),root=join(f.home,"claude","projects"),project=join(root,"generated"),sub=join(project,f.parent,"subagents"),parentFile=join(project,f.parent+".jsonl");await mkdir(sub,{recursive:true});await writeFile(parentFile,"");
 await writeFile(join(sub,`agent-${f.child}.jsonl`),JSON.stringify({type:"assistant",timestamp:at,agentId:f.child,message:{id:"call",model:"claude-generated",usage:{input_tokens:10,output_tokens:2,cache_read_input_tokens:3,cache_creation_input_tokens:0}}})+"\n");
 f.pane.agent!.kind="claude";f.pane.agentSession!.kind="claude";let proof={sessionId:f.parent,parentTranscriptPath:parentFile};
 const resolve=createSubagentUsageResolver({session:f.session,tracker:{transcriptSource:()=>proof},museChildSession:()=>undefined,claudeRoots:()=>[root]}),service=new SubagentUsageService({resolve});
 try{expect((await service.read("pane",f.child)).usage).toMatchObject({source:"transcript",tokens:{input:10,output:2,cacheRead:3},contextTokens:13});proof={...proof,sessionId:randomUUID()};expect(await service.read("pane",f.child)).not.toHaveProperty("usage");}finally{service.close();}
});
it("uses Muse's distinct bound child session and invalidates changed or missing bindings",async()=>{
 const f=await fixture(),stamp=(Date.parse(at)-1000).toString(16).padStart(12,"0");f.parent=`${stamp.slice(0,8)}-${stamp.slice(8)}-7000-8000-${randomUUID().slice(-12)}`;f.pane.agentSession!.sessionId=f.parent;
 const dataHome=join(f.home,"data"),parentDir=join(dataHome,"muse","sessions","2026","11","08",f.parent),childSession=randomUUID(),nested=join(parentDir,"subagent",childSession);await mkdir(nested,{recursive:true});await writeFile(join(parentDir,"session.jsonl"),"{}\n");
 const row={schema_version:1,payload_schema_version:1,stream:{kind:"session",id:childSession},recorded_at:Date.parse(at)*1000,payload_type:"runtime.session",payload:{kind:"run",event:{kind:"goal_usage_attribution",record:{schema_version:1,usage_family:"provider",usage_id:"call",model:"generated",quantity:{reported:true,unit:"tokens",input_tokens:10,output_tokens:2,cached_tokens:3}}}}};await writeFile(join(nested,"session.jsonl"),JSON.stringify(row)+"\n");
 f.pane.agent!.kind="muse";f.pane.agentSession!.kind="muse";let binding:string|undefined=childSession;
 const resolve=createSubagentUsageResolver({session:f.session,tracker:{transcriptSource:()=>undefined},museChildSession:()=>binding,roots:{dataHome}}),service=new SubagentUsageService({resolve});
 try{const target=resolve("pane",f.child)!;expect(target.recordId).toBe(childSession);expect((await service.read("pane",f.child)).usage?.tokens).toMatchObject({input:7,output:2,cacheRead:3});binding=randomUUID();expect(target.current()).toBe(false);expect(await service.read("pane",f.child)).not.toHaveProperty("usage");binding=undefined;expect(resolve("pane",f.child)).toBeUndefined();}finally{service.close();}
});
it("reads only a current Grok child's exact safe ledger and rejects its replaced session ID",async()=>{
 const f=await fixture(),grokHome=join(f.home,"grok"),dir=join(grokHome,"sessions",encodeURIComponent("/generated"),f.child);await mkdir(dir,{recursive:true});
 const ledger={sessionId:f.child,updatedAt:at,session:{inputTokens:100,outputTokens:20,cachedReadTokens:30,cacheCreationTokens:10,reasoningTokens:5,totalTokens:120,modelCalls:1,costUsdTicks:123456789}};await writeFile(join(dir,"usage.json"),JSON.stringify(ledger));
 f.pane.agent!.kind="grok";f.pane.agentSession!.kind="grok";
 const resolve=createSubagentUsageResolver({session:f.session,tracker:{transcriptSource:()=>undefined},museChildSession:()=>undefined,roots:{grokHome}}),service=new SubagentUsageService({resolve});
 try{expect((await service.read("pane",f.child)).usage).toMatchObject({source:"grok-usage",consumptionScope:"subtree",tokens:{total:120},costUsd:0.0123456789});await writeFile(join(dir,"usage.json"),JSON.stringify({...ledger,sessionId:f.parent}));expect(await service.read("pane",f.child)).not.toHaveProperty("usage");}finally{service.close();}
});
it("requires AGY's formal parent spawn and descriptor before reading child numeric steps",async()=>{
 const f=await fixture(),parent="11111111-1111-4111-8111-111111111111",child="22222222-2222-4222-8222-222222222222",root=join(f.home,".gemini","antigravity-cli","brain"),system=join(root,parent,".system_generated"),logs=join(root,child,".system_generated","logs");await mkdir(join(system,"subagents"),{recursive:true});await mkdir(join(system,"logs"),{recursive:true});await mkdir(logs,{recursive:true});
 const {readFile}=await import("node:fs/promises"),data=(name:string)=>readFile(new URL(`../agent/fixtures/agy-subagents/${name}`,import.meta.url),"utf8");await writeFile(join(system,"logs","transcript.jsonl"),await data("parent.jsonl"));await writeFile(join(system,"subagents",child+".json"),await data("alive.json"));await writeFile(join(logs,"transcript.jsonl"),JSON.stringify({source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",step_index:1,created_at:at,model:"generated",input_tokens:10,output_tokens:2,cache_read_tokens:3})+"\n");
 f.pane.agent!.kind="agy";f.pane.agentSession={kind:"agy",sessionId:parent,reportedAt:1};f.item.id=child;
 const resolve=createSubagentUsageResolver({session:f.session,tracker:{transcriptSource:()=>undefined},museChildSession:()=>undefined,roots:{home:f.home}}),service=new SubagentUsageService({resolve});
 try{expect((await service.read("pane",child)).usage?.tokens).toMatchObject({input:10,output:2,cacheRead:3});await rm(join(system,"subagents",child+".json"));expect(await service.read("pane",child)).not.toHaveProperty("usage");}finally{service.close();}
});
it("keeps a successful known-child grant after completion without reintroducing sidebar membership",async()=>{
 const f=await fixture(),service=new SubagentUsageService({resolve:f.resolve});try{
  expect((await service.read("pane",f.child)).usage?.tokens?.total).toBe(120);f.pane.agent!.subagents!.items=[];
  const ended=await service.read("pane",f.child);expect(ended).toMatchObject({status:"ok",usage:{tokens:{total:120},partial:true}});expect(ended.reason).toContain("現在の子run");expect(f.pane.agent!.subagents!.items).toEqual([]);
  expect(await service.read("pane",randomUUID())).not.toHaveProperty("usage");f.pane.agentSession!.sessionId=randomUUID();expect(await service.read("pane",f.child)).not.toHaveProperty("usage");
 }finally{service.close();}
});
it("expires history grants after 30 minutes without renewing them on historical reads",async()=>{
 const f=await fixture();let clock=1;const service=new SubagentUsageService({resolve:f.resolve,now:()=>clock});try{
  expect((await service.read("pane",f.child)).status).toBe("ok");f.pane.agent!.subagents!.items=[];clock+=30*60000;expect((await service.read("pane",f.child)).status).toBe("ok");clock++;expect(await service.read("pane",f.child)).not.toHaveProperty("usage");
 }finally{service.close();}
});
it("reproves a known history record after atomic rotation but never carries old generation totals",async()=>{
 const f=await fixture(),service=new SubagentUsageService({resolve:f.resolve});try{
  expect((await service.read("pane",f.child)).usage?.tokens?.total).toBe(120);f.pane.agent!.subagents!.items=[];
  const {rename}=await import("node:fs/promises");await rename(f.file,f.file+".old");await writeFile(f.file,f.meta()+f.usage.replace('"total_tokens":120','"total_tokens":320'));
  expect((await service.read("pane",f.child)).usage).toMatchObject({tokens:{total:320},partial:true});await writeFile(f.file,f.meta(f.child,randomUUID())+f.usage);expect(await service.read("pane",f.child)).not.toHaveProperty("usage");
 }finally{service.close();}
});
it("retires a granted run when the same child starts again, and cannot recreate it from unknown history",async()=>{
 const f=await fixture(),service=new SubagentUsageService({resolve:f.resolve});try{
  expect((await service.read("pane",f.child)).status).toBe("ok");f.item.startedAt+=10000;expect(await service.read("pane",f.child)).not.toHaveProperty("usage");f.pane.agent!.subagents!.items=[];expect(await service.read("pane",f.child)).not.toHaveProperty("usage");
 }finally{service.close();}
});
it("bounds known historical grants to 64 and never mints a missing grant from a valid filename",async()=>{
 const f=await fixture(),service=new SubagentUsageService({resolve:f.resolve}),ids=[f.child,...Array.from({length:64},()=>randomUUID())];
 try{for(const id of ids){f.item.id=id;await writeFile(join(f.home,"sessions","2026","11","08",`rollout-generated-${id}.jsonl`),f.meta(id)+f.usage.replace(f.child,id));expect((await service.read("pane",id)).status).toBe("ok");}
  f.pane.agent!.subagents!.items=[];expect(await service.read("pane",ids[0]!)).not.toHaveProperty("usage");expect((await service.read("pane",ids.at(-1)!)).usage?.tokens?.total).toBe(120);expect((service as unknown as {grants:Map<string,unknown>}).grants.size).toBe(64);
 }finally{service.close();}
});
