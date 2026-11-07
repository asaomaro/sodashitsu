import {createServer} from "node:http";
import {mkdtemp,mkdir,writeFile,chmod,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {afterEach,expect,it} from "vitest";
import {WebSocketServer} from "ws";
import {openCodexControl} from "./CodexControlSocket.js";
import {sendCodexAudio} from "../assistant/CodexAudio.js";
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()});
async function fixture(options:{lost?:boolean;changed?:boolean}={}) {
 const home=await mkdtemp(join(tmpdir(),"soda-codex-control-channel-")),control=join(home,"app-server-control"),daemon=join(home,"app-server-daemon");
 await mkdir(control,{mode:0o700});await mkdir(daemon,{mode:0o700});const pidPath=join(daemon,"daemon.pid");await writeFile(pidPath,JSON.stringify({pid:process.pid}),{mode:0o600});
 const socket=join(control,"app-server-control.sock"),http=createServer(),server=new WebSocketServer({server:http});await new Promise<void>(resolve=>http.listen(socket,resolve));await chmod(socket,0o600);
 const id=randomUUID(),requests:string[]=[],inputs:unknown[]=[];
 server.on("connection",ws=>ws.on("message",async bytes=>{
  const row=JSON.parse(bytes.toString());requests.push(row.method);if(row.id===undefined)return;
  if(row.method==="turn/start"){inputs.push(row.params);if(options.lost){ws.close();return;}}
  if(row.method==="thread/read"&&options.changed)await writeFile(pidPath,JSON.stringify({pid:process.pid,generation:2}));
  const result=row.method==="initialize"?{userAgent:"generated"}:row.method==="thread/loaded/list"?{data:[id]}:row.method==="thread/read"?{thread:{id,cwd:"/generated/assistant",status:{type:"idle"}}}:row.method==="model/list"?{data:[]}: {turn:{id:"generated-audio-turn"}};
  ws.send(JSON.stringify({id:row.id,result}));
 }));
 cleanups.push(async()=>{for(const ws of server.clients)ws.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise<void>(resolve=>http.close(()=>resolve()));await rm(home,{recursive:true,force:true})});
 const controller=new AbortController();const target={home,key:"generated",signal:controller.signal,expires:performance.now()+10000,check:()=>{},requestMs:1000,maxRequests:4};return{home,id,requests,inputs,target};
}
const linux=it.runIf(process.platform==="linux");
linux("uses a caller-specific typed and runtime readonly allowlist",async()=>{
 const f=await fixture(),channel=await openCodexControl(f.target,["initialize","model/list"] as const);
 try{
  await channel.request("initialize",{});channel.initialized();await channel.request("model/list",{});
  expect(()=>channel.request("turn/start" as "initialize",{})).toThrow("method");
  expect(f.requests).toEqual(["initialize","initialized","model/list"]);
 }finally{expect(await channel.close()).toBe(true)}
});
linux("delivers generated localAudio over actual Unix WebSocket framing with one turn request",async()=>{
 const f=await fixture();
 const result=await sendCodexAudio({threadId:f.id,projectDir:"/generated/assistant",path:"/generated/reviewed.wav"},f.target.signal,performance.now()+10000,()=>{},{canonical:async path=>path,open:(target,allowed)=>openCodexControl({...target,home:f.home},allowed)});
 expect(result).toEqual({turnId:"generated-audio-turn"});expect(f.requests).toEqual(["initialize","initialized","thread/loaded/list","thread/read","turn/start"]);
 expect(f.inputs[0]).toMatchObject({threadId:f.id,input:[{type:"text"},{type:"localAudio",path:"/generated/reviewed.wav"}]});expect(f.inputs[0]).not.toHaveProperty("model");
});
linux.each(["lost","changed"] as const)("never retries or sends against %s generation/acknowledgement",async kind=>{
 const f=await fixture({[kind]:true});
 await expect(sendCodexAudio({threadId:f.id,projectDir:"/generated/assistant",path:"/generated/reviewed.wav"},f.target.signal,performance.now()+10000,()=>{},{canonical:async path=>path,open:(target,allowed)=>openCodexControl({...target,home:f.home},allowed)})).rejects.toThrow();
 expect(f.requests.filter(m=>m==="turn/start")).toHaveLength(kind==="lost"?1:0);
});

linux("holds the caller ownership quota until physical socket close",async()=>{
 const f=await fixture(),owned=new Set<Promise<void>>(),channel=await openCodexControl({...f.target,owned},["initialize"] as const);
 expect(owned.size).toBe(1);await channel.request("initialize",{});expect(owned.size).toBe(1);
 expect(await channel.close()).toBe(true);expect(owned.size).toBe(0);
});
