import {Connection,type WebSocketLike} from "@sodashitsu/client-core/net/Connection";
import {DesktopNativeHelperDescriptor,type DesktopNativeHelperDescriptor as Descriptor} from "@sodashitsu/protocol";
/** Use the application's ordinary RPC connection to this page's server.
 * This helper belongs to one socket and is not resumed after disconnect. */
export class DesktopNativeHelperRpc {
 private readonly connection:Connection;
 private resolveReady!:()=>void;
 private rejectReady!:(error:Error)=>void;
 private readonly ready=new Promise<void>((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
 private dead=false;
 private viewer:string|undefined;
 constructor(private closed:()=>void,open=(url:string)=>new WebSocket(url) as unknown as WebSocketLike,fetchImpl:typeof fetch=fetch){
  void this.ready.catch(()=>{});
  this.connection=new Connection({
   kind:"desktop",httpOrigin:location.origin,wsUrl:location.origin.replace(/^http/,"ws")+"/ws",createWebSocket:open,fetchImpl,
   sink:{onOutput(){},onSnapshot(){},onSizeChanged(){}},
   store:{applySnapshot(){},applyEvent(){},onConnectionState:state=>{if(state==="rejected")this.close();},onAuthRequired:()=>this.close(),onOriginRejectSuspected(){}},
  });
  this.connection.onOpened(()=>this.resolveReady());
  // Connection notifies close before choosing whether to reconnect. Disposing
  // here uses its existing disconnect path to retire this socket's helper.
  this.connection.onClosed(()=>this.close());
 }
 async start(viewerId:string):Promise<Descriptor>{
  if(this.dead)throw Error("補助プログラムの接続は終了しました");
  if(this.viewer&&this.viewer!==viewerId)throw Error("別のデスクトップには使えません");
  this.viewer=viewerId;this.connection.connect();await this.ready;
  return DesktopNativeHelperDescriptor.parse(await this.connection.request("desktop.native_helper.start",{viewerId}));
 }
 async stop(viewerId:string){if(!this.dead)await this.connection.request("desktop.native_helper.stop",{viewerId});}
 close(){if(this.dead)return;this.dead=true;this.rejectReady(Error("補助プログラムの接続が終了しました"));this.connection.disconnect();this.closed();}
}
