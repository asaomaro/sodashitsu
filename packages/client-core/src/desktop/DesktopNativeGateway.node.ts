import {createServer} from "node:http";
import type {Socket} from "node:net";
import {randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {WebSocketServer,WebSocket} from "ws";
import {DesktopNativeHelperDescriptor,type DesktopNativeHelperEvent} from "@sodashitsu/protocol";
import {DesktopNativeBinary} from "./DesktopNativeBinary.node.js";
import {DesktopNativeHost} from "./DesktopNativeHost.node.js";
export type NativeChannel={receive(raw:unknown):void;close():Promise<void>;readonly closed:Promise<void>};
export type NativeFactory=(options:{origin:string;executable:string;args?:readonly string[];emit(event:DesktopNativeHelperEvent):void})=>NativeChannel;
type Binary={prepare():Promise<void>;readonly executable:string;readonly arguments?:readonly string[];retirePreparation?():Promise<void>;close():Promise<void>};
/** A dedicated browser-PC helper. No public server RPC carries file contents. */
export class DesktopNativeGateway {
 private resolveDone!:(ok:boolean)=>void;readonly done=new Promise<boolean>(resolve=>{this.resolveDone=resolve;});
 readonly id=randomUUID();private readonly secret=randomBytes(32).toString("base64url");private readonly nonce=randomBytes(16).toString("base64url");private host="";private claimed=false;private stopped=false;private closing:Promise<void>|undefined;private client:WebSocket|undefined;private native:NativeChannel|undefined;private preparing:Promise<void>|undefined;private readonly sockets=new Set<Socket>();private readonly server;private readonly ws=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false});private readonly expires:ReturnType<typeof setTimeout>;
 private constructor(private parent:string,private binary:Binary,private nativeFactory:NativeFactory=options=>new DesktopNativeHost(options)){
  const origin=new URL(parent);if(!["http:","https:"].includes(origin.protocol)||origin.origin!==parent)throw Error("Invalid browser origin");
  this.server=createServer({maxHeaderSize:8192,requestTimeout:5000},(req,res)=>{
   if(this.stopped||req.method!=="GET"||req.url!==`/bridge?id=${this.id}`||req.headers.host!==this.host||req.socket.remoteAddress!=="127.0.0.1"){res.writeHead(403).end();return;}
   const script=this.page();res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Security-Policy":`default-src 'none'; script-src 'nonce-${this.nonce}'; connect-src ws://${this.host}; frame-ancestors ${parent}; base-uri 'none'; form-action 'none'`});res.end(`<!doctype html><script nonce="${this.nonce}">${script}</script>`);
  });
  this.server.headersTimeout=5000;this.server.maxConnections=16;this.server.on("connection",socket=>{this.sockets.add(socket);socket.once("close",()=>this.sockets.delete(socket));});
  this.server.on("upgrade",(req,socket,head)=>{
   if(this.stopped||this.claimed||req.url!=="/channel"||req.headers.host!==this.host||req.headers.origin!==`http://${this.host}`||req.socket.remoteAddress!=="127.0.0.1"){socket.destroy();return;}
   // Reserve before async handshake: another connection cannot race a claim.
   this.claimed=true;this.ws.handleUpgrade(req,socket,head,client=>{void this.attach(client);});
  });
  this.expires=setTimeout(()=>{void this.close();},30000);this.expires.unref();
 }
 static async listen(parent:string,options:{binary?:Binary;nativeFactory?:NativeFactory}={}){
  const gateway=new DesktopNativeGateway(parent,options.binary??new DesktopNativeBinary(),options.nativeFactory);
  try{await new Promise<void>((resolve,reject)=>{gateway.server.once("error",reject);gateway.server.listen(0,"127.0.0.1",()=>{gateway.server.off("error",reject);resolve();});});const port=(gateway.server.address() as{port:number}).port;gateway.host=`n${randomBytes(16).toString("hex")}.localhost:${port}`;return gateway;}catch(error){await gateway.close();throw error;}
 }
 descriptor(){return DesktopNativeHelperDescriptor.parse({id:this.id,origin:`http://${this.host}`,url:`http://${this.host}/bridge?id=${this.id}`});}
 private send(event:DesktopNativeHelperEvent){const client=this.client;if(this.stopped||!client||client.readyState!==WebSocket.OPEN||client.bufferedAmount>262144){void this.close();return;}client.send(JSON.stringify(event));}
 private async attach(client:WebSocket){
  this.client=client;let verified=false,preparing=false;const handshake=setTimeout(()=>{void this.close();},5000);handshake.unref();
  client.on("error",()=>{void this.close();});client.on("close",()=>{clearTimeout(handshake);void this.close();});
  client.on("message",(raw,binary)=>{
   try{
    const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);if(binary||bytes.length>100000||this.stopped)throw Error("Native helper message refused");const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!verified){
     if(preparing||!data||Object.keys(data).length!==2||data.type!=="claim"||typeof data.secret!=="string")throw Error("Native helper claim refused");
     const actual=Buffer.from(data.secret),expected=Buffer.from(this.secret);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error("Native helper claim refused");
     preparing=true;clearTimeout(handshake);clearTimeout(this.expires);
     this.preparing=(async()=>{await this.binary.prepare();if(this.stopped)return;const native=this.nativeFactory({origin:this.parent,executable:this.binary.executable,args:this.binary.arguments??[],emit:event=>this.send(event)});if(this.stopped){await native.close();return;}this.native=native;void native.closed.then(()=>{void this.close();});verified=true;this.send({type:"ready",id:this.id});})();void this.preparing.catch(()=>{this.send({type:"error",message:"このPCのWindows補助プログラムを準備できませんでした"});void this.close();});return;
    }
    this.native!.receive(data);if(data.type==="beat")this.send({type:"alive"});
   }catch{void this.close();}
  });
 }
 private page(){
  // The inherited MessagePort is accepted only from the exact parent window and
  // origin. The local secret never travels through a public API or URL.
  return `(()=>{"use strict";const id=${JSON.stringify(this.id)},origin=${JSON.stringify(this.parent)};let port,ws,closed=false;function stop(){if(closed)return;closed=true;if(ws)ws.close();if(port)port.close();}addEventListener("message",event=>{if(port||parent===window||event.source!==parent||event.origin!==origin||event.data?.type!=="soda-native-connect"||event.data.id!==id||event.ports.length!==1)return;port=event.ports[0];ws=new WebSocket(${JSON.stringify(`ws://${this.host}/channel`)});ws.onopen=()=>ws.send(JSON.stringify({type:"claim",secret:${JSON.stringify(this.secret)}}));ws.onmessage=event=>{try{port.postMessage(JSON.parse(event.data));}catch{stop();}};ws.onclose=()=>{try{port.postMessage({type:"error",message:"補助プログラムとの接続が終了しました"});}catch{}stop();};ws.onerror=()=>{try{port.postMessage({type:"error",message:"補助プログラムとの接続が終了しました"});}catch{}stop();};port.onmessage=event=>{try{if(ws.readyState!==1)throw Error();ws.send(JSON.stringify(event.data));}catch{stop();}};port.start();});addEventListener("pagehide",stop);parent.postMessage({type:"soda-native-frame",id},origin);})();`;
 }
 close():Promise<void>{return this.closing??=(async()=>{
  this.stopped=true;const retiring=this.binary.retirePreparation?.();clearTimeout(this.expires);this.client?.terminate();for(const socket of this.sockets)socket.destroy();let ok=true;
  try{await this.preparing?.catch(()=>{});await this.native?.close();await retiring;await this.binary.close();}catch{ok=false;}
  finally{const results=await Promise.allSettled([new Promise<void>(resolve=>this.ws.close(()=>resolve())),new Promise<void>(resolve=>this.server.close(()=>resolve()))]);if(results.some(value=>value.status==="rejected"))ok=false;this.resolveDone(ok);}
 })();}
}
