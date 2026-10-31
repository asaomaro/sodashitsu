import {spawn,type ChildProcess,type SpawnOptions} from "node:child_process";
import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {z} from "zod";
import {DesktopFrameInfo,DesktopReady,RemoteDesktopViewerMessage,encodeDesktopFrame,decodeDesktopFrame} from "@sodashitsu/protocol";

type Child=Pick<ChildProcess,"on"|"kill">&{stdin:NonNullable<ChildProcess["stdin"]>;stdout:NonNullable<ChildProcess["stdout"]>;stderr:NonNullable<ChildProcess["stderr"]>};
export interface DesktopSigninWorkerDependencies {
  platform:NodeJS.Platform;now():number;
  spawn(command:string,args:string[],options:SpawnOptions):Child;
  /** The dedicated Node main must terminate itself if native teardown cannot be proved. */
  unsafeStop():void;
}
const unavailable=()=>new Error("Signin worker is unavailable");
const defaults:DesktopSigninWorkerDependencies={platform:process.platform,now:()=>performance.now(),spawn:(command,args,options)=>{
  return spawn(command,args,options) as Child;
},unsafeStop:()=>process.exit(1)};
const frame=z.object({type:z.literal("frame"),info:DesktopFrameInfo,data:z.string().min(1).max(2796204).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();
const inputAck=z.object({type:z.literal("input_ack"),seq:z.number().int().positive()}).strict();
const control=z.object({type:z.literal("control"),enabled:z.boolean()}).strict();
const optionsSchema=z.object({width:z.number().int().min(320).max(1920),fps:z.number().int().min(1).max(30),quality:z.number().int().min(20).max(90)}).strict();
const allowed=new Set(["control","release","ack","input","quality","heartbeat","keyframe","stop"]);
/** Dedicated service only. No arbitrary command or path is accepted. The native
 * host must hold the installed package and private runtime for this lifetime. */
export class DesktopSigninWorkerProcess {
  #child:Child|undefined;#spawning=true;#closing=false;#done=false;#notified=false;#ack=false;#ready=false;#unsafeTail=false;
  #line="";#lineBytes=0;readonly #decoder=new TextDecoder("utf-8",{fatal:true});
  #lastSeq=0;#pending=0;#drawn=0;#input=0;readonly #inputs=new Set<number>();
  readonly #deadline:number;readonly #readyUntil:number;
  #beat:ReturnType<typeof setInterval>|undefined;#readyTimer:ReturnType<typeof setTimeout>|undefined;#stopTimer:ReturnType<typeof setTimeout>|undefined;
  readonly #stopped:Promise<void>;#resolve!:()=>void;#reject!:(error:Error)=>void;
  readonly #abort=()=>this.close();
  constructor(private readonly options:{
    control:boolean;settings:z.infer<typeof optionsSchema>;active():boolean;signal:AbortSignal;
    /** Copy/consume synchronously; no plaintext is retained by the caller here. */
    record(bytes:Uint8Array,binary:boolean):void;closed():void;
  },private readonly deps:DesktopSigninWorkerDependencies=defaults){
    this.#stopped=new Promise((resolve,reject)=>{this.#resolve=resolve;this.#reject=reject;});void this.#stopped.catch(()=>{});
    const now=deps.now();this.#deadline=now+120000;this.#readyUntil=now+10000;
    if(deps.platform!=="win32"||!this.live())throw unavailable();
    const parsed=optionsSchema.safeParse(options.settings);if(!parsed.success)throw unavailable();const settings=parsed.data;options.signal.addEventListener("abort",this.#abort,{once:true});
    try{
      if(!this.live())throw unavailable();
      const command=fileURLToPath(new URL("../../../../DesktopSigninNative.exe",import.meta.url));
      const env:NodeJS.ProcessEnv={};for(const key of ["SystemRoot","windir","PATH","TEMP","TMP"]){const value=process.env[key];if(typeof value==="string")env[key]=value;}
      const child=deps.spawn(command,["--broker",options.control?"input":"view"],{stdio:["pipe","pipe","pipe"],windowsHide:true,cwd:win32.dirname(command),env});
      this.#child=child;this.#spawning=false;
      child.on("error",()=>this.close());child.on("close",code=>this.finished(code));
      if(!child.stdin||!child.stdout||!child.stderr){try{child.kill();}catch{}this.finished(null);throw unavailable();}
      child.stdin.on("error",()=>this.close());child.stdout.on("error",()=>this.close());child.stderr.on("error",()=>this.close());
      child.stderr.on("data",(bytes:Buffer)=>bytes.fill(0));
      child.stdout.on("data",(bytes:Buffer)=>this.receive(bytes));
      if(this.#closing||!this.live()){this.close();this.stopChild();return;}
      this.#readyTimer=setTimeout(()=>this.close(),10000);this.#readyTimer.unref();
      this.#beat=setInterval(()=>{if(!this.live()){this.close();return;}this.write({type:"heartbeat"});},2000);this.#beat.unref();
      this.write({type:"configure",...settings});
    }catch{
      this.#spawning=false;if(this.#child){this.close();return;}else{this.#closing=true;this.notify();this.#done=true;options.signal.removeEventListener("abort",this.#abort);this.#resolve();}throw unavailable();
    }
  }
  private live():boolean {
    try{return !this.#closing&&!this.#done&&!this.options.signal.aborted&&this.options.active()&&this.deps.now()<this.#deadline&&!this.#closing&&!this.#done&&!this.options.signal.aborted;}catch{return false;}
  }
  private notify():void {if(this.#notified)return;this.#notified=true;try{this.options.closed();}catch{}}
  private write(value:unknown):void {
    if(!this.live()){this.close();return;}
    const child=this.#child;if(!child){this.close();return;}
    const text=JSON.stringify(value)+"\n",size=Buffer.byteLength(text,"utf8"),pending=child.stdin.writableLength;
    if(size>16384||pending+size>32768||!this.live()){this.close();return;}
    try{child.stdin.write(text);}catch{this.close();}
  }
  send(raw:unknown):void {
    if(!this.live()||!this.#ready){this.close();return;}
    try{
      const message=RemoteDesktopViewerMessage.parse(raw);if(!allowed.has(message.type))throw unavailable();
      if(message.type==="stop"){this.close();return;}
      if(message.type==="control"&&message.enabled&&!this.options.control)throw unavailable();
      if(message.type==="ack"){if(message.seq!==this.#pending)throw unavailable();this.#drawn=message.seq;this.#pending=0;}
      if(message.type==="input"){if(!this.options.control||message.seq<=this.#input||message.frameSeq!==this.#drawn||this.#inputs.size>=32)throw unavailable();this.#input=message.seq;this.#inputs.add(message.seq);}
      this.write(message);
    }catch{this.close();}
  }
  private receive(bytes:Buffer):void {
    if(this.#done){bytes.fill(0);return;}
    try{
      if(this.#ack&&bytes.length)this.#unsafeTail=true;
      if(bytes.length>3000000)throw unavailable();
      const text=this.#decoder.decode(bytes,{stream:true});bytes.fill(0);
      let start=0,index:number;
      while((index=text.indexOf("\n",start))>=0){
        const part=text.slice(start,index);this.#lineBytes+=Buffer.byteLength(part,"utf8");if(this.#lineBytes>3000000)throw unavailable();
        const line=this.#line+part;this.#line="";this.#lineBytes=0;this.record(line.endsWith("\r")?line.slice(0,-1):line);start=index+1;
        if(this.#done)return;
      }
      const rest=text.slice(start);if(this.#ack&&rest.length)this.#unsafeTail=true;this.#lineBytes+=Buffer.byteLength(rest,"utf8");if(this.#lineBytes>3000000)throw unavailable();this.#line+=rest;
    }catch{bytes.fill(0);this.close();}
  }
  private record(text:string):void {
    if(this.#ack){this.#unsafeTail=true;return;}
    if(text==='{"type":"signin_stopped"}'){
      if(this.#ack)throw unavailable();this.#ack=true;this.close();return;
    }
    if(this.#closing)return;
    if(!this.live()||!this.#ready&&this.deps.now()>=this.#readyUntil)throw unavailable();
    const message=JSON.parse(text) as {type?:string};
    if(message.type==="ready"){
      if(this.#ready)throw unavailable();const ready=DesktopReady.parse(message);
      if(ready.backend!=="windows-gdi"||!ready.secureDesktop||ready.allowInput!==this.options.control||Object.keys(ready).some(key=>!["type","title","allowInput","width","height","backend","secureDesktop","imeKeys","extendedInput"].includes(key)))throw unavailable();
      if(!this.live()||this.deps.now()>=this.#readyUntil)throw unavailable();
      clearTimeout(this.#readyTimer);this.#readyTimer=undefined;this.#ready=true;this.options.record(Buffer.from(JSON.stringify(ready)),false);return;
    }
    if(!this.#ready)throw unavailable();
    if(message.type==="frame"){
      const value=frame.parse(message);if(this.#pending||value.info.seq<=this.#lastSeq||value.info.update)throw unavailable();
      const image=Buffer.from(value.data,"base64");if(image.toString("base64")!==value.data)throw unavailable();
      const binary=encodeDesktopFrame(value.info,image);decodeDesktopFrame(binary);this.#lastSeq=value.info.seq;this.#pending=value.info.seq;
      if(!this.live())throw unavailable();this.options.record(binary,true);return;
    }
    if(message.type==="input_ack"){const value=inputAck.parse(message);if(!this.#inputs.delete(value.seq))throw unavailable();this.options.record(Buffer.from(JSON.stringify(value)),false);return;}
    if(message.type==="control"){const value=control.parse(message);if(value.enabled&&!this.options.control)throw unavailable();this.options.record(Buffer.from(JSON.stringify(value)),false);return;}
    throw unavailable();
  }
  private stopChild():void {
    if(this.#spawning||this.#done||!this.#child||this.#stopTimer)return;
    // Discard unsent commands and signal EOF; the broker stops its Job rather
    // than draining the worker's input queue. Keep stdout until stop proof/exit.
    this.#stopTimer=setTimeout(()=>{if(this.#done)return;try{this.#child?.kill();}catch{}this.finished(null);},8000);this.#stopTimer.unref();
    try{this.#child.stdin.destroy();}catch{}
  }
  private finished(code:number|null):void {
    if(this.#done)return;let complete=false;try{complete=this.#decoder.decode().length===0&&this.#line.length===0&&this.#lineBytes===0;}catch{}
    this.#done=true;this.#closing=true;this.clear();this.notify();this.#line="";this.#lineBytes=0;this.#inputs.clear();
    if(code===0&&this.#ack&&!this.#unsafeTail&&complete){this.#resolve();return;}
    this.#reject(unavailable());try{this.deps.unsafeStop();}catch{}
  }
  private clear():void {
    clearTimeout(this.#readyTimer);clearTimeout(this.#stopTimer);clearInterval(this.#beat);this.#readyTimer=undefined;this.#stopTimer=undefined;this.#beat=undefined;
    this.options.signal.removeEventListener("abort",this.#abort);
  }
  close():void {
    if(this.#done)return;
    if(!this.#closing){this.#closing=true;clearTimeout(this.#readyTimer);clearInterval(this.#beat);this.#readyTimer=undefined;this.#beat=undefined;this.notify();}
    this.stopChild();
  }
  /** Must be awaited before creating another native worker. Unconfirmed stop
   * terminates the dedicated Node owner so its parent native Job can reap all. */
  settled():Promise<void>{return this.#stopped;}
}
