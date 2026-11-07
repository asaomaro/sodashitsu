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
 try{expect(await reader.read({paneId:"p",instanceId:"instance",kind:"muse",sessionId:parent})).toMatchObject({count:1,items:[{id:subagent,model:"observed-child",reasoningEffort:"high",reasoningEffortBasis:"session"}]});}finally{reader.close();}
});

it("preserves durable model when optional view ignores its deadline longer than the total budget",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-muse-child-deadline-"));dirs.push(home);
 const dataHome=join(home,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent),nested=join(dir,"subagent",child);await mkdir(nested,{recursive:true});await writeFile(join(dir,"session.jsonl"),"{}\n");await writeFile(join(nested,"session.jsonl"),configured("durable-model"));
 const query=vi.fn(()=>new Promise<any>(()=>{}));const observer=new MuseChildObservations({dataHome},query as any);
 const result=await observer.readMany(parent,[{id:subagent,startedAt:0}],()=>child,()=>true);
 expect(query).toHaveBeenCalledOnce();expect(result.get(subagent)).toEqual({model:"durable-model",modelBasis:"turn"});
});
