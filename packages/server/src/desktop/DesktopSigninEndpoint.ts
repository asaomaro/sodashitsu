import {createHash,randomUUID} from "node:crypto";
import {Agent as HttpAgent} from "node:http";
import {Agent as HttpsAgent} from "node:https";
import WebSocket from "ws";
import {DesktopEndpointStart,DesktopEndpointConnect,DesktopOptions,RemoteDesktopViewerMessage,DesktopSigninGrant,desktopFeaturesFromProtocols,DESKTOP_ENDPOINT_PROTOCOL,type DesktopEndpointStart as Start} from "@sodashitsu/protocol";
import {DesktopEndpointWire} from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import {DesktopEndpointDrain} from "./DesktopEndpointDrain.js";
import type {DesktopSigninIdentity} from "./DesktopSigninIdentity.js";
import type {DesktopSigninCallScope} from "./DesktopSigninDispatch.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import {DesktopSigninWorkerProcess} from "./DesktopSigninWorkerProcess.js";

type Worker=Pick<DesktopSigninWorkerProcess,"send"|"close"|"settled">;
type WorkerOptions=ConstructorParameters<typeof DesktopSigninWorkerProcess>[0];
type Context={owner:string;closed:boolean;wire?:DesktopEndpointWire;helper?:Worker;creating:boolean;finish():void;close():void;stopped:Promise<void>;resolve():void};
const failure=()=>new Error("Signin desktop is unavailable"),utf8=new TextEncoder(),decode=new TextDecoder("utf-8",{fatal:true});
const quiet=(fn:()=>void)=>{try{fn();}catch{}};
/** Sealed viewer-only service. A bridge/RPC request cannot itself start native
 * capture/input: a fresh signed-peer consent record inside this wire is required.
 * One native lease at a time, including every outstanding teardown. */
