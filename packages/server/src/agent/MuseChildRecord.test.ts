import {afterEach,expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,rm,symlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {Pane} from "@sodashitsu/protocol";
import {NativeSubagentTranscriptReader} from "./NativeSubagentTranscript.js";
import {openMuseChildRecord,museChildEntries} from "./MuseChildRecord.js";
const parent="01a1b40b-85fb-7eb2-bacf-afa29c999bc9",subagent="01a1b40b-a06a-7d31-b41b-e2b731d3874a",child="378db2aa-8fad-74e6-88fa-c2bc1d8bb4fe";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const event=(value:object)=>({schema_version:1,payload_schema_version:1,stream:{kind:"session",id:child},payload_type:"runtime.session",recorded_at:1794022023400000,payload:{kind:"run",event:value}});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-muse-child-history-"));dirs.push(root);
 const dataHome=join(root,"data"),dir=join(dataHome,"muse","sessions","2026","11","07",parent),nested=join(dir,"subagent",child);await mkdir(nested,{recursive:true});await writeFile(join(dir,"session.jsonl"),"{}\n");
 const file=join(nested,"session.jsonl"),rows=[event({kind:"started",prompt:"generated instruction"}),event({kind:"workflow_child_result_submitted",child_session_stream:{kind:"session",id:child},payload:{text:"generated public result"}})];await writeFile(file,rows.map(r=>JSON.stringify(r)).join("\n")+"\n");
 const pane={id:"p",agent:{kind:"muse",instanceId:"instance",subagents:{count:1,items:[{id:subagent,startedAt:0}]}},agentSession:{kind:"muse",sessionId:parent}} as Pane;
 let bound:string|undefined=child,verified=true;
 const reader=new NativeSubagentTranscriptReader({roots:{dataHome},museChildSession:()=>bound,museChildInput:()=>({text:"generated instruction",truncated:false}),session:{getPane:()=>pane,hasVerifiedAgentSession:()=>verified}});
 return{dataHome,file,pane,rows,reader,binding:(id:string|undefined)=>bound=id,verified:(v:boolean)=>verified=v};
}
it("reads only the formally bound nested child and exposes explicit prompt/public result",async()=>{
 const f=await fixture();expect(await f.reader.read("p",subagent,undefined)).toMatchObject({status:"ok",entries:[{kind:"prompt",text:"generated instruction"},{kind:"say",text:"generated public result"}]});
 await expect(f.reader.read("p",child,undefined)).rejects.toThrow();
});
it("retains previously granted completed history but never guesses an absent binding",async()=>{
 const f=await fixture();f.binding(undefined);await expect(f.reader.read("p",subagent,undefined)).rejects.toThrow();f.binding(child);await f.reader.read("p",subagent,undefined);
 f.pane.agent!.subagents!.items=[];f.binding(undefined);expect((await f.reader.read("p",subagent,undefined))?.status).toBe("ok");
 f.verified(false);await expect(f.reader.read("p",subagent,undefined)).rejects.toThrow();
});
it("rejects changed binding during async read, child-stream mismatch and symlink",async()=>{
 const f=await fixture(),pending=f.reader.read("p",subagent,undefined);f.binding(parent);expect(await pending).toMatchObject({status:"unreadable",entries:[]});f.binding(child);
 await writeFile(f.file,JSON.stringify({...f.rows[0],stream:{kind:"session",id:parent}})+"\n");expect(await openMuseChildRecord(parent,child,{dataHome:f.dataHome})).toBeUndefined();
 const other=f.file+".saved";await writeFile(other,JSON.stringify(f.rows[0])+"\n");await rm(f.file);await symlink(other,f.file);expect(await openMuseChildRecord(parent,child,{dataHome:f.dataHome})).toBeUndefined();
});
it("excludes internal reasoning, tool outputs, wrong child result and system instructions",()=>{
 for(const e of [{kind:"started",prompt:"private assembled instructions"},{kind:"reasoning_committed",text:"private"},{kind:"tool_result_batch_committed",results:[{text:"private"}]},{kind:"workflow_child_result_submitted",child_session_stream:{kind:"session",id:parent},payload:{text:"other"}}])expect(museChildEntries(event(e),child)).toEqual([]);
 expect(museChildEntries(event({kind:"started",prompt:"other"}),parent)).toEqual([]);
});
