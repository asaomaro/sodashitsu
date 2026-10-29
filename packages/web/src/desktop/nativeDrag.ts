import {DesktopNativeFileOffer,DesktopNativeHelperEvent,type DesktopNativeHelperRequest} from "@sodashitsu/protocol";
import type {DesktopFileClient} from "./fileClient.js";
type Point={x:number;y:number;clientX:number;clientY:number};
type Job={gesture:string;born:number;point:Point;seq?:number;ack:boolean;armed:boolean;started:boolean;moved:boolean;phase:"waiting"|"preparing"|"activating"|"native";latest?:Point;offer?:ReturnType<typeof DesktopNativeFileOffer.parse>;timer:ReturnType<typeof setTimeout>;heartbeat?:ReturnType<typeof setInterval>;};
/** Browser gesture is owned until native completion. No input transform or target path. */
export class DesktopNativeDrag {
 private job:Job|undefined;private retiring:string|undefined;private dead=false;private observed=0;
 constructor(private options:{files:DesktopFileClient;origin:string;send(value:DesktopNativeHelperRequest):void;valid(fresh:boolean):boolean;fallback(point:Point|undefined):void;handoff():void;release():void;status(value:string):void;now?:()=>number}){}
 private now(){const at=this.options.now?.()??performance.now();if(!Number.isFinite(at)||at<this.observed)throw Error("ドラッグの時計が不正です");this.observed=at;return at;}
 private live(job:Job,fresh=true){const valid=this.options.valid(fresh),at=this.now();if(this.dead||this.job!==job||!valid||at-job.born>=900000||fresh&&at-job.born>=750)throw Error("ドラッグの操作条件が終了しました");}
 begin(point:Point){
  try{
   if(this.dead||this.job||this.retiring||!this.options.valid(true))return false;
   const gesture=crypto.randomUUID(),job:Job={gesture,born:this.now(),point,ack:false,armed:false,started:false,moved:false,phase:"waiting",timer:setTimeout(()=>this.cancel(),750)};this.job=job;
   this.options.send({type:"arm",gesture});return true;
  }catch{this.cancel();return false;}
 }
 sent(seq:number){if(this.job?.phase==="waiting"&&this.job.seq===undefined)this.job.seq=seq;}
 ack(seq:number){const job=this.job;if(job&&job.seq===seq){job.ack=true;void this.prepare(job);}}
 pointer(point:Point,event:"move"|"down"|"up",buttons:number){
  const job=this.job;if(!job)return false;if(job.phase==="native")return true;
  if(event==="up"||buttons!==1){const committed=job.phase==="activating";this.cancel();return committed;}
  if(event==="move"){job.latest=point;if(Math.hypot(point.clientX-job.point.clientX,point.clientY-job.point.clientY)>=4)job.moved=true;void this.prepare(job);return true;}return false;
 }
 event(raw:unknown){
  const event=DesktopNativeHelperEvent.parse(raw);if(event.type==="done"&&event.gesture===this.retiring){this.retiring=undefined;return;}const job=this.job;if(!job||!("gesture"in event)||event.gesture!==job.gesture)return;
  if(event.type==="armed"){job.armed=true;void this.prepare(job);}
  else if(event.type==="need")void this.read(job,event);
  else if(event.type==="done"){try{this.live(job,false);}catch{this.cancel();return;}this.finish(job,event.ok?"Explorerへのコピーが完了しました":"ドラッグ転送を完了できませんでした");}
 }
 private async prepare(job:Job){
  if(this.job!==job||job.phase!=="waiting"||!job.armed||!job.ack||!job.moved||job.seq===undefined)return;
  job.phase="preparing";
  try{
   this.live(job);const result=await this.options.files.request({action:"native_prepare",gesture:job.gesture,origin:this.options.origin,seq:job.seq});this.live(job);job.offer=DesktopNativeFileOffer.parse(result.native);
   job.phase="activating";const activated=await this.options.files.request({action:"native_activate",gesture:job.gesture,lease:job.offer.lease});this.live(job);if(activated.id!==job.offer.lease)throw Error("解除完了を確認できません");
   job.phase="native";clearTimeout(job.timer);this.options.handoff();this.live(job,false);job.started=true;this.options.send({type:"start",gesture:job.gesture,offer:job.offer});this.live(job,false);this.options.status("Explorerへドラッグ転送中");this.live(job,false);
   job.heartbeat=setInterval(()=>{if(this.job!==job)return;try{this.live(job,false);}catch{this.cancel();return;}void this.options.files.request({action:"native_heartbeat",gesture:job.gesture,lease:job.offer!.lease}).catch(()=>{if(this.job===job)this.cancel();});},1000);
  }catch{if(this.job===job)this.cancel();else this.abortSource(job);}
 }
 private async read(job:Job,event:Extract<ReturnType<typeof DesktopNativeHelperEvent.parse>,{type:"need"}>){
  try{
   this.live(job,false);if(job.phase!=="native"||!job.offer)throw Error("転送は開始されていません");
   // C# reuses its per-file id. B requires a fresh anti-replay id for every chunk.
   const result=await this.options.files.request({action:"native_read",gesture:job.gesture,lease:job.offer.lease,request:crypto.randomUUID(),index:event.index,offset:event.offset,length:event.length});this.live(job,false);
   if(result.offset!==event.offset||typeof result.data!=="string")throw Error("読み込み結果が不正です");this.options.send({type:"bytes",gesture:job.gesture,request:event.request,index:event.index,offset:event.offset,data:result.data});
  }catch{if(this.job===job)this.cancel();}
 }
 private abortSource(job:Job){try{void this.options.files.request({action:"native_abort",gesture:job.gesture}).catch(()=>{});}catch{}}
 private clear(job:Job){clearTimeout(job.timer);clearInterval(job.heartbeat);if(this.job===job)this.job=undefined;}
 private finish(job:Job,message:string){this.clear(job);this.abortSource(job);this.options.status(message);}
 cancel(){const job=this.job;if(!job)return;if(job.started)this.retiring=job.gesture;this.clear(job);this.abortSource(job);try{this.options.send({type:"cancel",gesture:job.gesture});}catch{}if(job.phase==="activating"||job.phase==="native"){this.options.release();this.options.status("ドラッグ転送を中止しました");}else this.options.fallback(job.latest);}
 interrupt(){if(this.job?.phase!=="native")this.cancel();}
 stop(){this.dead=true;this.cancel();}
 get pending(){return !!this.job||!!this.retiring;}
}
