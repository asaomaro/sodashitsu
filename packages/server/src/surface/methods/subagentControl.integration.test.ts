import { randomUUID } from "node:crypto";
import { mkdtemp,mkdir,writeFile,chmod,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { expect,it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { ControlSurface } from "../ControlSurface.js";
import { registerAgentMethods } from "./agent.js";
import type { MethodDeps } from "./deps.js";
import { SubagentControlService } from "../../agent/SubagentControlService.js";
import { codexSubagentInput } from "../../agent/CodexSubagentControl.js";

it.skipIf(process.platform!=="linux")("auth surface routes one generated child instruction to the existing owned Unix daemon and never its parent",async()=>{
 const home=await mkdtemp(join(tmpdir(),"soda-child-control-api-")),parent=randomUUID(),child=randomUUID(),paneId=randomUUID();
 const http=createServer(),server=new WebSocketServer({server:http});let listening=false;
 const writes:Array<{method:string;params:any}>=[];
 const pane={id:paneId,agent:{kind:"codex",instanceId:randomUUID(),subagents:{count:1,items:[{id:child,startedAt:1,depth:1}]}},agentSession:{kind:"codex",sessionId:parent}} as Pane;
 let verified=true,authorized=true;
 const session={getPane:(id:string)=>id===paneId?pane:undefined,hasVerifiedAgentSession:()=>verified};
 const service=new SubagentControlService({session,input:r=>codexSubagentInput(r,{home})});
 try{
  const control=join(home,"app-server-control"),daemon=join(home,"app-server-daemon"),records=join(home,"sessions","2026","11","08");
  await mkdir(control,{mode:0o700});await mkdir(daemon,{mode:0o700});await mkdir(records,{recursive:true});
  await writeFile(join(daemon,"daemon.pid"),JSON.stringify({pid:process.pid}),{mode:0o600});
  await writeFile(join(records,`rollout-2026-11-08-${child}.jsonl`),JSON.stringify({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:parent}}}}})+"\n");
  const socket=join(control,"app-server-control.sock");await new Promise<void>(r=>http.listen(socket,r));listening=true;await chmod(socket,0o600);
  server.on("connection",ws=>ws.on("message",b=>{
    const row=JSON.parse(b.toString());if(row.id===undefined)return;
    if(row.method.startsWith("turn/"))writes.push(row);
    const result=row.method==="initialize"?{userAgent:"generated-0.166"}:row.method==="thread/loaded/list"?{data:[parent,child]}:row.method==="thread/read"?{thread:{id:child,path:join(records,`rollout-2026-11-08-${child}.jsonl`),canAcceptDirectInput:true,status:{type:"idle"}}}:{turn:{id:randomUUID()}};
    ws.send(JSON.stringify({id:row.id,result}));
  }));
  const surface=new ControlSurface();registerAgentMethods(surface,{session,terminals:{},sizeAuthority:{},subagentControl:service} as unknown as MethodDeps);
  const ctx={clientId:"own-generated",sink:{} as never,connectionAuthorized:()=>authorized};
  const prepared=await surface.invoke(ctx,"agent.subagent_control",{paneId,agentId:child});expect(prepared.ok).toBe(true);
  if(!prepared.ok)throw Error();const lease=prepared.result as {mode:string;leaseId:string};expect(lease.mode).toBe("direct");
  const params={paneId,agentId:child,leaseId:lease.leaseId,requestId:randomUUID(),text:"generated harmless instruction"};
  const sent=await surface.invoke(ctx,"agent.subagent_send",params);expect(sent).toMatchObject({ok:true,result:{status:"accepted"}});
  expect(await surface.invoke(ctx,"agent.subagent_send",params)).toEqual(sent);expect(writes).toHaveLength(1);
  expect(writes[0]!.params.threadId).toBe(child);expect(writes[0]!.params.threadId).not.toBe(parent);
  expect(writes[0]!.params).not.toHaveProperty("approvalPolicy");expect(writes[0]!.params).not.toHaveProperty("sandboxPolicy");
  verified=false;expect(await surface.invoke(ctx,"agent.subagent_control",{paneId,agentId:child})).toMatchObject({ok:true,result:{mode:"parent-draft",reason:"target-unavailable"}});
  authorized=false;expect(await surface.invoke(ctx,"agent.subagent_send",{...params,requestId:randomUUID()})).toMatchObject({ok:true,result:{status:"rejected",reason:"scope-expired"}});expect(writes).toHaveLength(1);
 }finally{
  service.close();for(const ws of server.clients)ws.terminate();await new Promise<void>(r=>server.close(()=>r()));if(listening)await new Promise<void>(r=>http.close(()=>r()));await rm(home,{recursive:true,force:true});
 }
},15000);
