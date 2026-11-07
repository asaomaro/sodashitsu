import {afterEach,expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm,symlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {Pane} from "@sodashitsu/protocol";
import {ClaudeChildObservations,claudeChildModel,type ClaudeChildSource} from "./ClaudeChildObservations.js";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const row=(model:string)=>JSON.stringify({type:"assistant",timestamp:"2026-11-07T00:00:01Z",message:{model,content:[{type:"text",text:"generated"}]}})+"\n";
it("uses only latest actual assistant model, excluding synthetic/old/incomplete observations",()=>{
 expect(claudeChildModel(Buffer.from(row("old")+row("new")),0)).toBe("new");
 expect(claudeChildModel(Buffer.from(row("actual")+row("<synthetic>")),0)).toBe("actual");
 expect(claudeChildModel(Buffer.from(row("actual")),Date.parse("2026-11-07T00:00:02Z"))).toBeUndefined();
 expect(claudeChildModel(Buffer.from(row("old")+'{"message":{"model":"partial"}'),0)).toBeUndefined();
});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-claude-child-model-"));dirs.push(root);
 const projects=join(root,"projects"),parent="parent-generated",child="child-generated",dir=join(projects,"group",parent,"subagents");await mkdir(dir,{recursive:true});
 const file=join(dir,`agent-${child}.jsonl`),parentPath=join(projects,"group",parent+".jsonl");await writeFile(file,row("actual-model"));
 const pane={id:"p",agent:{kind:"claude",instanceId:"instance"},agentSession:{kind:"claude",sessionId:parent}} as Pane;
 const current={count:1,items:[{id:child,type:"worker-role",startedAt:0,hasTranscript:true}]};
 let verified=true;
 const observer=new ClaudeChildObservations({roots:()=>[projects],tracker:{current:()=>current,transcriptSource:()=>({sessionId:parent,parentTranscriptPath:parentPath})},session:{getPane:()=>pane,hasVerifiedAgentSession:()=>verified}});
 const source:ClaudeChildSource={paneId:"p",kind:"claude",instanceId:"instance",sessionId:parent};return{root,projects,file,pane,observer,source,verified:(v:boolean)=>verified=v};
}
it("projects observed child model without parent/role fallback and follows model changes",async()=>{
 const f=await fixture();expect((await f.observer.read(f.source))?.items[0]).toMatchObject({type:"worker-role",model:"actual-model",modelBasis:"turn"});
 await appendFile(f.file,row("changed-model"));expect((await f.observer.read(f.source))?.items[0]?.model).toBe("changed-model");
 expect((await f.observer.read(f.source))?.items[0]).not.toHaveProperty("reasoningEffort");
});
it("refuses stale instance/fresh proof and drops result after a scope change",async()=>{
 const f=await fixture();f.verified(false);expect(await f.observer.read(f.source)).toBeUndefined();f.verified(true);
 const pending=f.observer.read(f.source);f.pane.agent!.instanceId="replacement";expect(await pending).toBeUndefined();
});
it("retains membership but omits model if transcript is a symlink",async()=>{
 const f=await fixture(),other=f.file+".saved";await writeFile(other,row("outside"));await rm(f.file);await symlink(other,f.file);
 expect(await f.observer.read(f.source)).toMatchObject({count:1,items:[{id:"child-generated"}]});expect((await f.observer.read(f.source))?.items[0]).not.toHaveProperty("model");
});
