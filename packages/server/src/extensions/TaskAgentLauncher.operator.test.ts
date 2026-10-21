import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { TaskAgentLauncher } from "./TaskAgentLauncher.js";
import { WorkAgentRequests } from "../work/WorkAgentRequests.js";
import { WorkContext } from "../work/WorkContext.js";
import type { ExtPane } from "@sodashitsu/protocol";

it("creates an operator request without B CLI discovery or terminal creation and coalesces repeated starts",async()=>{
  const root=await mkdtemp(join(tmpdir(),"soda-task-operator-"));
  try{
    await mkdir(join(root,"home"));await writeFile(join(root,"task.md"),"Create on B");
    const paneId=randomUUID(),workspaceId=randomUUID(),tabId=randomUUID();let valid=true;
    const work=new WorkContext(join(root,"state"),()=>undefined,()=>root,{home:join(root,"home"),env:{}});
    const operator=new WorkAgentRequests(work,()=>({workspaceId}),()=>root);
    const kinds=vi.fn(async()=>({kinds:[]})),splitPane=vi.fn(),start=vi.fn();
    const launcher=new TaskAgentLauncher({operator,kinds,session:{getPane:()=>undefined,getTab:()=>undefined,splitPane},starter:{start,isShellAvailable:vi.fn()}});
    const target=():ExtPane=>{if(!valid)throw Error("revoked");return {id:paneId,tabId,workspaceId,workspaceLabel:"Project",workspaceCwd:root,projectDir:root,virtual:true,label:null,agent:null};};
    expect((await launcher.kinds("operator")).kinds.map(k=>k.kind)).toEqual(["claude","codex"]);
    const p={paneId,kind:"codex" as const,taskFile:"task.md",execution:"operator" as const},invoke=vi.fn(async()=>({result:"ok"}));
    const a=await launcher.startOperator("generation","user:studio",p,target,invoke);
    const b=await launcher.startOperator("generation","user:studio",p,target,invoke);
    expect(a).toEqual(b);expect(operator.list().requests).toHaveLength(1);
    expect(kinds).not.toHaveBeenCalled();expect(splitPane).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
    await expect(launcher.startOperator("generation","user:studio",{...p,kind:"claude"},target,invoke)).rejects.toThrow();
    valid=false;expect(operator.list().requests).toEqual([]);
  }finally{await rm(root,{recursive:true,force:true});}
});
