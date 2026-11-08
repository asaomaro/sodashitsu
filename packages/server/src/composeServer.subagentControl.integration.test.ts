import { mkdtemp,rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
vi.mock("./surface/methods/WslHostResources.js",()=>({isWslHost:()=>false,WslHostResourcesCache:class{get(){return undefined;}}}));
it("production composition registers authenticated child control without launching an agent or model",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-child-control-compose-"));
 const keys=["HOME","CODEX_HOME","GROK_HOME","CLAUDE_CONFIG_DIR","COPILOT_HOME","XDG_DATA_HOME","SODA_ASSISTANT_ENABLED","NODE_OPTIONS","NODE_PATH","NODE_REPL_HISTORY"] as const;
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  for(const key of ["HOME","CODEX_HOME","GROK_HOME","CLAUDE_CONFIG_DIR","COPILOT_HOME","XDG_DATA_HOME"])process.env[key]=join(dir,key);
  process.env.SODA_ASSISTANT_ENABLED="0";process.env.NODE_REPL_HISTORY="";delete process.env.NODE_OPTIONS;delete process.env.NODE_PATH;
  server=await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"state"),origin:[],shell:process.execPath});
  const origin=`http://127.0.0.1:${server.options.port}`;
  const login=await fetch(`${origin}/api/login`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({token:server.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(`ws://127.0.0.1:${server.options.port}/ws`,{headers:{origin,cookie:login.headers.get("set-cookie")!.split(";")[0]!}});await new Promise<void>((r,j)=>{ws!.once("open",r);ws!.once("error",j);});
  const socket=ws;let seq=0;const pending=new Map<string,(row:any)=>void>();socket.on("message",(raw,binary)=>{if(binary)return;const row=JSON.parse(raw.toString());if(row.id){pending.get(row.id)?.(row);pending.delete(row.id);}});
  const call=(method:string,params:unknown)=>new Promise<any>((resolve,reject)=>{const id=`generated-${++seq}`,timer=setTimeout(()=>{pending.delete(id);reject(Error("fixture RPC deadline"));},5000);pending.set(id,row=>{clearTimeout(timer);resolve(row);});socket.send(JSON.stringify({id,method,params}));});
  const hello=await call("client.hello",{protocol:1,kind:"desktop"}),paneId=hello.result.snapshot.panes[0].id;
  expect((await call("agent.subagent_control",{paneId,agentId:randomUUID()})).result).toEqual({mode:"parent-draft",reason:"target-unavailable"});
  expect((await call("agent.subagent_send",{paneId,agentId:randomUUID(),leaseId:randomUUID(),requestId:randomUUID(),text:"generated"})).result).toEqual({status:"rejected",reason:"scope-expired"});
  expect(server.session.getPane(paneId)?.agent).toBeNull();
 }finally{
  ws?.terminate();await server?.close();for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 }
},15000);
