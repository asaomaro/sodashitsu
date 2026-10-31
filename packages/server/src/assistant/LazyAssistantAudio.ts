import {AssistantAudioBeginParams,RpcError} from "@sodashitsu/protocol";
import type {AssistantAudioUploads} from "./AssistantAudioUploads.js";
type Runtime=Pick<AssistantAudioUploads,"begin"|"chunk"|"commit"|"cancel"|"onClientGone"|"suspend"|"resume"|"close">;
type Begin=AssistantAudioUploads["begin"];
type Prove=Parameters<Begin>[2];
type Factory=()=>Runtime;
export type AssistantAudioService=Omit<Runtime,"begin"> & {begin(...args:Parameters<Begin>):ReturnType<Begin>|Promise<ReturnType<Begin>>};
/** Authenticated begin is the only operation that may load or instantiate audio support. */
export class LazyAssistantAudio implements AssistantAudioService {
 private runtime:Runtime|null=null;
 private loading:Promise<Factory>|null=null;
 private pending=new Map<string,{active:boolean}>();
 private generation=0;
 private suspended=false;
 private closed=false;
 constructor(private readonly dir:string,private readonly load:()=>Promise<Factory>=async()=>{
  const {AssistantAudioUploads}=await import("./AssistantAudioUploads.js");return ()=>new AssistantAudioUploads(dir);
 },private readonly now:()=>number=()=>performance.now()){}
 private factory():Promise<Factory>{
  if(this.loading)return this.loading;
  const loading=Promise.resolve().then(()=>this.load());this.loading=loading;
  void loading.catch(()=>{if(this.loading===loading)this.loading=null;});return loading;
 }
 async begin(owner:string,raw:unknown,prove:Prove):Promise<ReturnType<Begin>>{
  const generation=this.generation;
  const input=AssistantAudioBeginParams.parse(raw),expires=this.now()+input.ttlMs;
  if(this.closed||this.suspended||generation!==this.generation||this.pending.size>=2||this.pending.has(owner))throw new RpcError("agent_pane_busy","音声処理の準備が終了するまで待ってください");
  const lease={active:true};
  this.pending.set(owner,lease);
  try{
   const valid=()=>{
    const at=this.now();
    if(this.closed||this.suspended||generation!==this.generation||!lease.active||at>=expires)throw new RpcError("agent_pane_busy","音声処理の準備が取り消されたか期限が切れました");
   };
   const target={...prove()};valid();
   const check=()=>{
    valid();const current=prove();valid();
    if(current.paneId!==target.paneId||current.instanceId!==target.instanceId||current.threadId!==target.threadId||current.projectDir!==target.projectDir)throw new RpcError("agent_not_found","音声の送信先が変更されました");
    return current;
   };
   check();
   if(!this.runtime){
    const create=await this.factory();check();
    if(!this.runtime){
     const created=create();this.runtime=created;
     try{check();}catch(error){await created.close();if(this.runtime===created)this.runtime=null;throw error;}
    }
   }
   check();const remaining=Math.floor(expires-this.now());
   if(remaining<1)throw new RpcError("agent_pane_busy","音声の送信期限が切れました");
   return this.runtime.begin(owner,{...input,ttlMs:remaining},check);
  }finally{if(this.pending.get(owner)===lease)this.pending.delete(owner);}
 }
 chunk(...args:Parameters<Runtime["chunk"]>):void{if(!this.runtime)throw new RpcError("not_found","音声の送信対象が見つかりません");this.runtime.chunk(...args);}
 commit(...args:Parameters<Runtime["commit"]>):ReturnType<Runtime["commit"]>{if(!this.runtime)return Promise.reject(new RpcError("not_found","音声の送信対象が見つかりません"));return this.runtime.commit(...args);}
 cancel(...args:Parameters<Runtime["cancel"]>):void{this.runtime?.cancel(...args);}
 onClientGone(owner:string):void{const lease=this.pending.get(owner);if(lease)lease.active=false;this.runtime?.onClientGone(owner);}
 async suspend():Promise<void>{this.suspended=true;++this.generation;await this.runtime?.suspend();}
 resume():void{if(this.closed)return;this.suspended=false;this.runtime?.resume();}
 async close():Promise<void>{this.closed=true;this.suspended=true;++this.generation;await this.runtime?.close();}
}
