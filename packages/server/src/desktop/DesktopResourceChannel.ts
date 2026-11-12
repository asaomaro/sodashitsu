import {EventEmitter} from "node:events";
import type {DesktopInteractiveResource} from "./DesktopInteractiveOwner.js";
import type {DesktopHelper} from "./DesktopSharedCapture.js";
type Completion={key:string|number;promise:Promise<void>;resolve():void;reject(error:Error):void};
/** Demultiplex ordinary helper command replies before viewer teardown can hide
 * them. Control seq, clipboard generation and microphone id correlate replies. */
export class DesktopResourceChannel extends EventEmitter implements DesktopHelper {
 readonly resourceChannel=this;
 readonly stdin:DesktopHelper["stdin"];
 readonly stdout:DesktopHelper["stdout"];
 readonly stderr:DesktopHelper["stderr"];
 private closed=false;
 private sequence=0;
 private pending=new Map<DesktopInteractiveResource,Completion>();
 constructor(private child:DesktopHelper,private onClose:(source:DesktopResourceChannel)=>void){
  super();this.stderr=child.stderr;this.stdout=child.stdout;
  this.stdin=child.stdin;
  this.stdin.on("error",()=>child.kill());child.on("error",()=>child.kill());
  child.once("close",(code,signal)=>{
   if(this.closed)return;this.closed=true;
   for(const pending of this.pending.values())pending.reject(Error("Desktop helper closed"));this.pending.clear();
   this.onClose(this);this.emit("close",code,signal);
  });
 }
 accept(value:any):boolean {
  const resource=value.type==="control"?"control":value.type==="clipboard_control"?"clipboard":value.type==="native_microphone"?"microphone":undefined;
  if(!resource)return false;
  const key=resource==="control"?value.seq:resource==="clipboard"?value.generation:value.id,pending=this.pending.get(resource);
  if(value.enabled===false&&pending&&pending.key===key){this.pending.delete(resource);pending.resolve();}
  return true;
 }
 write(value:any):void {
  if(value.type==="control")value={...value,seq:++this.sequence};
  const resource=value.enabled===false?(value.type==="control"?"control":value.type==="clipboard_control"?"clipboard":value.type==="native_microphone"?"microphone":undefined):undefined;
  if(resource){
   if(this.pending.has(resource))return;
   const key=resource==="control"?value.seq:resource==="clipboard"?value.generation:value.id;
   let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});void promise.catch(()=>{});
   this.pending.set(resource,{key,promise,resolve,reject});
  }
  this.stdin.write(JSON.stringify(value)+"\n",error=>{if(error)this.child.kill();});
 }
 get exitCode(){return this.child.exitCode;}
 get signalCode(){return this.child.signalCode;}
 completed(resource:DesktopInteractiveResource):Promise<void>{return this.pending.get(resource)?.promise??(this.closed?Promise.resolve():new Promise(resolve=>this.once("close",()=>resolve())));}
 kill(signal?:NodeJS.Signals|number):boolean{return this.child.kill(signal);}
}
