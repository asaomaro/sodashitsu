import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {EventEmitter} from "node:events";
import {PassThrough,Writable} from "node:stream";
import {join} from "node:path";
import {it,expect,vi} from "vitest";
import WebSocket from "ws";
import {RpcError,DESKTOP_INPUT_PROTOCOL,DESKTOP_SHARED_PROTOCOL} from "@sodashitsu/protocol";
import {OriginRejectionLog} from "../auth/OriginRejectionLog.js";

const generated=vi.hoisted(()=>({spawn:(..._args:unknown[]):unknown=>{throw Error("Unconfigured generated helper");}}));
vi.mock("node:child_process",async original=>({...await original<typeof import("node:child_process")>(),spawn:(...args:unknown[])=>generated.spawn(...args)}));
// Existing ResourceChannel FakeChild contract: an exit event is deliberately
// distinct from physical close. This does NOT prove Windows/SYSTEM worker exit.
class Helper extends EventEmitter{
  stdout=new PassThrough();stderr=new PassThrough();exitCode:number|null=null;signalCode=null;
  commands:Record<string,any>[]=[];kill=vi.fn(()=>true);
  stdin=new Writable({write:(raw,_encoding,done)=>{const value=JSON.parse(String(raw));this.commands.push(value);if(value.type==="configure")queueMicrotask(()=>{this.send({type:"ready",width:320,height:180,title:"Generated",backend:"windows-gdi",allowInput:true,});const png=Buffer.alloc(24);for(const[o,v]of[[0,0x89504e47],[4,0x0d0a1a0a],[12,0x49484452],[16,320],[20,180]])png.writeUInt32BE(v!,o!);this.send({type:"frame",info:{seq:1,width:320,height:180,format:"image/png",captureMs:0,encodeMs:0},data:png.toString("base64")});});done();}});
  send(value:unknown){this.stdout.write(JSON.stringify(value)+"\n");}
  exitOnly(){this.exitCode=0;this.emit("exit",0,null);}
  physicalClose(){this.exitCode=0;this.stdout.end();this.stderr.end();this.emit("close",0,null);}
}
const source=process.env.DESKTOP_RETIREMENT_SOURCE_ROOT;
const {DesktopProvider}=await import(source?join(source,"packages/server/src/desktop/DesktopProvider.ts"):"./DesktopProvider.js");
const {DesktopRelay}=await import(source?join(source,"packages/server/src/desktop/DesktopRelay.ts"):"./DesktopRelay.js");

it.each([false,true])("reconnects only after the retiring physical helper closes, shared=%s",async shared=>{
 const children:Helper[]=[],sockets:WebSocket[]=[];generated.spawn=(command)=>{expect(command).toBe("generated-retirement-helper");const child=new Helper();children.push(child);return child;};
 const web=createServer();await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(web.address()as AddressInfo).port}`,url=origin.replace("http","ws")+"/desktop-share";
 const provider=new DesktopProvider({command:["generated-retirement-helper"],allowInput:true,origins:()=>[origin]}),p=provider as any;
 const auth={authorizeUpgrade:async(req:any)=>req.headers.cookie==="test=ok"?{ok:true,sessionId:"ok"}:{ok:false},verifySession:(id:string)=>id==="ok",onSessionRevoked:()=>({dispose(){}})};
 const origins=new OriginRejectionLog({debug(){},info(){},warn(){},error(){}},{isAllowed:(o,h)=>o===origin&&h===new URL(origin).host,isHostAllowed:()=>true,allowedHostPorts:()=>[new URL(origin).host]});
 let owners=0;const link={openChannel(){const owner=`generated-${owners++}`;let onText=(s:string)=>{},onClose=()=>{},closed=false;return{onText(f:typeof onText){onText=f;},onBinary(){},onClose(f:typeof onClose){onClose=f;},sendText(raw:string){const m=JSON.parse(raw);void(async()=>{try{const result=m.method==="client.hello"?{}:m.method==="desktop.capabilities"?provider.capabilities():await provider.start(owner,m.params);onText(JSON.stringify({id:m.id,result}));}catch(e){onText(JSON.stringify({id:m.id,error:e instanceof RpcError?e.toProtocolError():{message:"Generated refusal"}}));}})();},close(){if(closed)return;closed=true;provider.clientGone(owner);onClose();}};}};
 const relay=new DesktopRelay(auth as any,origins,{route:(id:string)=>id==="remote"?{kind:"ok",link}:{kind:"unknown"}}as any);web.on("upgrade",(req,socket,head)=>{void relay.upgrade(req,socket,head);});
 async function viewer(){const ws=new WebSocket(url,[DESKTOP_INPUT_PROTOCOL,...(shared?[DESKTOP_SHARED_PROTOCOL]:[])],{headers:{cookie:"test=ok",origin}}),messages:any[]=[],frames:Buffer[]=[];sockets.push(ws);ws.on("error",()=>{});ws.on("message",(raw,binary)=>{if(binary)frames.push(Buffer.from(raw as Buffer));else messages.push(JSON.parse(String(raw)));});await new Promise<void>((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});ws.send(JSON.stringify({type:"start",machineId:"remote",options:{width:320,fps:10,quality:65,...(shared?{features:true,sharedDesktop:true}:{})}}));return{ws,messages,frames,send:(m:unknown)=>ws.send(JSON.stringify(m))};}
 try{
  const first=await viewer();await vi.waitFor(()=>expect(first.frames.length).toBe(1));const old=children[0]!;first.send({type:"ack",seq:1});first.send({type:"control",enabled:true});await vi.waitFor(()=>expect(first.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true));first.send({type:"input",seq:1,input:{kind:"pointer",event:"move",button:0,x:0.5,y:0.5}});await vi.waitFor(()=>expect(old.commands.some(m=>m.type==="input")).toBe(true));
  const share=p.active??[...p.shared][0];p.stop(share);expect(share.dead).toBe(true);
  const blocked=await viewer();await vi.waitFor(()=>expect(p.pendingStarts.size).toBe(1));expect(blocked.messages.some(m=>m.type==="ready")).toBe(false);expect(children).toHaveLength(1);expect(p.physicalHelpers.size).toBe(1);
  old.exitOnly();const exitedOnly=await viewer();await vi.waitFor(()=>expect(p.pendingStarts.size).toBe(2));expect(exitedOnly.messages.some(m=>m.type==="ready")).toBe(false);expect(children).toHaveLength(1);expect(p.physicalHelpers.size).toBe(1);
  blocked.ws.terminate();exitedOnly.ws.terminate();await vi.waitFor(()=>expect([...p.pendingStarts].every((start:any)=>start.cancelled)).toBe(true));
  old.physicalClose();await vi.waitFor(()=>expect(p.physicalHelpers.size).toBe(0));await vi.waitFor(()=>expect(p.pendingStarts.size).toBe(0));const fresh=await viewer();await vi.waitFor(()=>expect(fresh.messages.some(m=>m.type==="ready")).toBe(true));await vi.waitFor(()=>expect(fresh.frames.length).toBe(1));expect(children).toHaveLength(2);expect(fresh.messages.some(m=>m.type==="control"&&m.enabled)).toBe(false);expect(children[1]!.commands.some(m=>m.type==="resource_epoch"||m.type==="input")).toBe(false);
 }finally{for(const ws of sockets)ws.terminate();relay.dispose();provider.dispose();for(const child of children)child.physicalClose();await new Promise<void>(resolve=>web.close(()=>resolve()));}
},10000);
