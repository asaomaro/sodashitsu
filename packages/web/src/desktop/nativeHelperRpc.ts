import {DesktopNativeHelperDescriptor,type DesktopNativeHelperDescriptor as Descriptor,type ParamsOf,type ResultOf} from "@sodashitsu/protocol";
type Method="client.hello"|"desktop.native_helper.start"|"desktop.native_helper.stop"|"desktop.native_helper.touch";
/** A dedicated direct connection to this page's server; never the selected B route. */
export class DesktopNativeHelperRpc {
 private socket:WebSocket|undefined;private dead=false;private sequence=0;private viewer:string|undefined;private heartbeat:ReturnType<typeof setInterval>|undefined;private ready:Promise<void>|undefined;private pending=new Map<string,{resolve(value:unknown):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}>();
 constructor(private closed:()=>void,private open=(url:string)=>new WebSocket(url)){}
 private connect(){return this.ready??=new Promise<void>((resolve,reject)=>{
  if(this.dead){reject(Error("補助プログラムの接続は終了しました"));return;}
  const socket=this.socket=this.open(location.origin.replace(/^http/,"ws")+"/ws");let hello=false;const timer=setTimeout(()=>{this.close();reject(Error("操作元の接続が時間切れです"));},15000);
  socket.onopen=()=>{void this.call("client.hello",{protocol:1,kind:"desktop"}).then(()=>{if(this.dead)return;hello=true;clearTimeout(timer);resolve();},error=>{clearTimeout(timer);reject(error);this.close();});};
  socket.onerror=()=>socket.close();socket.onclose=()=>{clearTimeout(timer);if(!hello)reject(Error("操作元に接続できません"));this.close();};
  socket.onmessage=event=>{try{
   if(typeof event.data!=="string"||event.data.length>8388608)throw Error("RPC message limit");const value=JSON.parse(event.data);if(!value||typeof value.id!=="string")return;const pending=this.pending.get(value.id);if(!pending)return;this.pending.delete(value.id);clearTimeout(pending.timer);if(value.error)pending.reject(Error("補助プログラムの要求を実行できません"));else pending.resolve(value.result);
  }catch{this.close();}};
 });}
 private call<M extends Method>(method:M,params:ParamsOf<M>):Promise<ResultOf<M>>{
  const socket=this.socket;if(this.dead||socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>16384||this.pending.size>=4)return Promise.reject(Error("操作元の接続が終了しました"));
  const id=String(++this.sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error("補助プログラムの応答がありません"));this.close();},15000);this.pending.set(id,{resolve:value=>resolve(value as ResultOf<M>),reject,timer});try{socket.send(JSON.stringify({id,method,params}));}catch{this.close();}});
 }
 async start(viewerId:string):Promise<Descriptor>{if(this.viewer&&this.viewer!==viewerId)throw Error("別のデスクトップには使えません");this.viewer=viewerId;await this.connect();const result=DesktopNativeHelperDescriptor.parse(await this.call("desktop.native_helper.start",{viewerId}));clearInterval(this.heartbeat);if(!this.dead)this.heartbeat=setInterval(()=>{void this.call("desktop.native_helper.touch",{viewerId}).catch(()=>this.close());},30000);return result;}
 async stop(viewerId:string){clearInterval(this.heartbeat);if(!this.dead&&this.socket?.readyState===WebSocket.OPEN)await this.call("desktop.native_helper.stop",{viewerId});}
 close(){if(this.dead)return;this.dead=true;clearInterval(this.heartbeat);for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error("補助プログラムの接続が終了しました"));}this.pending.clear();this.socket?.close();this.socket=undefined;this.closed();}
}
