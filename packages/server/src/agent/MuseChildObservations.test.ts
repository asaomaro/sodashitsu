import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,rm,readFile,appendFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {MuseChildObservations,museChildModel,museChildDefaultEffort} from "./MuseChildObservations.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import {NativeSubagentRecords} from "./NativeSubagentRecords.js";
const parent="01a1b40b-85fb-7eb2-bacf-afa29c999bc9",subagent="01a1b40b-a06a-7d31-b41b-e2b731d3874a",child="378db2aa-8fad-74e6-88fa-c2bc1d8bb4fe";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const configured=(model:string)=>JSON.stringify({schema_version:1,stream:{kind:"session",id:child},payload_type:"run.model.configured",payload_schema_version:1,recorded_at:1794022023400000,payload:{kind:"run_model",record:{model_id:model}}})+"\n";
it("distinguishes subagent ID and bound nested session; rejects wrong/unknown layouts",async()=>{
 const rows=(await readFile(new URL("./fixtures/native-subagents/muse.jsonl",import.meta.url),"utf8")).trim().split("\n").map(line=>JSON.parse(line));
 const fold=new NativeSubagentRecords("muse",parent);rows.slice(0,3).forEach(r=>fold.consume(r));
 const bind=structuredClone(rows[3]);Object.assign(bind.payload.record,{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"});fold.consume(bind);expect(fold.museChildSession(subagent)).toBe(child);
 const other=structuredClone(bind);other.id="generated-other";other.payload.record.storage_layout="unknown";fold.consume(other);expect(fold.museChildSession(subagent)).toBeUndefined();
});
it("tracks actual child run model, rejects other session/old/partial records",()=>{
 expect(museChildModel(Buffer.from(configured("new-model")),child,0)).toEqual({model:"new-model",modelBasis:"turn"});
 expect(museChildModel(Buffer.from(configured("model")),parent,0)).toEqual({});expect(museChildModel(Buffer.from(configured("model")),child,Infinity)).toEqual({});
 expect(museChildModel(Buffer.from(configured("old")+'{"payload_type":"run.model.configured"'),child,0)).toEqual({});
});
it("keeps default effort internally distinct from child turn overrides and requires exact child event session",()=>{
 expect(museChildDefaultEffort({events:[{method:"session/reasoningEffortChanged",params:{sessionId:child,reasoningEffort:"high"}}]},child)).toEqual({reasoningEffort:"high",reasoningEffortBasis:"session"});
 expect(museChildDefaultEffort({events:[{method:"session/reasoningEffortChanged",params:{sessionId:parent,reasoningEffort:"high"}}]},child)).toEqual({});
 expect(museChildDefaultEffort({events:[{method:"session/snapshot",params:{sessionId:child,state:{reasoningEffort:{reasoningEffort:"low"}}}}]},child)).toEqual({});
});
it("reads only the exact nested binding and preserves durable model on view failure; caches bounded queries",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-muse-child-observed-"));dirs.push(home);
 const dataHome=join(home,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent),nested=join(dir,"subagent",child);
 await mkdir(nested,{recursive:true});await writeFile(join(dir,"session.jsonl"),"{}\n");await writeFile(join(nested,"session.jsonl"),configured("first-model"));
 const query=vi.fn(async()=>({events:[{method:"session/reasoningEffortChanged",params:{sessionId:child,reasoningEffort:"high"}}]}));let now=1;
 const observer=new MuseChildObservations({dataHome},query as any,()=>now),item={id:subagent,startedAt:0};
 expect(await observer.read(parent,item,child,()=>true)).toMatchObject({model:"first-model",reasoningEffort:"high",reasoningEffortBasis:"session"});
 await appendFile(join(nested,"session.jsonl"),configured("second-model"));expect(await observer.read(parent,item,child,()=>true)).toMatchObject({model:"second-model",reasoningEffort:"high"});expect(query).toHaveBeenCalledOnce();
 now=30001;query.mockRejectedValueOnce(Error("generated failure"));const failedView=await observer.read(parent,item,child,()=>true);expect(failedView).toMatchObject({model:"second-model"});expect(failedView).not.toHaveProperty("reasoningEffort");
 const stale=observer.read(parent,item,child,()=>false);expect(await stale).toEqual({});
});

it("publishes bound Muse child settings through the actual native reader without altering activity",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-muse-child-reader-"));dirs.push(home);
 const dataHome=join(home,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent);await mkdir(dir,{recursive:true});
 const rows=(await readFile(new URL("./fixtures/native-subagents/muse.jsonl",import.meta.url),"utf8")).trim().split("\n").map(line=>JSON.parse(line));
 Object.assign(rows[3].payload.record,{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"});
 const end=rows.findIndex(r=>r.payload_type==="subagent.control.result_ready");await writeFile(join(dir,"session.jsonl"),rows.slice(0,end).map(r=>JSON.stringify(r)).join("\n")+"\n");
 const reader=new NativeSubagentReader({dataHome},undefined,{forget(){},async readMany(id,items,binding){expect(id).toBe(parent);expect(binding(subagent)).toBe(child);return new Map([[subagent,{model:"observed-child",modelBasis:"turn",reasoningEffort:"high",reasoningEffortBasis:"session"}]]);}});
 try{const source={paneId:"p",instanceId:"instance",kind:"muse" as const,sessionId:parent};expect(await reader.read(source)).toMatchObject({count:1,items:[{id:subagent,model:"observed-child",reasoningEffort:"high",reasoningEffortBasis:"session"}]});expect(reader.museChildSession(source,subagent)).toBe(child);expect(reader.museChildInput(source,subagent)?.text).toBe(rows[0].payload.record.objective);expect(reader.museChildSession({...source,instanceId:"replacement"},subagent)).toBeUndefined();}finally{reader.close();}
});

it("preserves durable model when optional view ignores its deadline longer than the total budget",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-muse-child-deadline-"));dirs.push(home);
 const dataHome=join(home,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent),nested=join(dir,"subagent",child);await mkdir(nested,{recursive:true});await writeFile(join(dir,"session.jsonl"),"{}\n");await writeFile(join(nested,"session.jsonl"),configured("durable-model"));
 const query=vi.fn(()=>new Promise<any>(()=>{}));const observer=new MuseChildObservations({dataHome},query as any);
 const result=await observer.readMany(parent,[{id:subagent,startedAt:0}],()=>child,()=>true);
 expect(query).toHaveBeenCalledOnce();expect(result.get(subagent)).toEqual({model:"durable-model",modelBasis:"turn",hasTranscript:true});
});

it("keeps last formal Muse child-session proof private across terminal/resume and retires it on a new spawn",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-muse-child-resume-"));dirs.push(home);
 const dataHome=join(home,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent);await mkdir(dir,{recursive:true});
 const nested=join(dir,"subagent",child);await mkdir(nested,{recursive:true});const childFile=join(nested,"session.jsonl");await writeFile(childFile,configured("previous-turn-model"));
 const file=join(dir,"session.jsonl"),rows=(await readFile(new URL("./fixtures/native-subagents/muse.jsonl",import.meta.url),"utf8")).trim().split("\n").map(line=>JSON.parse(line));
 Object.assign(rows[3].payload.record,{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"});
 const end=rows.findIndex(r=>r.payload_type==="subagent.control.result_ready");await writeFile(file,rows.slice(0,end).map(r=>JSON.stringify(r)).join("\n")+"\n");
 let seq=0;const event=(phase:string,extra:Record<string,unknown>={})=>({...rows[0],id:"resume-generated-"+seq++,recorded_at:1794022025000000+seq*1000,payload_type:"subagent.control."+phase,payload:{kind:"subagent_control",record:{kind:phase,parent_session_id:parent,subagent_id:subagent,...extra}}});
 const append=async(row:unknown)=>{await appendFile(file,JSON.stringify(row)+"\n");};
 const observer=new MuseChildObservations({dataHome},async()=>({events:[]}));
 const reader=new NativeSubagentReader({dataHome},undefined,observer);
 const source={paneId:"p",instanceId:"instance",kind:"muse" as const,sessionId:parent};
 try{
  expect((await reader.read(source))?.items[0]?.model).toBe("previous-turn-model");
  await append(event("result_ready"));expect(await reader.read(source)).toEqual({count:0,items:[]});expect(reader.museChildSession(source,subagent)).toBeUndefined();
  await append(event("resume_context_recorded",{objective:"Generated followup"}));expect(await reader.read(source)).toEqual({count:0,items:[]});
  await append(event("status_updated",{control_status:"running"}));expect(await reader.read(source)).toMatchObject({count:1});expect(reader.museChildSession(source,subagent)).toBe(child);
  expect((await reader.read(source))?.items[0]).not.toHaveProperty("model"); // A preserved relation does not make the previous run's model current.
  await appendFile(childFile,configured("resumed-turn-model").replace("1794022023400000","1794022029000000"));await append(event("runtime_observed"));expect((await reader.read(source))?.items[0]?.model).toBe("resumed-turn-model");
  await append(event("spawn_accepted"));expect((await reader.read(source))?.items[0]).not.toHaveProperty("model");expect(reader.museChildSession(source,subagent)).toBeUndefined();
  await append(event("child_session_bound",{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1",parent_session_id:"foreign-parent"}));await reader.read(source);expect(reader.museChildSession(source,subagent)).toBeUndefined();
  await append(event("child_session_bound",{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"}));expect((await reader.read(source))?.items[0]?.model).toBe("resumed-turn-model");
  await append(event("child_session_bound",{child_session_id:child,schema_version:1,storage_layout:"future-layout"}));await reader.read(source);expect(reader.museChildSession(source,subagent)).toBeUndefined();
  expect(reader.museChildSession({...source,instanceId:"replacement"},subagent)).toBeUndefined();
  reader.forget(source.paneId);await writeFile(file,JSON.stringify(event("status_updated",{control_status:"running"}))+"\n");expect((await reader.read({...source,instanceId:"replacement"}))?.items[0]).not.toHaveProperty("model");
 }finally{reader.close();}
});

it("refreshes Muse child settings at an unchanged parent EOF without losing the observed model between polls",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-muse-child-eof-"));dirs.push(home);
 const dataHome=join(home,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent),nested=join(dir,"subagent",child);await mkdir(nested,{recursive:true});
 const rows=(await readFile(new URL("./fixtures/native-subagents/muse.jsonl",import.meta.url),"utf8")).trim().split("\n").map(line=>JSON.parse(line));Object.assign(rows[3].payload.record,{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"});
 await writeFile(join(dir,"session.jsonl"),rows.slice(0,rows.findIndex(r=>r.payload_type==="subagent.control.result_ready")).map(r=>JSON.stringify(r)).join("\n")+"\n");await writeFile(join(nested,"session.jsonl"),configured("first-child-model"));
 const observer=new MuseChildObservations({dataHome},async()=>({events:[]})),reader=new NativeSubagentReader({dataHome},undefined,observer),source={paneId:"p",instanceId:"instance",kind:"muse" as const,sessionId:parent};
 try{
  expect((await reader.read(source))?.items[0]?.model).toBe("first-child-model");
  expect((await reader.read(source))?.items[0]?.model).toBe("first-child-model");
  await appendFile(join(nested,"session.jsonl"),configured("next-child-model"));expect((await reader.read(source))?.items[0]?.model).toBe("next-child-model");
 }finally{reader.close();}
});
