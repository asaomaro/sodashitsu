import {EventEmitter} from "node:events";
import {decodeDesktopFrame,DESKTOP_INPUT_PROTOCOL} from "@sodashitsu/protocol";

/** Private in-process consumer. No browser, HTTP session, pixels on disk, or focus lifecycle. */
export class HeadlessViewer extends EventEmitter {
 readonly protocol=DESKTOP_INPUT_PROTOCOL;
 readonly bufferedAmount=0;
 readyState=1;
 failureMessage:string|undefined;
 onFrame:()=>void=()=>{};
 onFailure:(message:string)=>void=()=>{};
 receive(value:unknown){if(this.readyState===1)this.emit("message",Buffer.from(JSON.stringify(value)),false);}
 send(data:string|Uint8Array):void{
  if(this.readyState!==1)return;
  if(typeof data!=="string"){
   const {info}=decodeDesktopFrame(data);
   queueMicrotask(()=>{this.receive({type:"ack",seq:info.seq});if(this.readyState===1)this.onFrame();});
   return;
  }
  const message=JSON.parse(data);
  if(message.type==="error"){this.failureMessage=message.message;queueMicrotask(()=>this.onFailure(message.message));}
  if(message.type==="ready"&&(message.secureDesktop||!message.allowInput))queueMicrotask(()=>this.onFailure("ロック画面または入力が許可されていない画面です"));
 }
 ping():void{if(this.readyState===1)this.emit("pong");}
 close():void{if(this.readyState!==1)return;this.readyState=3;this.emit("close",1000);}
 terminate():void{this.close();}
}
