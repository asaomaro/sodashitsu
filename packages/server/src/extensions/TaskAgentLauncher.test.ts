import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RpcError, type Pane, type ExtPane } from "@sodashitsu/protocol";
import { TaskAgentLauncher, TaskStartSchema, type TaskAgentDeps } from "./TaskAgentLauncher.js";
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
function pane(id:string):Pane{return {id,tabId:"t",label:null,cwd:"/",shell:"/bin/bash",cols:80,rows:24,status:"running",failure:null,busy:false,title:"",rightClick:"herdr",agent:null,agentSession:null};}
async function setup(){
 const root=await mkdtemp(join(tmpdir(),"soda-task-agent-"));roots.push(root);await writeFile(join(root,"task.md"),"Make a video");
 const panes=new Map([["worker",pane("worker")]]);let revoked=false;
 const target=():ExtPane=>{if(revoked)throw new RpcError("not_found","revoked");return {id:"anchor",virtual:true,tabId:"t",projectDir:root,workspaceId:"w",workspaceLabel:"W",workspaceCwd:root,label:null,agent:null};};
 const split=vi.fn(async()=>{const fresh=pane("new");panes.set("new",fresh);return {pane:fresh};});
 const start=vi.fn(async(_p:unknown,accepted?:()=>void,o?:{beforeWrite?:()=>void})=>{accepted?.();o?.beforeWrite?.();return {};});
 const kinds=vi.fn(async()=>({kinds:[{kind:"codex",label:"Codex",available:true},{kind:"claude",label:"Claude",available:false},{kind:"gemini",label:"Gemini",available:true}]}));
 const deps={session:{getPane:(id:string)=>panes.get(id),getTab:()=>({focusedPaneId:"worker"}),splitPane:split},starter:{start,isShellAvailable:vi.fn(async()=>true)},kinds} as unknown as TaskAgentDeps;
 return {root,panes,target,split,start,kinds,launcher:new TaskAgentLauncher(deps),deps,revoke:()=>{revoked=true;}};
}
const params={paneId:"anchor",kind:"codex" as const,taskFile:"task.md"};
it("creates a fresh same-tab PJ terminal and sends a single initial task prompt",async()=>{
 const s=await setup();const result=await s.launcher.start("user:studio",params,s.target);
 expect(s.split).toHaveBeenCalledWith("worker","right",undefined,{policy:"path",path:s.root});expect(result).toMatchObject({paneId:"new",kind:"codex",status:"submitted"});
 expect(s.start.mock.calls[0]?.[0]).toMatchObject({paneId:"new",kind:"codex",args:[expect.stringContaining(join(s.root,"task.md"))]});expect(s.panes.get("worker")?.agent).toBeNull();
 expect((await s.launcher.kinds()).kinds.map(k=>k.kind)).toEqual(["codex","claude"]);
});
it("coalesces repeated requests for a live task pane and starts again only after it closes",async()=>{
 const s=await setup();const [a,b]=await Promise.all([s.launcher.start("u",params,s.target),s.launcher.start("u",params,s.target)]);expect(a).toEqual(b);expect(s.split).toHaveBeenCalledTimes(1);
 await s.launcher.start("u",params,s.target);expect(s.start).toHaveBeenCalledTimes(1);s.panes.delete("new");await s.launcher.start("u",params,s.target);expect(s.start).toHaveBeenCalledTimes(2);
});
it("rejects traversal, outside links, missing tasks and unavailable agents before creating a pane",async()=>{
 const s=await setup();await symlink("/etc/passwd",join(s.root,"linked.md"));
 for(const taskFile of ["../task.md","/etc/passwd","linked.md","missing.md"]){await expect(s.launcher.start("u",{...params,taskFile},s.target)).rejects.toBeDefined();}
 await expect(s.launcher.start("u",{...params,kind:"claude"},s.target)).rejects.toMatchObject({code:"unsupported_agent_kind"});expect(s.split).not.toHaveBeenCalled();
});
it("rechecks the extension scope at the moment of writing and preserves the failed new pane",async()=>{
 const s=await setup();s.start.mockImplementation(async(_p,accepted,o)=>{accepted?.();s.revoke();o?.beforeWrite?.();return {};});
 await expect(s.launcher.start("u",params,s.target)).rejects.toMatchObject({code:"not_found",message:expect.stringContaining("作業ペイン new")});expect(s.panes.has("new")).toBe(true);expect(s.panes.has("worker")).toBe(true);
});
it("limits task parameters to supported initial-prompt agents",()=>{expect(TaskStartSchema.safeParse({...params,kind:"sh",args:["rm"]}).success).toBe(false);expect(TaskStartSchema.safeParse(params).success).toBe(true);});

it("refuses to write if the fresh pane moves during startup",async()=>{
 const s=await setup();s.start.mockImplementation(async(_p,accepted,o)=>{accepted?.();s.panes.get("new")!.tabId="other";o?.beforeWrite?.();return {};});
 await expect(s.launcher.start("u",params,s.target)).rejects.toMatchObject({code:"not_found"});expect(s.panes.get("new")?.tabId).toBe("other");
});
it("rejects changing the kind of an inflight task and replaces a task pane moved to another tab",async()=>{
 const s=await setup();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});s.start.mockImplementationOnce(async()=>{await gate;return {};});
 const first=s.launcher.start("u",params,s.target);await vi.waitFor(()=>expect(s.start).toHaveBeenCalled());
 expect(()=>s.launcher.start("u",{...params,kind:"claude"},s.target)).toThrow();release();await first;
 s.panes.get("new")!.tabId="other";await s.launcher.start("u",params,s.target);expect(s.split).toHaveBeenCalledTimes(2);
});
