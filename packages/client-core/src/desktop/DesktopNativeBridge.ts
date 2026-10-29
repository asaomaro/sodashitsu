/// <reference lib="dom" />
import type {DesktopNativeHelperDescriptor} from "@sodashitsu/protocol";
/** Browser-only local iframe bridge. The locator is never accepted as proof by itself. */
export class DesktopNativeBridge {
 private observed=0;private receivedAt=0;
 private dead=false;private ready=false;private frame:HTMLIFrameElement;private port:MessagePort|undefined;private heartbeat:ReturnType<typeof setInterval>|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private reject!:(error:Error)=>void;private resolve!:()=>void;private readonly initialized:Promise<void>;
 private constructor(private descriptor:DesktopNativeHelperDescriptor,private options:{signal:AbortSignal;event(value:unknown):void;closed?(error:Error):void}){
  const url=new URL(descriptor.origin);
  if(!/^http:\/\/n[a-f0-9]{32}\.localhost:[1-9][0-9]{0,4}$/.test(descriptor.origin)||url.origin!==descriptor.origin||Number(url.port)>65535||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(descriptor.id)||descriptor.url!==`${descriptor.origin}/bridge?id=${descriptor.id}`)throw Error("補助プログラムの接続先が不正です");
  this.initialized=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
  this.frame=document.createElement("iframe");this.frame.hidden=true;this.frame.dataset.nativeHelper="";this.frame.sandbox.add("allow-scripts","allow-same-origin");this.frame.onerror=()=>this.stop(Error("ブラウザPCの補助プログラムへ接続できません"));
  window.addEventListener("message",this.message);options.signal.addEventListener("abort",this.abort,{once:true});
  this.timer=setTimeout(()=>this.stop(Error("ブラウザPCの補助プログラムを確認できません")),3000);
  if(options.signal.aborted){this.abort();return;}this.frame.src=descriptor.url;document.body.append(this.frame);
 }
 static async connect(descriptor:DesktopNativeHelperDescriptor,options:{signal:AbortSignal;event(value:unknown):void;closed?(error:Error):void}){
  const bridge=new DesktopNativeBridge(descriptor,options);await bridge.initialized;return bridge;
 }
 private abort=()=>this.stop(Error("補助プログラムの接続を中止しました"));
 private message=(event:MessageEvent)=>{
  if(this.dead||this.port||event.source!==this.frame.contentWindow||event.origin!==this.descriptor.origin||event.data?.type!=="soda-native-frame"||event.data.id!==this.descriptor.id)return;
  window.removeEventListener("message",this.message);clearTimeout(this.timer);this.timer=setTimeout(()=>this.stop(Error("補助プログラムの準備が時間切れです")),60000);
  const channel=new MessageChannel();this.port=channel.port1;this.port.onmessageerror=()=>this.stop(Error("補助プログラムの応答が不正です"));this.port.onmessage=event=>{
   if(this.dead)return;const value=event.data,at=performance.now();if(!Number.isFinite(at)||at<this.observed){this.stop(Error("補助プログラムの時計が不正です"));return;}this.observed=this.receivedAt=at;
   if(value?.type==="error"){this.stop(Error("補助プログラムとの接続が終了しました"));return;}
   if(this.ready&&value?.type==="alive"&&Object.keys(value).length===1)return;
   if(!this.ready){if(!value||Object.keys(value).length!==2||value.type!=="ready"||value.id!==this.descriptor.id){this.stop(Error("補助プログラムの識別子が一致しません"));return;}this.ready=true;clearTimeout(this.timer);this.heartbeat=setInterval(()=>{try{const now=performance.now();if(!Number.isFinite(now)||now<this.observed||now-this.receivedAt>=5000){this.stop(Error("補助プログラムの応答がありません"));return;}this.observed=now;this.send({type:"beat"});}catch{this.stop();}},1000);this.resolve();return;}
   try{this.options.event(value);}catch{this.stop(Error("ドラッグ転送を継続できません"));}
  };this.port.start();
  try{this.frame.contentWindow!.postMessage({type:"soda-native-connect",id:this.descriptor.id},this.descriptor.origin,[channel.port2]);}catch{channel.port2.close();this.stop(Error("補助プログラムを認証できません"));}
 };
 send(value:unknown){
  if(this.dead||!this.ready||!this.port)throw Error("補助プログラムとの接続が終了しています");
  const data=JSON.stringify(value);if(new TextEncoder().encode(data).length>100000){this.stop(Error("転送メッセージが上限を超えています"));throw Error("Native packet limit");}this.port.postMessage(value);
 }
 stop(error=Error("補助プログラムを停止しました")){
  if(this.dead)return;this.dead=true;clearTimeout(this.timer);clearInterval(this.heartbeat);window.removeEventListener("message",this.message);this.options.signal.removeEventListener("abort",this.abort);this.port?.close();this.frame.remove();if(!this.ready)this.reject(error);else this.options.closed?.(error);
 }
}