export class DesktopSigninEndpoint {
  readonly #contexts=new Set<Context>();#pending=false;#closed=false;
  readonly #abort=()=>{void this.close();};
  constructor(private readonly options:{
    enrollment:DesktopSigninEnrollment;identity:Pick<DesktopSigninIdentity,"endpoint">;active():boolean;signal:AbortSignal;
    worker?:(options:WorkerOptions)=>Worker;socket?:(url:string,options:WebSocket.ClientOptions)=>WebSocket;
    now?:()=>number;
  }){options.signal.addEventListener("abort",this.#abort,{once:true});if(!this.live())void this.close();}
  private live():boolean{try{return !this.#closed&&!this.options.signal.aborted&&this.options.active()&&!this.#closed&&!this.options.signal.aborted;}catch{return false;}}
  async start(owner:string,raw:Start,scope:DesktopSigninCallScope):Promise<{started:true}>{
    if(!this.live()||this.#pending||this.#contexts.size)throw failure();this.#pending=true;
    let ctx:Context|undefined;
    try{
      const p=DesktopEndpointStart.parse(raw);
      const classified=this.options.enrollment.classify(utf8.encode(JSON.stringify({id:"endpoint",method:"desktop.endpoint.start",params:p})));
      if(classified.method!=="desktop.endpoint.start"||p.parent||p.attachment||p.binding||p.hello.role!=="viewer")throw failure();
      const fingerprint=createHash("sha256").update(Buffer.from(p.hello.identity,"hex")).digest("hex");
      const permit=await this.options.identity.endpoint(fingerprint,scope);
      if(!this.live()||scope.signal.aborted||!scope.active()||!permit.active()||!this.live())throw failure();
      const controller=new AbortController(),now=this.options.now??(()=>performance.now()),deadline=now()+120000;
      let resolver!:()=>void;const stopped=new Promise<void>(resolve=>{resolver=resolve;});
      let transport:WebSocket|undefined,agent:HttpAgent|undefined,timer:ReturnType<typeof setTimeout>|undefined,finalized=false,connected=false,started=false,granted=false,grantPending=false;
      let settings={width:1280,fps:10,quality:65},allowControl=false;const offer=randomUUID();
      const active=()=>{
        let valid=false;try{valid=!!ctx&&!ctx.closed&&!controller.signal.aborted&&this.live()&&scope.active()&&!scope.signal.aborted&&permit.active()&&this.live();if(valid)valid=now()<deadline;valid=valid&&!!ctx&&!ctx.closed&&!controller.signal.aborted&&!this.#closed&&!this.options.signal.aborted&&!scope.signal.aborted;}catch{}
        return valid;
      };
      const finished=()=>{
        if(finalized||!ctx||ctx.creating)return;finalized=true;
        const current=ctx;
        void (async()=>{if(current.helper){quiet(()=>current.helper!.close());await current.helper.settled();}})().catch(()=>{this.#closed=true;for(const other of this.#contexts)if(other!==current)other.close();}).finally(()=>{this.#contexts.delete(current);current.resolve();});
      };
      ctx={owner,closed:false,creating:false,stopped,resolve:resolver,finish:finished,close:()=>{
        if(!ctx)return;ctx.closed=true;controller.abort();clearTimeout(timer);scope.signal.removeEventListener("abort",abort);
        quiet(()=>ctx!.helper?.close());quiet(()=>ctx!.wire?.close());const socket=transport;transport=undefined;quiet(()=>socket?.terminate());const ownedAgent=agent;agent=undefined;ownedAgent?.destroy();drain?.dispose();finished();
      }};
      const context=ctx,abort=()=>context.close();let drain:DesktopEndpointDrain|undefined;
      this.#contexts.add(context);scope.signal.addEventListener("abort",abort,{once:true});
      timer=setTimeout(context.close,120000);timer.unref();
      const send=(lane:"control"|"image",kind:number,bytes:Uint8Array)=>{
        if(!active())throw failure();const record=new Uint8Array(bytes.length+1);record[0]=kind;record.set(bytes,1);drain!.track(context.wire!.send(lane,record));
      };
      const record=(bytes:Uint8Array,binary:boolean)=>{if(!active()){context.close();return;}send(binary?"image":"control",binary?0:1,bytes);};
      const receive=(lane:string,value:Uint8Array)=>{
        if(!active()||!value.length)throw failure();const kind=value[0],body=value.subarray(1);
        if(drain!.closing){if(lane==="control"&&kind===5&&body.length===0)drain!.acknowledge();else if(kind!==0&&kind!==1)throw failure();return;}
        if(lane!=="control"||body.length>16384)throw failure();
        if(kind===2){
          if(connected)throw failure();const request=DesktopEndpointConnect.parse(JSON.parse(decode.decode(body)));
          if(!desktopFeaturesFromProtocols(request.protocols).has("signin"))throw failure();connected=true;send("control",3,new Uint8Array());return;
        }
        if(kind!==1||!connected)throw failure();
        const message=JSON.parse(decode.decode(body)) as {type?:string};
        if(message.type==="start"){
          if(started||granted)throw failure();
          const envelope=RemoteDesktopViewerMessage.parse(message);if(envelope.type!=="start"||envelope.machineId!==p.machineId)throw failure();
          const parsed=DesktopOptions.parse(envelope.options);settings={width:parsed.width,fps:parsed.fps,quality:parsed.quality};started=true;
          send("control",1,utf8.encode(JSON.stringify({type:"signin_required",id:offer,allowInput:permit.allowInput,validForMs:Math.max(1,Math.floor(deadline-now()))})));return;
        }
        if(message.type==="signin_grant"){
          const grant=DesktopSigninGrant.parse(message);
          if(!started||granted||grantPending||grant.id!==offer||grant.control&&!permit.allowInput)throw failure();
          granted=true;allowControl=grant.control;grantPending=true;context.creating=true;
          try{
            if(!active())throw failure();
            context.helper=(this.options.worker??(options=>new DesktopSigninWorkerProcess(options)))({control:grant.control,settings:{...settings},active,signal:controller.signal,record,closed:()=>{quiet(()=>context.helper?.close());drain!.begin(true);}});
            if(!active())context.close();
          }catch{context.close();throw failure();}
          finally{context.creating=false;grantPending=false;if(context.closed)finished();}
          return;
        }
        if(message.type==="heartbeat"&&!granted){RemoteDesktopViewerMessage.parse(message);return;}
        if(message.type==="stop"){RemoteDesktopViewerMessage.parse(message);context.helper?.close();drain!.begin(true);return;}
        if(!granted||!context.helper)throw failure();const command=RemoteDesktopViewerMessage.parse(message);
        if(!["control","release","ack","input","quality","heartbeat","keyframe"].includes(command.type)||!allowControl&&(command.type==="input"||command.type==="control"&&command.enabled))throw failure();context.helper.send(command);
      };
      drain=new DesktopEndpointDrain({active,terminal:()=>context.wire!.send("control",new Uint8Array([4])),close:context.close});
      const url=new URL(p.url);agent=new (url.protocol==="wss:"?HttpsAgent:HttpAgent)({keepAlive:false,maxSockets:1,maxTotalSockets:1});
      transport=(this.options.socket??((url,options)=>new WebSocket(url,DESKTOP_ENDPOINT_PROTOCOL,options)))(p.url,{agent,rejectUnauthorized:true,followRedirects:false,perMessageDeflate:false,handshakeTimeout:5000,maxPayload:4*1024*1024});
      transport.on("error",context.close);transport.on("close",context.close);
      if(!active()){context.close();throw failure();}
      context.wire=new DesktopEndpointWire({crypto,identity:permit.identity,session:p.session,role:"provider",peerRole:"viewer",expectedFingerprint:fingerprint,active,
        sendRaw:bytes=>{if(!active()||transport!.readyState!==WebSocket.OPEN||transport!.bufferedAmount>8*1024*1024)throw failure();transport!.send(bytes);},onRecord:receive,onReady:()=>{},onClose:context.close});
      transport.on("message",(raw,binary)=>{if(!active()){context.close();return;}const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);void context.wire!.receive(binary?new Uint8Array(bytes):bytes.toString()).catch(context.close);});
      const open=new Promise<void>((resolve,reject)=>{
        transport!.once("error",()=>reject(failure()));transport!.once("close",()=>reject(failure()));
        transport!.once("open",()=>{if(!active()){context.close();reject(failure());return;}transport!.send(JSON.stringify({type:"provider",ticket:p.ticket}));resolve();});
      });
      await Promise.all([open,context.wire.start()]);if(!active())throw failure();return {started:true};
    }catch{ctx?.close();throw failure();}finally{this.#pending=false;}
  }
  clientGone(owner:string):void{for(const ctx of this.#contexts)if(ctx.owner===owner)ctx.close();}
  async close():Promise<void>{
    this.#closed=true;this.options.signal.removeEventListener("abort",this.#abort);const contexts=[...this.#contexts];for(const ctx of contexts)ctx.close();await Promise.all(contexts.map(ctx=>ctx.stopped));
  }
}
