import {request as httpsRequest} from "node:https";
import type {IncomingHttpHeaders,IncomingMessage} from "node:http";
import {open} from "node:fs/promises";
import {createHash} from "node:crypto";
import type {Socket} from "node:net";
export interface RuntimeArchiveSpec{version:string;platform:"win32"|"darwin"|"linux";arch:"x64"|"arm64";archive:string;bytes:number;sha256:string}
export interface RuntimeResponse{status:number;headers:IncomingHttpHeaders;body:AsyncIterable<Uint8Array>;retire():Promise<void>}
export type RuntimeTransport=(url:URL,signal:AbortSignal)=>Promise<RuntimeResponse>;
const HOSTS=new Set(["github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"]);
function allowed(url:URL){if(url.protocol!=="https:"||!HOSTS.has(url.hostname)||url.port&&url.port!=="443"||url.username||url.password||url.hash)throw Error("Unexpected runtime download destination");}
/** Each response owns an unpooled HTTPS socket and retires it before settling. */
export function openRuntimeResponse(url:URL,signal:AbortSignal,request:typeof httpsRequest=httpsRequest):Promise<RuntimeResponse>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  let response:IncomingMessage|undefined,delivered=false,retiring:Promise<void>|undefined,socketClosed=Promise.resolve();
  const req=request(url,{method:"GET",agent:false,headers:{"accept-encoding":"identity"}},incoming=>{
   response=incoming;incoming.on("error",()=>{});delivered=true;
   resolve({status:incoming.statusCode??0,headers:incoming.headers,body:incoming,retire});
  });
  const requestClosed=new Promise<void>(done=>req.once("close",done));
  req.once("socket",(socket:Socket)=>{socketClosed=socket.closed?Promise.resolve():new Promise<void>(done=>socket.once("close",()=>done()));if(retiring)socket.destroy();});
  const aborted=()=>{const error=signal.reason instanceof Error?signal.reason:Error("Runtime download cancelled");response?.destroy(error);req.destroy(error);};
  function retire():Promise<void>{
   if(retiring)return retiring;
   retiring=(async()=>{response?.destroy();req.destroy();await requestClosed;await socketClosed;signal.removeEventListener("abort",aborted);})();return retiring;
  }
  req.once("error",error=>{if(!delivered)void retire().then(()=>reject(error),reject);});
  req.once("upgrade",(_incoming,socket)=>{socket.destroy();void retire().then(()=>reject(Error("Runtime download upgrade rejected")),reject);});
  signal.addEventListener("abort",aborted,{once:true});
  if(signal.aborted)aborted();else req.end();
 });
}
interface Options{expires:number;signal?:AbortSignal;now?:()=>number;check?:()=>void;transport?:RuntimeTransport;progress?:(received:number,total:number)=>void}
/** Fixed catalog only. Callers supply a newly owned, exclusive staging filename. */
export async function downloadAssistantRuntime(spec:RuntimeArchiveSpec,target:string,options:Options):Promise<void>{
 const now=options.now??(()=>performance.now()),remaining=options.expires-now();
 if(!/^\d+\.\d+\.\d+$/.test(spec.version)||!["win32","darwin","linux"].includes(spec.platform)||!["x64","arm64"].includes(spec.arch)||spec.archive!==`electron-v${spec.version}-${spec.platform}-${spec.arch}.zip`||!Number.isSafeInteger(spec.bytes)||spec.bytes<22||spec.bytes>512*1024*1024||!/^[a-f0-9]{64}$/.test(spec.sha256)||!Number.isFinite(options.expires)||remaining<=0||remaining>300000)throw Error("Invalid fixed runtime download");
 const controller=new AbortController(),signal=controller.signal;
 const abort=()=>controller.abort(options.signal?.reason??Error("Runtime download cancelled"));
 if(options.signal?.aborted)abort();else options.signal?.addEventListener("abort",abort,{once:true});
 const timer=setTimeout(()=>controller.abort(Error("Runtime download deadline")),Math.max(1,remaining));timer.unref();
 const live=()=>{signal.throwIfAborted();const before=now();options.check?.();signal.throwIfAborted();if(Math.max(before,now())>=options.expires){controller.abort(Error("Runtime download deadline"));signal.throwIfAborted();}};
 const transport=options.transport??openRuntimeResponse;
 let url=new URL(`https://github.com/electron/electron/releases/download/v${spec.version}/${spec.archive}`);
 try{
  for(let redirects=0;redirects<=3;redirects++){
   live();allowed(url);const response=await transport(url,signal);
   try{
    live();if([301,302,303,307,308].includes(response.status)){
     const location=response.headers.location;if(typeof location!=="string"||redirects===3)throw Error("Runtime download redirect limit");
     const next=new URL(location,url);allowed(next);url=next;continue;
    }
    if(response.status!==200)throw Error("Runtime download failed");
    const length=response.headers["content-length"],encoding=response.headers["content-encoding"];
    if(length!==undefined&&(typeof length!=="string"||!/^\d+$/.test(length)||Number(length)!==spec.bytes)||encoding!==undefined&&encoding!=="identity")throw Error("Runtime download headers differ");
    live();const file=await open(target,"wx",0o600);let received=0;const hash=createHash("sha256");
    try{
     live();for await(const chunk of response.body){
      live();if(!(chunk instanceof Uint8Array)||(received+=chunk.byteLength)>spec.bytes)throw Error("Runtime download byte limit exceeded");
      hash.update(chunk);let used=0;
      while(used<chunk.byteLength){live();const result=await file.write(chunk,used,chunk.byteLength-used);live();if(!result.bytesWritten)throw Error("Runtime download write failed");used+=result.bytesWritten;}
      options.progress?.(received,spec.bytes);live();
     }
     live();if(received!==spec.bytes||hash.digest("hex")!==spec.sha256)throw Error("Runtime download digest or size differs");
    }finally{await file.close();}
    live();return;
   }finally{await response.retire();live();}
  }
  throw Error("Runtime download redirect limit");
 }finally{clearTimeout(timer);options.signal?.removeEventListener("abort",abort);}
}
