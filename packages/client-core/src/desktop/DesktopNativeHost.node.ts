import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {z} from "zod";
import {DesktopNativeHelperRequest,type DesktopNativeHelperEvent,type DesktopNativeFileOffer} from "@sodashitsu/protocol";
type Need={index:number;offset:number;length:number;at:number};
type Registered={index:number;nextOffset:number;done:boolean};
type Armed={gesture:string;at:number;timer:ReturnType<typeof setTimeout>};
type Job={gesture:string;offer:DesktopNativeFileOffer;child:ChildProcessWithoutNullStreams;nonce:string;sequence:number;pending:Map<string,Need>;requests:Map<string,Registered>;ready:boolean;finished:boolean;aborted:boolean;closed:Promise<void>;resolveClose():void;};
const Native=z.discriminatedUnion("type",[
 z.object({type:z.literal("ready"),nonce:z.string(),now:z.number().int().min(0).max(900000)}).strict(),
 z.object({type:z.literal("need"),nonce:z.string(),request:z.uuid(),index:z.number().int().min(0).max(999),offset:z.number().int().min(0).max(104857600),length:z.number().int().min(1).max(65536)}).strict(),
 z.object({type:z.literal("finished"),nonce:z.string(),copy:z.literal(true)}).strict(),
]);
/** Authenticated localhost connection owns one native process until actual close.
 * executable is supplied only by the fixed local builder, never by a request. */
