import {afterEach,expect,it} from "vitest";
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {Pane} from "@sodashitsu/protocol";
import {NativeSubagentTranscriptReader} from "./NativeSubagentTranscript.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import {openAntigravityChildRecord,antigravityChildEntries} from "./AntigravityChildRecord.js";
const parent="11111111-1111-4111-8111-111111111111",child="22222222-2222-4222-8222-222222222222";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function fixture(){
 const home=await mkdtemp(join(tmpdir(),"soda-agy-child-generated-"));dirs.push(home);
 const root=join(home,".gemini","antigravity-cli","brain"),system=join(root,parent,".system_generated"),descriptor=join(system,"subagents",child+".json"),file=join(root,child,".system_generated","logs","transcript.jsonl");
 await mkdir(join(system,"subagents"),{recursive:true});await mkdir(join(system,"logs"),{recursive:true});await mkdir(join(root,child,".system_generated","logs"),{recursive:true});
 const data=async(name:string)=>readFile(new URL(`./fixtures/agy-subagents/${name}`,import.meta.url),"utf8");
 await writeFile(join(system,"logs","transcript.jsonl"),await data("parent.jsonl"));await writeFile(descriptor,await data("alive.json"));
 await writeFile(file,[{source:"SYSTEM",type:"SYSTEM_MESSAGE",content:"private ignored"},{source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",tool_calls:[{name:"send_message",args:{Message:JSON.stringify("generated response"),Recipient:JSON.stringify(parent)}}]}].map(r=>JSON.stringify(r)).join("\n")+"\n");
 const pane={id:"p",agent:{kind:"agy",instanceId:"instance",subagents:{count:1,countBasis:"alive",items:[{id:child,state:"unknown",startedAt:1,depth:1}]}},agentSession:{kind:"agy",sessionId:parent}} as Pane;
 const reader=new NativeSubagentTranscriptReader({roots:{home},session:{getPane:()=>pane,hasVerifiedAgentSession:()=>true}});
 return{home,root,system,descriptor,file,pane,reader,data};
}
it("offers and reads AGY child history only after formal parent spawn and descriptor proof",async()=>{
 const f=await fixture(),native=new NativeSubagentReader({home:f.home});
 try{expect((await native.read({paneId:"p",instanceId:"instance",kind:"agy",sessionId:parent}))?.items[0]).toMatchObject({id:child,hasTranscript:true,state:"unknown"});}
 finally{native.close();}
 expect(await f.reader.read("p",child,undefined)).toMatchObject({status:"ok",running:false,state:"unknown",entries:[{kind:"tool",name:"send_message",text:"【親への送信要求】\ngenerated response"}]});
});
it("keeps granted killed child history readable but rejects missing/unknown descriptors",async()=>{
 const f=await fixture();await f.reader.read("p",child,undefined);f.pane.agent!.subagents!.items=[];
 await writeFile(f.descriptor,await f.data("killed.json"));expect((await f.reader.read("p",child,undefined))?.status).toBe("ok");
 await rm(f.descriptor);expect(await f.reader.read("p",child,undefined)).toMatchObject({status:"unreadable",entries:[]});
});
it("refuses mismatched spawn index, child symlink, changed parent scope and records without a grant",async()=>{
 const f=await fixture();await writeFile(f.descriptor,(await f.data("alive.json")).replace('"spawnStepIndex": 2','"spawnStepIndex": 9'));
 expect(await openAntigravityChildRecord(parent,child,{home:f.home})).toBeUndefined();await writeFile(f.descriptor,await f.data("alive.json"));
 const other=f.file+".copy";await writeFile(other,"generated");await rm(f.file);await symlink(other,f.file);expect(await openAntigravityChildRecord(parent,child,{home:f.home})).toBeUndefined();
 f.pane.agentSession!.sessionId=child;await expect(f.reader.read("p",child,undefined)).resolves.toMatchObject({status:"unreadable",entries:[]});
 f.pane.agent!.subagents!.items=[];await expect(f.reader.read("p",child,undefined)).rejects.toThrow();
});
it("suppresses system/thinking and tool result records",()=>{
 expect(antigravityChildEntries({type:"SYSTEM_MESSAGE",content:"hidden"},parent)).toEqual([]);expect(antigravityChildEntries({type:"GENERIC",content:"hidden"},parent)).toEqual([]);
});

it("never exposes generic planner text, thoughts or messages addressed to another agent",()=>{
 expect(antigravityChildEntries({source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",content:"private plan"},parent)).toEqual([]);
 expect(antigravityChildEntries({source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",tool_calls:[{name:"send_message",args:{Recipient:JSON.stringify(child),Message:JSON.stringify("not parent-directed")}}]},parent)).toEqual([]);
});

it("uses real sanitized native parent-directed message argument encoding",async()=>{
 const rows=(await readFile(new URL("./fixtures/agy-subagents/child.jsonl",import.meta.url),"utf8")).trim().split("\n").map(line=>JSON.parse(line));
 const entries=rows.flatMap(row=>antigravityChildEntries(row,parent));expect(entries).toMatchObject([{kind:"tool",name:"send_message",text:"【親への送信要求】\nNATIVE_SUBAGENT_PROBE_OK"}]);
});

it("keeps native task state unknown when omitted and does not derive completion from membership",async()=>{
 const f=await fixture();
 for(const state of ["working","idle","unknown",undefined] as const){
  const item=f.pane.agent!.subagents!.items[0]!;if(state===undefined)delete item.state;else item.state=state;
  expect(await f.reader.read("p",child,undefined)).toMatchObject({state:state??"unknown",running:state==="working"});
  expect(f.pane.agent!.subagents!.count).toBe(1);expect(f.pane.agent!.subagents!.countBasis).toBe("alive");
 }
 f.pane.agent!.subagents!.items=[];expect(await f.reader.read("p",child,undefined)).toMatchObject({state:"unknown",running:false});
});

it("preserves truncation metadata on a bounded parent-directed tool message",()=>{
 const entry=antigravityChildEntries({source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",tool_calls:[{name:"send_message",args:{Recipient:JSON.stringify(parent),Message:JSON.stringify("g".repeat(4100))}}]},parent)[0]!;
 expect(entry).toMatchObject({kind:"tool",name:"send_message",truncated:true});expect(entry.text).toHaveLength(4000);
});
