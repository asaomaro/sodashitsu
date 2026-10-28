import {Agent as HttpAgent} from "node:http";
import {Agent as HttpsAgent} from "node:https";
import WebSocket,{type ClientOptions} from "ws";
import {DesktopSigninBridge} from "./DesktopSigninBridge.js";
import {DesktopSigninDispatch,type DesktopSigninHandlers} from "./DesktopSigninDispatch.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

export interface DesktopSigninSocket {
  readonly readyState:number;readonly bufferedAmount:number;
  on(event:"open"|"close"|"error"|"pong",callback:()=>void):unknown;
  on(event:"message",callback:(bytes:Buffer|ArrayBuffer|Buffer[],binary:boolean)=>void):unknown;
  send(bytes:Uint8Array):unknown;ping():void;terminate():void;
}
/** Socket construction is injected only by generated tests, never by an RPC. */
export type DesktopSigninSocketFactory=(url:string,options:ClientOptions)=>DesktopSigninSocket;
const quiet=(fn:()=>void)=>{try{fn();}catch{}};
/** A single fixed delegation connection. Retries rebuild only the bridge;
 * every old channel is synchronously revoked and no desktop grant is replayed. */
export class DesktopSigninConnector {
  #closed=false;#generation=0;#attempt=0;
  #agent:HttpAgent|undefined;
  #retry:ReturnType<typeof setTimeout>|undefined;
  #health:ReturnType<typeof setInterval>|undefined;
  #handshake:ReturnType<typeof setTimeout>|undefined;
  #socket:DesktopSigninSocket|undefined;
  #bridge:DesktopSigninBridge|undefined;
  #dispatch:DesktopSigninDispatch|undefined;
  #connection:AbortController|undefined;
  #endConnection:(()=>void)|undefined;
  readonly #abort=()=>this.close();
  constructor(private readonly options:{
    enrollment:DesktopSigninEnrollment;handlers:DesktopSigninHandlers;
    active():boolean;signal:AbortSignal;
    socket?:DesktopSigninSocketFactory;now?:()=>number;
  }){
    options.signal.addEventListener("abort",this.#abort,{once:true});
    if(!this.live()){this.close();return;}
    this.connect();
  }
  private live():boolean {
    try{return !this.#closed&&!this.options.signal.aborted&&this.options.active()&&!this.#closed&&!this.options.signal.aborted;}catch{return false;}
  }
  private current(generation:number):boolean{return generation===this.#generation&&this.live();}
  private connect():void {
    if(!this.live()){this.close();return;}
    const generation=++this.#generation,controller=new AbortController();this.#connection=controller;
    let socket:DesktopSigninSocket,dead=false,opened=false,terminated=false;
    const terminate=()=>{if(socket&&!terminated){terminated=true;quiet(()=>socket.terminate());}};
    const now=this.options.now??(()=>performance.now()),handshakeUntil=now()+5000;let lastPong=Infinity;
    const finish=()=>{
      if(dead){terminate();return;}dead=true;
      if(generation!==this.#generation){controller.abort();terminate();return;}
      // Revoke every owner before terminating the transport or scheduling retry.
      controller.abort();this.#dispatch?.close();this.#dispatch=undefined;this.#bridge?.close();this.#bridge=undefined;
      clearInterval(this.#health);this.#health=undefined;clearTimeout(this.#handshake);this.#handshake=undefined;
      this.#socket=undefined;this.#agent?.destroy();this.#agent=undefined;
      terminate();
      if(!this.live()){this.close();return;}
      const delay=Math.min(30000,1000*2**Math.min(this.#attempt++,5));
      this.#retry=setTimeout(()=>{this.#retry=undefined;if(this.current(generation))this.connect();},delay);this.#retry.unref();
    };
    this.#endConnection=finish;
    try{
      if(!this.current(generation)){finish();return;}
      const credential=this.options.enrollment.delegation();
      this.#agent=new (credential.url.startsWith("wss:")?HttpsAgent:HttpAgent)({keepAlive:false,maxSockets:1,maxTotalSockets:1});
      socket=(this.options.socket??((url,options)=>new WebSocket(url,options)))(credential.url,{
        headers:{authorization:"Bearer "+credential.token,"x-soda-machine-id":credential.machineId},
        agent:this.#agent,...(credential.caPem===undefined?{}:{ca:credential.caPem}),rejectUnauthorized:true,followRedirects:false,handshakeTimeout:5000,
        perMessageDeflate:false,maxPayload:32768,
      });
      socket.on("error",finish);socket.on("close",finish);
      if(dead||!this.current(generation)){finish();return;}
      this.#socket=socket;
      const active=()=>{
        if(dead||controller.signal.aborted||!this.current(generation)||this.#socket!==socket)return false;
        let fresh=false;try{fresh=opened?now()-lastPong<45000:now()<handshakeUntil;}catch{}
        return fresh&&!dead&&!controller.signal.aborted&&generation===this.#generation&&!this.#closed&&this.#socket===socket;
      };
      this.#handshake=setTimeout(finish,5000);this.#handshake.unref();
      socket.on("open",()=>{
        if(!active()||opened){finish();return;}opened=true;this.#attempt=0;
        clearTimeout(this.#handshake);this.#handshake=undefined;lastPong=now();
        socket.on("pong",()=>{if(!active()){finish();return;}lastPong=now();});
        this.#health=setInterval(()=>{
          if(!active()||now()-lastPong>=45000){finish();return;}
          try{socket.ping();}catch{finish();}
        },15000);this.#health.unref();
        this.#dispatch=new DesktopSigninDispatch({enrollment:this.options.enrollment,handlers:this.options.handlers,active,signal:controller.signal});
        this.#bridge=new DesktopSigninBridge({
          accept:connection=>{if(!active())throw new Error("Signin connection is unavailable");this.#dispatch!.accept(connection);},
          active,signal:controller.signal,bufferedAmount:()=>socket.bufferedAmount,
          send:bytes=>{if(!active()||socket.readyState!==WebSocket.OPEN)throw new Error("Signin connection is unavailable");socket.send(bytes);},end:finish,
        });
        if(!active())finish();
      });
      socket.on("message",(raw,binary)=>{
        if(!active()||!opened||!binary){finish();return;}
        try{
          const size=Array.isArray(raw)?raw.reduce((sum,item)=>sum+item.byteLength,0):raw.byteLength;
          if(size>32768){finish();return;}
          const bytes=Array.isArray(raw)?Buffer.concat(raw):Buffer.isBuffer(raw)?raw:Buffer.from(raw);
          this.#bridge?.receive(bytes);
        }catch{finish();}
      });
    }catch{finish();}
  }
  close():void {
    if(this.#closed)return;this.#closed=true;this.#generation++;
    this.options.signal.removeEventListener("abort",this.#abort);
    clearTimeout(this.#retry);clearInterval(this.#health);clearTimeout(this.#handshake);this.#retry=undefined;this.#health=undefined;this.#handshake=undefined;
    const end=this.#endConnection;this.#endConnection=undefined;if(end)end();
    this.#connection?.abort();this.#dispatch?.close();this.#dispatch=undefined;this.#bridge?.close();this.#bridge=undefined;
    this.#socket=undefined;this.#agent?.destroy();this.#agent=undefined;
  }
}
