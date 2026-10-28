import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {z} from "zod";
import type {DesktopSigninWorkerDependencies} from "./DesktopSigninWorkerProcess.js";
const failure=()=>new Error("Signin presence is unavailable");
const contextSchema=z.object({type:z.literal("signin_context"),ownerSid:z.string().max(184),packageRoot:z.string().min(3).max(512),stateDir:z.string().min(3).max(512)}).strict();
const pulseSchema=z.object({type:z.literal("signin_presence"),seq:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),validForMs:z.number().int().min(1).max(1000)}).strict();
export type DesktopSigninContext=Readonly<z.infer<typeof contextSchema>>;
export interface DesktopSigninPresenceDependencies extends DesktopSigninWorkerDependencies {root():string;}
const defaults:DesktopSigninPresenceDependencies={root:()=>win32.resolve(fileURLToPath(new URL("../../../../",import.meta.url))),platform:process.platform,now:()=>performance.now(),spawn:(command,args,options)=>spawn(command,args,options) as ReturnType<DesktopSigninWorkerDependencies["spawn"]>,unsafeStop:()=>process.exit(1)};
export function desktopSigninContext(raw:unknown,ownerSid:string,expectedRoot:string):DesktopSigninContext{
 const data=contextSchema.parse(raw),parts=ownerSid.split("-").slice(2);
 if(!/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(ownerSid)||["S-1-5-18","S-1-5-19","S-1-5-20"].includes(ownerSid)||parts.some((p,i)=>!/^(?:0|[1-9][0-9]*)$/.test(p)||!Number.isSafeInteger(Number(p))||Number(p)>(i===0?0xffffffffffff:0xffffffff))||data.ownerSid!==ownerSid)throw failure();
 for(const path of [data.packageRoot,data.stateDir,expectedRoot])if(!/^[A-Za-z]:\\/.test(path)||path.slice(2).includes(":")||/[\x00-\x1f"<>|?*]/.test(path)||win32.resolve(path)!==path)throw failure();
 const slot=createHash("sha256").update(ownerSid).digest("hex"),suffix="\\"+win32.join("sodashitsu","desktop-signin",slot,"runtime");
 if(data.packageRoot.toLowerCase()!==expectedRoot.toLowerCase()||!data.stateDir.toLowerCase().endsWith(suffix.toLowerCase()))throw failure();return Object.freeze(data);
}
/** Dedicated SYSTEM service only: fixed readonly broker purpose. Context is
 * published only after a native signed-out pulse, never from an argv/env path. */
export class DesktopSigninPresenceProcess {
 #child:ReturnType<DesktopSigninWorkerDependencies["spawn"]>|undefined;#spawning=true;#closing=false;#done=false;#notified=false;#proof=false;#tail=false;
 #line="";#bytes=0;#decoder=new TextDecoder("utf-8",{fatal:true});#context:DesktopSigninContext|undefined;#seq=0;#until=0;
 readonly #deadline:number;readonly #readyUntil:number;#readyDone=false;
 #ready:Promise<DesktopSigninContext|null>;#readyResolve!:(value:DesktopSigninContext|null)=>void;#readyReject!:(error:Error)=>void;
 #stopped:Promise<void>;#resolve!:()=>void;#reject!:(error:Error)=>void;
 #health:ReturnType<typeof setInterval>|undefined;#beat:ReturnType<typeof setInterval>|undefined;#stop:ReturnType<typeof setTimeout>|undefined;
 readonly #abort=()=>this.close();
 constructor(private readonly options:{ownerSid:string;active():boolean;signal:AbortSignal;closed():void},private readonly deps=defaults){
  this.#ready=new Promise((resolve,reject)=>{this.#readyResolve=resolve;this.#readyReject=reject;});void this.#ready.catch(()=>{});
  this.#stopped=new Promise((resolve,reject)=>{this.#resolve=resolve;this.#reject=reject;});void this.#stopped.catch(()=>{});
  const at=deps.now();this.#deadline=at+120000;this.#readyUntil=at+10000;
  if(deps.platform!=="win32"||!this.owned())throw failure();
  options.signal.addEventListener("abort",this.#abort,{once:true});
  try{
   const command=fileURLToPath(new URL("../../../../DesktopSigninWorker.exe",import.meta.url));
   const env:NodeJS.ProcessEnv={};for(const key of ["SystemRoot","windir","PATH","TEMP","TMP"]){const value=process.env[key];if(typeof value==="string")env[key]=value;}
   this.#child=deps.spawn(command,["--broker","presence"],{stdio:["pipe","pipe","pipe"],windowsHide:true,cwd:win32.dirname(command),env});this.#spawning=false;
   const child=this.#child;child.on("error",()=>this.close());child.on("close",code=>this.finished(code));
   if(!child.stdin||!child.stdout||!child.stderr){try{child.kill();}catch{}this.finished(null);return;}
   child.stdin.on("error",()=>this.close());child.stdout.on("error",()=>this.close());child.stderr.on("error",()=>this.close());child.stderr.on("data",(bytes:Buffer)=>bytes.fill(0));child.stdout.on("data",(bytes:Buffer)=>this.receive(bytes));
   if(this.#closing||!this.owned()){this.close();this.stopChild();return;}
   this.#health=setInterval(()=>{if(!this.owned()){this.close();return;}if(this.deps.now()>=(this.#seq?this.#until:this.#readyUntil))this.close();},100);this.#health.unref();
   this.#beat=setInterval(()=>this.heartbeat(),2000);this.#beat.unref();this.heartbeat();
  }catch{this.#spawning=false;if(this.#child){this.close();return;}this.#closing=true;this.#done=true;options.signal.removeEventListener("abort",this.#abort);this.notify();this.#readyReject(failure());this.#reject(failure());throw failure();}
 }
 private owned():boolean{try{return !this.#closing&&!this.#done&&!this.options.signal.aborted&&this.options.active()&&this.deps.now()<this.#deadline&&!this.#closing&&!this.#done&&!this.options.signal.aborted;}catch{return false;}}
 active():boolean{if(!this.owned()||!this.#seq||this.deps.now()>=this.#until){if(this.#seq)this.close();return false;}return true;}
 private notify():void{if(this.#notified)return;this.#notified=true;try{this.options.closed();}catch{}}
 private heartbeat():void{if(!this.owned()){this.close();return;}const child=this.#child,text='{"type":"heartbeat"}\n';if(!child||child.stdin.writableLength+text.length>4096){this.close();return;}try{child.stdin.write(text);}catch{this.close();}}
 private receive(bytes:Buffer):void{
  if(this.#done){bytes.fill(0);return;}
  try{if(this.#proof&&bytes.length)this.#tail=true;if(bytes.length>16384)throw failure();const text=this.#decoder.decode(bytes,{stream:true});bytes.fill(0);let start=0,index:number;
   while((index=text.indexOf("\n",start))>=0){const part=text.slice(start,index);this.#bytes+=Buffer.byteLength(part);if(this.#bytes>16384)throw failure();const line=this.#line+part;this.#line="";this.#bytes=0;this.record(line.endsWith("\r")?line.slice(0,-1):line);start=index+1;if(this.#done)return;}
   const rest=text.slice(start);if(this.#proof&&rest.length)this.#tail=true;this.#bytes+=Buffer.byteLength(rest);if(this.#bytes>16384)throw failure();this.#line+=rest;
  }catch{bytes.fill(0);this.close();}
 }
 private record(line:string):void{
  if(this.#proof){this.#tail=true;return;}if(line==='{"type":"signin_stopped"}'){this.#proof=true;this.close();return;}if(this.#closing)return;
  if(!this.owned()||!this.#seq&&this.deps.now()>=this.#readyUntil||this.#seq&&this.deps.now()>=this.#until)throw failure();
  const priorUntil=this.#seq?this.#until:this.#readyUntil;
  const value=JSON.parse(line) as {type?:string};if(value.type==="signin_context"){
   if(this.#context||this.#seq)throw failure();this.#context=desktopSigninContext(value,this.options.ownerSid,this.deps.root());return;
  }
  if(value.type==="signin_inactive"){z.object({type:z.literal("signin_inactive")}).strict().parse(value);if(!this.#context||this.#seq)throw failure();this.close();return;}
  const pulse=pulseSchema.parse(value);if(!this.#context||pulse.seq!==this.#seq+1||!this.owned())throw failure();const at=this.deps.now();if(at>=priorUntil||at>=this.#deadline||this.#closing||this.#done||this.options.signal.aborted)throw failure();this.#seq=pulse.seq;this.#until=Math.min(this.#deadline,at+pulse.validForMs);
  if(!this.#readyDone){this.#readyDone=true;this.#readyResolve(this.#context);}
 }
 private stopChild():void{if(this.#spawning||this.#done||!this.#child||this.#stop)return;this.#stop=setTimeout(()=>{try{this.#child?.kill();}catch{}this.finished(null);},8000);this.#stop.unref();try{this.#child.stdin.destroy();}catch{}}
 private finished(code:number|null):void{
  if(this.#done)return;let complete=false;try{complete=this.#decoder.decode().length===0&&this.#line.length===0&&this.#bytes===0;}catch{}
  this.#done=true;this.#closing=true;clearInterval(this.#health);clearInterval(this.#beat);clearTimeout(this.#stop);this.options.signal.removeEventListener("abort",this.#abort);this.#line="";this.#bytes=0;this.notify();
  if(code===0&&this.#proof&&!this.#tail&&complete){if(!this.#readyDone){this.#readyDone=true;this.#readyResolve(null);}this.#resolve();return;}
  if(!this.#readyDone){this.#readyDone=true;this.#readyReject(failure());}this.#reject(failure());try{this.deps.unsafeStop();}catch{}
 }
 close():void{if(this.#done)return;if(!this.#closing){this.#closing=true;clearInterval(this.#health);clearInterval(this.#beat);this.notify();}this.stopChild();}
 ready():Promise<DesktopSigninContext|null>{return this.#ready;}
 settled():Promise<void>{return this.#stopped;}
}
