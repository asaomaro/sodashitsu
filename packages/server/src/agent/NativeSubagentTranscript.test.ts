import {afterEach,expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,rm,symlink,link,rename} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import type {Pane} from "@sodashitsu/protocol";
import {SubagentTranscriptReader} from "./SubagentTranscript.js";
import {NativeSubagentTranscriptReader} from "./NativeSubagentTranscript.js";
import {openCodexChildRecord,codexChildEntries} from "./CodexChildRecord.js";
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function fixture(){
 const home=await mkdtemp(join(tmpdir(),"soda-child-generated-"));dirs.push(home);
 const parent=randomUUID(),child=randomUUID(),instance=randomUUID(),dir=join(home,"sessions","2026","11","07");await mkdir(dir,{recursive:true});
 const file=join(dir,`rollout-2026-11-07-${child}.jsonl`);
 const meta=(owner=parent)=>({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:owner}}}}});
 const text=(role:string,value:string)=>({type:"response_item",timestamp:"2026-11-07T00:00:01Z",payload:{type:"message",role,content:[{type:role==="user"?"input_text":"output_text",text:value}]}});
 const rows=[meta(),text("user","generated instruction"),text("assistant","generated response")];await writeFile(file,rows.map(r=>JSON.stringify(r)).join("\n")+"\n");
 const pane={id:"p",agent:{kind:"codex",instanceId:instance,subagents:{count:1,countBasis:"alive",items:[{id:child,startedAt:1,depth:1,state:"working"}]}},agentSession:{kind:"codex",sessionId:parent}} as Pane;
 let verified=true,now=1;
 const reader=new NativeSubagentTranscriptReader({home,session:{getPane:()=>pane,hasVerifiedAgentSession:()=>verified},now:()=>now});
 return{home,parent,child,instance,file,pane,reader,rows,meta,verified:(v:boolean)=>verified=v,time:(v:number)=>now=v};
}
it("reads only exact proven child human/model text and continues by byte offset",async()=>{
 const f=await fixture(),r=await f.reader.read("p",f.child,undefined);expect(r).toMatchObject({status:"ok",running:true,entries:[{kind:"prompt",text:"generated instruction"},{kind:"say",text:"generated response"}]});
 expect((await f.reader.read("p",f.child,r!.offset))?.entries).toEqual([]);
 await expect(f.reader.read("p",f.parent,undefined)).rejects.toThrow();
});
it("refuses unowned child, unverified parent and changed instance",async()=>{
 const f=await fixture();await expect(f.reader.read("p",randomUUID(),undefined)).rejects.toThrow("subagent not found");
 await f.reader.read("p",f.child,undefined);f.pane.agent!.subagents!.items=[];
 f.verified(false);await expect(f.reader.read("p",f.child,undefined)).rejects.toThrow();f.verified(true);f.pane.agent!.instanceId=randomUUID();await expect(f.reader.read("p",f.child,undefined)).rejects.toThrow();
});
it("permits completed-child continuation only after a verified grant, with TTL",async()=>{
 const f=await fixture();await f.reader.read("p",f.child,undefined);f.pane.agent!.subagents!.items=[];
 expect(await f.reader.read("p",f.child,undefined)).toMatchObject({status:"ok",running:false});
 f.time(30*60000+2);await expect(f.reader.read("p",f.child,undefined)).rejects.toThrow();
});
it("refuses mismatched child session_meta, child file symlink and hardlink",async()=>{
 const f=await fixture();await writeFile(f.file,JSON.stringify(f.meta(randomUUID()))+"\n");expect((await f.reader.read("p",f.child,undefined))?.status).toBe("unreadable");
 const other=f.file+".saved";await rename(f.file,other);await symlink(other,f.file);expect(await openCodexChildRecord(f.home,f.parent,f.child)).toBeUndefined();await rm(f.file);await link(other,f.file);expect(await openCodexChildRecord(f.home,f.parent,f.child)).toBeUndefined();
});
it("detects replacement/append after verified open",async()=>{
 const f=await fixture(),opened=await openCodexChildRecord(f.home,f.parent,f.child);expect(opened).toBeDefined();
 try{await writeFile(f.file,JSON.stringify(f.meta())+"\n");expect(await opened!.unchanged()).toBe(false);}finally{await opened!.fd.close();}
});
it("drops result if parent scope changes during async open/read",async()=>{
 const f=await fixture(),promise=f.reader.read("p",f.child,undefined);f.pane.agentSession!.sessionId=randomUUID();expect(await promise).toMatchObject({status:"unreadable",entries:[]});
});
it("excludes reasoning, tool bodies, attachments and system text",()=>{
 for(const payload of [{type:"reasoning",summary:[{text:"secret"}]},{type:"message",role:"system",content:[{type:"input_text",text:"secret"}]},{type:"function_call_output",output:"secret"}])expect(codexChildEntries({type:"response_item",payload})).toEqual([]);
});

it("uses the existing transcript API reader without requiring a Claude hook",async()=>{
 const f=await fixture();let legacyCalls=0;
 const reader=new SubagentTranscriptReader({native:f.reader,tracker:{transcriptSource:()=>{legacyCalls++;return undefined;}},agentInstanceOf:()=>f.instance,logger:{debug(){},warn(){}}});
 expect(await reader.read("p",f.child,undefined)).toMatchObject({status:"ok",entries:[{kind:"prompt"},{kind:"say"}]});expect(legacyCalls).toBe(0);
});
