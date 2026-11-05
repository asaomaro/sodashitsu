import {randomUUID} from "node:crypto";
import {DesktopMethods,RpcError,type MethodName,type ParamsOf,type ResultOf} from "@sodashitsu/protocol";
import type {DesktopProviderApi} from "./DesktopProvider.js";
import type {DesktopProviderEndpointScope} from "./DesktopProviderCore.js";

/** An authenticated viewer's local source lease. No machine registration or general RPC access. */
export class LocalDesktopRpc {
 private readonly owner=`desktop-local-${randomUUID()}`;
 private closed=false;
 private scope:DesktopProviderEndpointScope|undefined;
 constructor(private readonly provider:Pick<DesktopProviderApi,"capabilities"|"endpointScope"|"clientGone">,private readonly origin:()=>Promise<string>,private readonly nativeOrigin:string){}
 async hello():Promise<void>{if(this.closed)throw new RpcError("not_found","共有が終了しました");}
 async request<M extends MethodName>(method:M,params:ParamsOf<M>):Promise<ResultOf<M>>{
  if(this.closed)throw new RpcError("not_found","共有が終了しました");
  let result:unknown;
  if(method==="desktop.capabilities"){
   DesktopMethods["desktop.capabilities"].parse(params);result=this.provider.capabilities();
  }else if(method==="desktop.start"){
   const parsed=DesktopMethods["desktop.start"].parse(params),origin=await this.origin();
   if(this.closed||this.provider.capabilities().endpointRequired)throw new RpcError("unauthorized","ローカル共有を開始できません");
   if(new URL(parsed.url).origin.replace(/^ws/,"http")!==origin)throw new RpcError("unauthorized","ローカル共有の接続先が一致しません");
   this.scope??=this.provider.endpointScope(origin,()=>!this.closed,this.nativeOrigin);
   result=await this.scope.start(this.owner,parsed);
   if(this.closed){this.provider.clientGone(this.owner);throw new RpcError("not_found","共有が終了しました");}
  }else throw new RpcError("unauthorized","ローカル共有では許可されていない操作です");
  return result as ResultOf<M>;
 }
 close():void{if(this.closed)return;this.closed=true;this.scope?.close();this.provider.clientGone(this.owner);}
}
