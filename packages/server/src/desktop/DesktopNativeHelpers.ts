import {fork,type ChildProcess} from "node:child_process";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import {DesktopNativeHelperDescriptor,type DesktopNativeHelperDescriptor as Descriptor,RpcError} from "@sodashitsu/protocol";
type Entry={spawned:Promise<void>;resolveSpawn():void;initialized:boolean;owner:string;viewer:string;origin:string;stopped:boolean;child?:ChildProcess;ready:Promise<Descriptor>;resolve(value:Descriptor):void;reject(error:Error):void;closed:Promise<void>;resolveClose():void;closing?:Promise<void>;timer?:ReturnType<typeof setTimeout>;};
/** Managed child IPC transports discovery/shutdown only. Files use browser→localhost. */
export class DesktopNativeHelpers {
 private readonly entries=new Map<string,Entry>();private readonly closing=new Set<Promise<void>>();private dead=false;
 constructor(private launch:typeof fork=fork){}
 start(owner:string,viewer:string,origin:string,active=()=>true):Promise<Descriptor>{
  z.uuid().parse(viewer);const url=new URL(origin);if(!["http:","https:"].includes(url.protocol)||url.origin!==origin||!active())return Promise.reject(new RpcError("unauthorized","ブラウザから接続してください"));
  const key=JSON.stringify([owner,viewer]),old=this.entries.get(key);if(old){if(old.origin!==origin||old.stopped)return Promise.reject(Error("補助プログラムは終了待ちです"));return old.ready;}
  if(this.dead||this.entries.size>=8||[...this.entries.values()].filter(entry=>entry.owner===owner).length>=2)return Promise.reject(new RpcError("server_busy","補助プログラムの上限です"));
  let resolve!:(value:Descriptor)=>void,reject!:(error:Error)=>void,resolveClose!:()=>void,resolveSpawn!:()=>void;const spawned=new Promise<void>(yes=>{resolveSpawn=yes;});const ready=new Promise<Descriptor>((yes,no)=>{resolve=yes;reject=no;}),closed=new Promise<void>(yes=>{resolveClose=yes;});
  const entry:Entry={spawned,resolveSpawn,initialized:false,owner,viewer,origin,stopped:false,ready,resolve,reject,closed,resolveClose};this.entries.set(key,entry);void ready.catch(()=>{});
  try{
   const script=fileURLToPath(import.meta.resolve("@sodashitsu/client-core/desktop/DesktopNativeHelperChild.node"));
   const child=entry.child=this.launch(script,[origin],{stdio:["ignore","ignore","ignore","ipc"],serialization:"json",execArgv:[],windowsHide:true});
   child.once("close",()=>{entry.stopped=true;clearTimeout(entry.timer);this.entries.delete(key);entry.reject(Error("補助プログラムが終了しました"));entry.resolveClose();});
   child.once("error",()=>{void this.stopEntry(entry);});
   child.on("message",raw=>{try{const message=z.object({type:z.literal("ready"),descriptor:DesktopNativeHelperDescriptor}).strict().parse(raw);if(entry.stopped||entry.initialized||!active())throw Error("owner disconnected");clearTimeout(entry.timer);entry.initialized=true;entry.resolve(message.descriptor);}catch{void this.stopEntry(entry);}});
   entry.resolveSpawn();if(entry.stopped||!active()){void this.stopEntry(entry);return ready;}
   entry.timer=setTimeout(()=>{void this.stopEntry(entry);},10000);entry.timer.unref();
  }catch(error){entry.resolveSpawn();entry.reject(error instanceof Error?error:Error("起動できません"));if(entry.child)void this.stopEntry(entry);else{entry.stopped=true;this.entries.delete(key);entry.resolveClose();}}
  return ready;
 }
 private stopEntry(entry:Entry):Promise<void>{
  if(entry.closing)return entry.closing;entry.stopped=true;clearTimeout(entry.timer);entry.reject(Error("補助プログラムを停止しました"));
  const stopping=(async()=>{await entry.spawned;const child=entry.child;if(!child)return;try{if(child.connected)child.send({type:"stop"});else child.kill();}catch{child.kill();}
   const force=setTimeout(()=>child.kill(),60000);force.unref();try{await entry.closed;}finally{clearTimeout(force);}
  })();entry.closing=stopping;this.closing.add(stopping);void stopping.then(()=>this.closing.delete(stopping),()=>this.closing.delete(stopping));return stopping;
 }
 touch(owner:string,viewer:string,origin:string){const entry=this.entries.get(JSON.stringify([owner,viewer]));if(!entry||entry.stopped||!entry.initialized||entry.origin!==origin)throw new RpcError("not_found","補助プログラムの接続が終了しました");return {};}
 stop(owner:string,viewer:string):Promise<void>{const entry=this.entries.get(JSON.stringify([owner,viewer]));return entry?this.stopEntry(entry):Promise.resolve();}
 clientGone(owner:string){for(const entry of this.entries.values())if(entry.owner===owner)void this.stopEntry(entry);}
 async dispose(){this.dead=true;for(const entry of this.entries.values())void this.stopEntry(entry);await Promise.all(this.closing);}
}
