import {spawn,type ChildProcessWithoutNullStreams,type SpawnOptions} from "node:child_process";
import {win32} from "node:path";
import {fileURLToPath} from "node:url";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {desktopWindowsPowerShell} from "@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import type {DesktopSigninContext} from "./DesktopSigninPresenceProcess.js";

const failure=()=>new Error("Signin readonly source is unavailable");
type Scope={active():boolean;signal:AbortSignal;closed():void};
type Entry={seq:number;text:string;until:number;resolve(value:Buffer):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>};
export interface DesktopSigninSourceDependencies {
 platform:NodeJS.Platform;shell():string;now?():number;
 spawn(command:string,args:string[],options:SpawnOptions):ChildProcessWithoutNullStreams;
}
const defaults:DesktopSigninSourceDependencies={platform:process.platform,shell:desktopWindowsPowerShell,spawn:(command,args,options)=>spawn(command,args,options) as ChildProcessWithoutNullStreams};
/** Private readonly pipes belonging to one verified native presence epoch.
 * Compilation is paid once; every enrollment, DPAPI and ACL read remains fresh.
 * The verified package, not a workspace script, supplies the child code. */
export class DesktopSigninSource {
 #child:ChildProcessWithoutNullStreams|undefined;#closing=false;#closed=false;#seq=0;#prepared=false;
 #line="";#decoder=new TextDecoder("utf-8",{fatal:true});#queue:Entry[]=[];
 #ready:Promise<void>;#readyResolve!:()=>void;#readyReject!:(error:Error)=>void;
 #settled:Promise<void>;#settleResolve!:()=>void;#settleReject!:(error:Error)=>void;
 #startup:ReturnType<typeof setTimeout>|undefined;#kill:ReturnType<typeof setTimeout>|undefined;#confirm:ReturnType<typeof setTimeout>|undefined;
 readonly #now:()=>number;readonly #readyUntil:number;
 readonly #abort=()=>this.close();
 readonly store:DesktopEndpointStore;
 constructor(private readonly context:DesktopSigninContext,private readonly scope:Scope,deps:DesktopSigninSourceDependencies=defaults){
  this.#now=deps.now??(()=>performance.now());this.#readyUntil=this.#now()+10000;
  this.#ready=new Promise((resolve,reject)=>{this.#readyResolve=resolve;this.#readyReject=reject;});void this.#ready.catch(()=>{});
  this.#settled=new Promise((resolve,reject)=>{this.#settleResolve=resolve;this.#settleReject=reject;});void this.#settled.catch(()=>{});
  this.store=new DesktopEndpointStore({stateDir:context.stateDir,writeAllowed:()=>false,platform:"win32",protector:{mode:"dpapi-user",protect:async()=>{throw failure();},unprotect:value=>{if(!value.length||value.length>65536)return Promise.reject(failure());const bytes=Buffer.from(value);try{return this.request("unprotect",{data:bytes.toString("base64")});}finally{bytes.fill(0);}}},checkWindowsPath:(path,allowMissing)=>{if(allowMissing)return Promise.reject(failure());return this.checkPaths([path]);},checkWindowsPaths:paths=>this.checkPaths(paths)});
  try{
   if(deps.platform!=="win32"||!this.live())throw failure();
   const executable=deps.shell(),script=fileURLToPath(new URL("../../../../scripts/remote-desktop/read-signin-enrollment.ps1",import.meta.url));
   this.#child=deps.spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script,"-OwnerSid",context.ownerSid,"-ReadonlySource","-StateDir",context.stateDir],{stdio:["pipe","pipe","pipe"],windowsHide:true,cwd:win32.dirname(executable),env:{...process.env,PSModulePath:win32.join(win32.dirname(executable),"Modules")}});
   const child=this.#child;child.on("close",()=>this.finished());child.on("error",()=>this.close());
   child.stdin.on("error",()=>this.close());child.stdout.on("error",()=>this.close());child.stderr.on("error",()=>this.close());child.stderr.on("data",(bytes:Buffer)=>bytes.fill(0));child.stdout.on("data",(bytes:Buffer)=>this.receive(bytes));
   this.#startup=setTimeout(()=>this.close(),10000);this.#startup.unref();scope.signal.addEventListener("abort",this.#abort,{once:true});if(!this.live())this.close();
  }catch{this.close();if(!this.#child)this.finished();}
 }
 private live():boolean{try{return !this.#closing&&!this.scope.signal.aborted&&this.scope.active();}catch{return false;}}
 ready():Promise<void>{return this.#ready;}
 async enrollment():Promise<DesktopSigninEnrollment>{const bytes=await this.request("enrollment");try{if(!this.live())throw failure();const record=DesktopSigninEnrollment.decode(bytes,this.context.ownerSid);if(!this.live())throw failure();return record;}finally{bytes.fill(0);}}
 private async checkPaths(paths:readonly string[]):Promise<void>{
  const root=this.context.stateDir,allowed=[root,win32.join(root,"desktop-endpoint"),win32.join(root,"desktop-endpoint","identity.json"),win32.join(root,"desktop-endpoint-required.json")];
  if(!paths.length||paths.length>4||paths.some(path=>!allowed.includes(path)))throw failure();
  const bytes=await this.request("check-paths",{paths});try{if(bytes.length)throw failure();}finally{bytes.fill(0);}
 }
 private request(op:string,fields:object={}):Promise<Buffer>{return new Promise((resolve,reject)=>{
  if(!this.#prepared||!this.live()||this.#seq>=4096||this.#queue.length>=16){reject(failure());return;}
  const seq=++this.#seq,text=JSON.stringify({seq,op,...fields})+"\n";if(Buffer.byteLength(text)>90000){reject(failure());this.close();return;}
  const timer=setTimeout(()=>this.close(),5000);timer.unref();const entry={seq,text,until:this.#now()+5000,resolve,reject,timer};this.#queue.push(entry);if(this.#queue.length===1)this.send(entry);
 });}
 private send(entry:Entry):void{if(!this.live()){this.close();return;}try{if(!this.#child||this.#child.stdin.writableLength+Buffer.byteLength(entry.text)>90000)throw failure();this.#child.stdin.write(entry.text);entry.text="";}catch{this.close();}}
 private receive(bytes:Buffer):void{
  try{
   if(!this.live())throw failure();const text=this.#decoder.decode(bytes,{stream:true});bytes.fill(0);let start=0,index:number;
   while((index=text.indexOf("\n",start))>=0){const line=this.#line+text.slice(start,index);this.#line="";if(Buffer.byteLength(line)>90000)throw failure();this.record(line);start=index+1;}
   this.#line+=text.slice(start);if(Buffer.byteLength(this.#line)>90000)throw failure();
  }catch{bytes.fill(0);this.close();}
 }
 private record(line:string):void{
  if(!this.live())throw failure();const value=JSON.parse(line) as Record<string,unknown>;
  if(!this.#prepared){if(this.#now()>=this.#readyUntil||!value||Object.keys(value).length!==1||value.ready!==true)throw failure();this.#prepared=true;clearTimeout(this.#startup);this.#readyResolve();return;}
  const entry=this.#queue[0];if(!entry||this.#now()>=entry.until||!value||Object.keys(value).length!==2||value.seq!==entry.seq||typeof value.data!=="string"||value.data.length>87384||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data))throw failure();
  const data=Buffer.from(value.data,"base64");if(data.length>65536||data.toString("base64")!==value.data){data.fill(0);throw failure();}
  this.#queue.shift();clearTimeout(entry.timer);entry.resolve(data);if(this.#queue[0])this.send(this.#queue[0]);
 }
 close():void{
  if(this.#closing)return;this.#closing=true;clearTimeout(this.#startup);this.scope.signal.removeEventListener("abort",this.#abort);this.#readyReject(failure());this.store.close();
  try{this.scope.closed();}catch{}
  for(const entry of this.#queue){clearTimeout(entry.timer);entry.text="";entry.reject(failure());}this.#queue=[];this.#line="";
  if(this.#closed||!this.#child)return;
  try{this.#child.stdin.end();}catch{}
  this.#kill=setTimeout(()=>{try{this.#child?.kill();}catch{}this.#confirm=setTimeout(()=>this.#settleReject(failure()),2000);this.#confirm.unref();},2000);this.#kill.unref();
 }
 private finished():void{if(this.#closed)return;this.#closed=true;this.close();clearTimeout(this.#kill);clearTimeout(this.#confirm);this.#settleResolve();}
 async settled():Promise<void>{await this.#settled;await this.store.settled();}
}
