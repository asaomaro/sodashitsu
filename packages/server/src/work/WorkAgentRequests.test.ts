import { mkdtemp, mkdir, rm, rename, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { WorkAgentRequests } from "./WorkAgentRequests.js";
import { WorkContext } from "./WorkContext.js";

it("freezes the source pane project; claims once and rejects changed identity or expired requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-work-agent-"));
  try {
    let now = Date.now(), folder = join(dir, "project"); const paneId = randomUUID(), workspaceId = randomUUID();
    await mkdir(folder); await mkdir(join(dir, "state")); await mkdir(join(dir, "home"));
    const work = new WorkContext(join(dir, "state"), () => undefined, () => folder, { home: join(dir, "home"), env: {} });
    const requests = new WorkAgentRequests(work, id => id === paneId ? { workspaceId } : undefined, () => folder, () => now);
    const r = await requests.create({ paneId, agentKind: "codex", args: ["resume", "--last"] });
    expect(r.folder).toBe(folder); expect(r.workspaceId).toBe(workspaceId);
    const results = await Promise.allSettled([requests.claim(r.id), requests.claim(r.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const accepted = results.find(r => r.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<typeof requests.claim>>>;
    expect(() => requests.finish(r.id, randomUUID(), "launched")).toThrow();
    requests.finish(r.id, accepted.value.claim, "launched");
    const changed = await requests.create({ paneId, agentKind: "claude", args: [] });
    await rename(folder, folder + "-old"); await mkdir(folder);
    await expect(requests.claim(changed.id)).rejects.toThrow(/実体/);
    now += 600001;
    expect(requests.list().requests).toEqual([]);
    await expect(requests.claim(changed.id)).rejects.toThrow(/期限/);
    await expect(requests.create({ paneId, agentKind: "claude", args: ["mcp", "add", "x"] })).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("binds plugin work to its generation, reports liveness and delivers each instruction once only at idle",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"soda-plugin-agent-"));
  try{
    const root=join(dir,"project");await mkdir(root);await mkdir(join(dir,"home"));await writeFile(join(root,"task.md"),"Create artifact");await writeFile(join(root,"next.md"),"Revise it");
    const paneId=randomUUID(),workspaceId=randomUUID(),operatorPane=randomUUID();let now=Date.now(),valid=true;
    const work=new WorkContext(join(dir,"state"),()=>undefined,()=>root,{home:join(dir,"home"),env:{}});
    const requests=new WorkAgentRequests(work,()=>({workspaceId}),()=>root,()=>now);
    const invoke=vi.fn(async()=>({result:{progress:50}})),plugin={owner:"plugin-generation",pluginKey:"user:studio",taskFile:"task.md",valid:()=>{if(!valid)throw Error("revoked");},invoke};
    const request=await requests.create({paneId,agentKind:"codex",args:[]},plugin);
    expect(request.task).toEqual({pluginKey:"user:studio",taskFile:"task.md"});
    expect(()=>requests.status("other-generation",paneId,request.id)).toThrow();
    expect(()=>requests.status(plugin.owner,"other-pane",request.id)).toThrow();
    const {claim}=await requests.claim(request.id);requests.finish(request.id,claim,"launched");
    await expect(requests.poll(request.id,randomUUID(),operatorPane,"idle")).rejects.toThrow();
    await requests.poll(request.id,claim,operatorPane,"working");
    await requests.prompt(plugin.owner,paneId,request.id,"next.md");
    expect(await requests.poll(request.id,claim,operatorPane,"blocked")).toEqual({});
    const first=await requests.poll(request.id,claim,operatorPane,"idle");expect(first.instruction?.taskFile).toBe("next.md");
    expect(await requests.poll(request.id,claim,operatorPane,"idle")).toEqual({});
    expect((await requests.prompt(plugin.owner,paneId,request.id,"next.md")).instruction?.state).toBe("delivering");
    await requests.instructionResult(request.id,claim,first.instruction!.id,"sent");
    expect(requests.status(plugin.owner,paneId,request.id).instruction?.state).toBe("sent");
    expect(await requests.plugin(request.id,claim,{action:"call",name:"report",params:{progress:50}})).toEqual({result:{progress:50}});
    expect(invoke).toHaveBeenCalledWith({action:"call",name:"report",params:{progress:50}});
    now+=16000;expect(requests.status(plugin.owner,paneId,request.id).connection).toBe("stale");
    now+=600000;expect(requests.list().requests).toHaveLength(1); // launched task lifetime exceeds approval window
    valid=false;
    await expect(requests.plugin(request.id,claim,{action:"operations"})).rejects.toThrow();
    await expect(requests.check(request.id,claim)).rejects.toThrow();expect(requests.list().requests).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

it("refuses missing/outside/oversized plugin instructions and checks project identity before callbacks",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"soda-plugin-agent-"));
  try{
    const root=join(dir,"project");await mkdir(root);await mkdir(join(dir,"home"));await writeFile(join(root,"large.md"),"x".repeat(65537));await writeFile(join(root,"task.md"),"task");await writeFile(join(dir,"outside.md"),"private");await symlink(join(dir,"outside.md"),join(root,"link.md"));
    const paneId=randomUUID(),workspaceId=randomUUID(),invoke=vi.fn();
    const work=new WorkContext(join(dir,"state"),()=>undefined,()=>root,{home:join(dir,"home"),env:{}});
    const requests=new WorkAgentRequests(work,()=>({workspaceId}),()=>root);
    const plugin={owner:"owner",pluginKey:"user:studio",taskFile:"task.md",valid:()=>{},invoke};
    for(const taskFile of ["../outside.md","link.md","missing.md","large.md","a\n.md"])
      await expect(requests.create({paneId,agentKind:"claude",args:[]},{...plugin,taskFile})).rejects.toThrow();
    const r=await requests.create({paneId,agentKind:"claude",args:[]},plugin),{claim}=await requests.claim(r.id);requests.finish(r.id,claim,"launched");
    await rename(root,root+"-old");await mkdir(root);
    await expect(requests.plugin(r.id,claim,{action:"operations"})).rejects.toThrow(/実体/);expect(invoke).not.toHaveBeenCalled();
  }finally{await rm(dir,{recursive:true,force:true});}
});

it("coalesces concurrent instruction retries even when the first is already delivered; rechecks TTL and revocation after awaits",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"soda-plugin-agent-race-"));
  try{
    await mkdir(join(dir,"home"));await writeFile(join(dir,"task.md"),"task");await writeFile(join(dir,"next.md"),"next");
    let now=Date.now(),valid=true;const paneId=randomUUID(),workspaceId=randomUUID();
    const work=new WorkContext(join(dir,"state"),()=>undefined,()=>dir,{home:join(dir,"home"),env:{}});
    const requests=new WorkAgentRequests(work,()=>({workspaceId}),()=>dir,()=>now);
    const invoke=vi.fn(),plugin={owner:"owner",pluginKey:"user:app",taskFile:"task.md",valid:()=>{if(!valid)throw Error("revoked");},invoke};
    const request=await requests.create({paneId,agentKind:"codex",args:[]},plugin),{claim}=await requests.claim(request.id);
    requests.finish(request.id,claim,"launched");await requests.poll(request.id,claim,paneId,"idle");
    const original=work.scope.bind(work);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    const scope=vi.spyOn(work,"scope").mockImplementation(original);
    scope.mockImplementationOnce(original).mockImplementationOnce(async p=>{await gate;return original(p);});
    const first=requests.prompt(plugin.owner,paneId,request.id,"next.md"),second=requests.prompt(plugin.owner,paneId,request.id,"next.md");
    const queued=await first;const sent=await requests.poll(request.id,claim,paneId,"idle");
    await requests.instructionResult(request.id,claim,sent.instruction!.id,"sent");release();
    expect((await second).instruction?.id).toBe(queued.instruction!.id);
    expect(await requests.poll(request.id,claim,paneId,"idle")).toEqual({});
    let continueOperation!:()=>void;const suspended=new Promise<void>(r=>{continueOperation=r;});const effect=vi.fn();
    const operation=requests.operate(request.id,claim,async(_scope,_source,guard)=>{await suspended;guard();effect();});
    await vi.waitFor(()=>expect(scope.mock.calls.length).toBeGreaterThan(7));valid=false;continueOperation();await expect(operation).rejects.toThrow();expect(effect).not.toHaveBeenCalled();
    valid=true;
    // Advance past the lease deadline while the identity lookup is in flight.
    scope.mockImplementationOnce(async p=>{const value=await original(p);now+=25*60*60*1000;return value;});
    await expect(requests.plugin(request.id,claim,{action:"operations"})).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();
  }finally{await rm(dir,{recursive:true,force:true});}
});