export class DesktopNativeHost {
 private resolveClosed!:()=>void;readonly closed=new Promise<void>(resolve=>{this.resolveClosed=resolve;});private closing:Promise<void>|undefined;
 private readonly owner=randomUUID();private job:Job|undefined;private armed:Armed|undefined;private dead=false;private seen=new Set<string>();private observed:number;private beatAt:number;private readonly born:number;private readonly timer:ReturnType<typeof setInterval>;
 constructor(private options:{origin:string;executable:string;emit(event:DesktopNativeHelperEvent):void;spawn?:typeof spawn;now?:()=>number}){
  const origin=new URL(options.origin);if(!["http:","https:"].includes(origin.protocol)||origin.origin!==options.origin)throw Error("Invalid native parent origin");
  this.born=this.observed=this.beatAt=this.now();if(!Number.isFinite(this.born)||this.born<0)throw Error("Invalid native clock");
  this.timer=setInterval(()=>{try{this.fence();}catch{void this.close();}},100);this.timer.unref();
 }
 private now(){return this.options.now?.()??performance.now();}
 private fence(){const at=this.now();if(this.dead||!Number.isFinite(at)||at<this.observed||at-this.born>=900000||at-this.beatAt>=5000){void this.close();throw Error("Native helper expired");}this.observed=at;return at;}
 private emit(value:DesktopNativeHelperEvent){try{this.options.emit(value);}catch{void this.close();}}
 private packet(job:Job,value:Record<string,unknown>){
  if(job!==this.job||job.aborted||job.finished||job.child.stdin.destroyed||job.child.stdin.writableLength>1048576)throw Error("Native input closed");
  const bytes=Buffer.from(JSON.stringify({...value,nonce:job.nonce,seq:job.sequence++})+"\n");if(bytes.length>98305)throw Error("Native packet limit");
  job.child.stdin.write(bytes,error=>{bytes.fill(0);if(error&&!job.finished)this.cancel(job.gesture);});
 }
 receive(raw:unknown){
  const value=DesktopNativeHelperRequest.parse(raw);this.fence();
  if(value.type==="beat"){this.beatAt=this.observed;if(this.job?.ready&&!this.job.finished&&!this.job.aborted)this.packet(this.job,{type:"beat"});return;}
  if(value.type==="cancel"){this.cancel(value.gesture);return;}
  if(value.type==="arm"){
   if(this.job||this.armed||this.seen.has(value.gesture)||this.seen.size>=4096)throw Error("Native gesture unavailable");this.seen.add(value.gesture);
   const armed:Armed={gesture:value.gesture,at:this.observed,timer:setTimeout(()=>this.cancel(value.gesture),750)};armed.timer.unref();this.armed=armed;this.emit({type:"armed",gesture:value.gesture});return;
  }
  if(value.type==="start"){this.start(value.gesture,value.offer);return;}
  const job=this.job,need=job?.pending.get(value.request);
  if(!job||job.gesture!==value.gesture||job.aborted||!need||need.index!==value.index||need.offset!==value.offset||this.observed-need.at>=5000)throw Error("Native read correlation failed");
  const bytes=Buffer.from(value.data,"base64");try{
   if(bytes.length!==need.length||bytes.toString("base64")!==value.data)throw Error("Native read length failed");
   job.pending.delete(value.request);const registered=job.requests.get(value.request)!;registered.nextOffset=value.offset+bytes.length;registered.done=registered.nextOffset===job.offer.entries[value.index]!.bytes;this.packet(job,{type:"bytes",request:value.request,index:value.index,offset:value.offset,data:value.data});
   if(value.offset+bytes.length===job.offer.entries[value.index]!.bytes)this.packet(job,{type:"end",request:value.request,index:value.index});
  }finally{bytes.fill(0);}
 }
 private start(gesture:string,offer:DesktopNativeFileOffer){
  const armed=this.armed;if(!armed||armed.gesture!==gesture||this.job||this.fence()-armed.at>=750)throw Error("Native gesture expired");
  if(Buffer.byteLength(JSON.stringify(offer))>98000)throw Error("Native manifest limit");
  const total=offer.entries.reduce((sum,entry)=>sum+entry.bytes,0);if(total>104857600)throw Error("Native total limit");
  const nonce=randomBytes(32).toString("hex"),child=(this.options.spawn??spawn)(this.options.executable,[],{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false});let resolveClose!:()=>void;
  const job:Job={gesture,offer,child,nonce,sequence:0,pending:new Map(),requests:new Map(),ready:false,finished:false,aborted:false,closed:new Promise(resolve=>{resolveClose=resolve;}),resolveClose:()=>resolveClose()};this.job=job;
  let output=Buffer.alloc(0),diagnostics=0;
  child.stdin.on("error",()=>{if(!job.finished)this.cancel(gesture);});child.on("error",()=>this.cancel(gesture));
  child.stderr.on("data",(bytes:Buffer)=>{diagnostics+=bytes.length;if(diagnostics>8192)this.cancel(gesture);});
  child.stdout.on("data",(bytes:Buffer)=>{
   try{
    this.fence();if(job.aborted||job!==this.job)throw Error("Native process cancelled");if(output.length+bytes.length>98304||bytes.some(value=>value>127))throw Error("Native output limit");output=Buffer.concat([output,bytes]);
    let end:number;while((end=output.indexOf(10))>=0){this.fence();if(job.aborted||job!==this.job)throw Error("Native process cancelled");const line=output.subarray(0,end).toString("ascii").replace(/\r$/,"");output=output.subarray(end+1);const event=Native.parse(JSON.parse(line));if(event.nonce!==nonce)throw Error("Native nonce mismatch");
     if(event.type==="ready"){
      if(job.ready||this.fence()-armed.at>=740)throw Error("Native admission expired");job.ready=true;
      // Ready's native clock precedes this receipt. Adding only the remaining
      // original host time (minus10ms) cannot renew the original gesture window.
      const remaining=Math.floor(750-(this.observed-armed.at)-10),deadline=event.now+remaining;if(remaining<=0)throw Error("Native gesture expired");
      this.packet(job,{type:"begin",owner:this.owner,origin:this.options.origin,gesture,generation:offer.generation,count:offer.entries.length,bytes:total,deadline});
      for(const [index,entry]of offer.entries.entries())this.packet(job,{type:"entry",index,...entry});
      if(this.fence()-armed.at>=740)throw Error("Native seal expired");this.packet(job,{type:"seal"});clearTimeout(armed.timer);this.armed=undefined;this.emit({type:"running",gesture});
     }else if(event.type==="need"){
      const entry=offer.entries[event.index],registered=job.requests.get(event.request);if(!job.ready||job.finished||!entry||entry.directory||event.offset+event.length>entry.bytes||job.pending.has(event.request)||job.pending.size>=16||registered&&(registered.done||registered.index!==event.index||registered.nextOffset!==event.offset)||!registered&&(job.requests.size>=4096||event.offset!==0))throw Error("Native read registration failed");if(!registered)job.requests.set(event.request,{index:event.index,nextOffset:0,done:false});job.pending.set(event.request,{index:event.index,offset:event.offset,length:event.length,at:this.observed});this.emit({type:"need",gesture,request:event.request,index:event.index,offset:event.offset,length:event.length});
     }else {if(!job.ready||job.finished||job.pending.size)throw Error("Native finish mismatch");job.finished=true;}
    }
   }catch{this.cancel(gesture);}
  });
  child.once("close",(code,signal)=>{
   let ok=false;try{this.fence();ok=job===this.job&&!job.aborted&&job.finished&&output.length===0&&code===0&&signal===null;}catch{}
   if(this.armed?.gesture===gesture){clearTimeout(this.armed.timer);this.armed=undefined;}if(this.job===job)this.job=undefined;job.pending.clear();output.fill(0);job.resolveClose();this.emit({type:"done",gesture,ok});
  });
  child.stdin.write(nonce+"\n",error=>{if(error)this.cancel(gesture);});
 }
 cancel(gesture?:string){
  if(gesture&&!this.seen.has(gesture)){if(this.seen.size>=4096){void this.close();return;}this.seen.add(gesture);}
  if(this.armed&&(!gesture||this.armed.gesture===gesture)){clearTimeout(this.armed.timer);this.armed=undefined;}
  const job=this.job;if(!job||gesture&&job.gesture!==gesture||job.aborted)return;job.aborted=true;job.pending.clear();
  try{job.child.stdin.end(JSON.stringify({type:"cancel",nonce:job.nonce,seq:job.sequence++})+"\n");}catch{}
  // Kill only this retained child; never a PID found in another process/session.
  job.child.kill();
 }
 close():Promise<void>{return this.closing??=(async()=>{this.dead=true;clearInterval(this.timer);this.cancel();await this.job?.closed;this.resolveClosed();})();}
}
