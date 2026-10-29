import {DesktopNativeFileRequest,DesktopNativeFileOffer} from "@sodashitsu/protocol";
import {DesktopNativeSources,type NativeSourceScope} from "./DesktopNativeSources.js";
import type {DesktopPointerWitness} from "./DesktopPointerWitness.js";
import type {NativeSelectionRuntime} from "./DesktopNativeSelection.js";
export interface NativeFilePointer {seq:number;point:DesktopPointerWitness;at:number;valid():boolean;release():Promise<{id:string;epoch:string}>;}
export interface NativeFileHooks {origin:string;pointer(seq:number):NativeFilePointer|undefined;runtime:NativeSelectionRuntime;paths?(paths:readonly string[],signal:AbortSignal):Promise<readonly string[]>;}
type State={gesture:string;controller:AbortController;pointer:NativeFilePointer;fence():void;scope:NativeSourceScope;lease?:DesktopNativeSources;phase:"preparing"|"offered"|"releasing"|"active";preparation:Promise<void>;prepared():void;born:number;observed:number;timer?:ReturnType<typeof setTimeout>};
export class DesktopNativeFileBudget {
 private owner:object|undefined;
 acquire(owner:object){if(this.owner)return false;this.owner=owner;return true;}
 release(owner:object){if(this.owner===owner)this.owner=undefined;}
}
const processBudget=new DesktopNativeFileBudget();
/** One offer/active COPY per explicit file grant. Public requests never contain B paths. */
export class DesktopNativeFiles {
 private state:State|undefined;private dead=false;private seen=new Set<string>();private closing=new Set<Promise<void>>();
 constructor(private root:string,private owner:string,private hooks:NativeFileHooks,private clock=()=>performance.now(),private budget=processBudget) {}
 cancel(gesture?:string){
  if(gesture&&!this.seen.has(gesture)){if(this.seen.size>=4096){this.dead=true;gesture=undefined;}else this.seen.add(gesture);}
  const state=this.state;
  if(state&&(!gesture||gesture===state.gesture)){
   this.state=undefined;clearTimeout(state.timer);state.controller.abort();
   const closing=(async()=>{try{await state.preparation;await state.lease?.close();}finally{this.budget.release(state);}})();
   this.closing.add(closing);void closing.then(()=>this.closing.delete(closing),()=>this.closing.delete(closing));
  }
 }
 private arm(state:State){clearTimeout(state.timer);const until=state.phase==="active"?Math.min(state.born+900000,this.clock()+5000):state.pointer.at+750;state.timer=setTimeout(()=>this.cancel(state.gesture),Math.max(1,until-this.clock()));state.timer.unref();}
 private check(state:State,preRelease=true){
  state.fence();const pointerValid=!preRelease||state.phase==="active"||state.pointer.valid();const now=this.clock();
  if(this.dead||this.state!==state||state.controller.signal.aborted||!Number.isFinite(now)||now<0||now<state.observed||now<state.pointer.at||now-state.born>900000||!pointerValid||preRelease&&state.phase!=="active"&&now-state.pointer.at>=750)throw Error("ドラッグの操作条件が終了しました");
  state.observed=now;
 }
 async run(raw:unknown,fence:()=>void){
  const request=DesktopNativeFileRequest.parse(raw);
  if(request.action==="native_abort"){this.cancel(request.gesture);return {};}
  fence();
  if(request.action==="native_prepare"){
   if(request.origin!==this.hooks.origin)throw Error("認証済みの接続元と一致しません");
   if(this.dead||this.state||this.seen.has(request.gesture)||this.seen.size>=4096)throw Error("別のドラッグが処理中か期限切れです");
   const pointer=this.hooks.pointer(request.seq);if(!pointer||!pointer.valid())throw Error("ドラッグ開始の入力を確認できません");
   if(this.dead||this.state||this.seen.has(request.gesture)||this.seen.size>=4096)throw Error("ドラッグは取り消されました");
   this.seen.add(request.gesture);
   let prepared!:()=>void;const preparation=new Promise<void>(resolve=>{prepared=resolve;});
   const state:State={gesture:request.gesture,controller:new AbortController(),pointer,fence,scope:{owner:this.owner,origin:this.hooks.origin,gesture:request.gesture,generation:pointer.point.epoch},phase:"preparing",preparation,prepared,born:0,observed:0};if(!this.budget.acquire(state))throw Error("別のドラッグが接続先で処理中です");this.state=state;
   try{
    state.born=state.observed=this.clock();this.arm(state);this.check(state);const paths=await this.hooks.runtime.capture(pointer.point,750-(this.clock()-pointer.at),state.controller.signal);this.check(state);
    const localPaths=this.hooks.paths?await this.hooks.paths(paths,state.controller.signal):paths;this.check(state);
    const lease=await DesktopNativeSources.create(this.root,localPaths,state.scope,()=>{try{this.check(state,state.phase!=="active");return true;}catch{return false;}},this.clock);state.lease=lease;this.check(state);
    const offer=DesktopNativeFileOffer.parse({lease:lease.id,generation:state.scope.generation,entries:lease.manifest(state.scope).map(entry=>({...entry,sha256:entry.directory?"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855":entry.sha256}))});
    // Keep the existing 100000-byte file lane bound. Oversize metadata falls back intact.
    if(Buffer.byteLength(JSON.stringify(offer))>98000)throw Error("選択情報が上限を超えています。通常のファイル転送を使ってください");
    state.phase="offered";return {native:offer};
   }catch(error){this.cancel(state.gesture);throw error;}finally{state.prepared();}
  }
  const state=this.state;if(!state||state.gesture!==request.gesture||state.lease?.id!==request.lease)throw Error("別のドラッグには利用できません");
  try{
   this.check(state);
   if(request.action==="native_activate"){
    if(state.phase!=="offered")throw Error("ドラッグは開始済みです");
    state.phase="releasing";const receipt=await state.pointer.release();
    // Releasing control intentionally invalidates the old pointer. All other grant,
    // session, abort and monotonic/gesture deadlines remain mandatory.
    this.check(state,false);if(receipt.epoch!==state.scope.generation||this.clock()-state.pointer.at>=750)throw Error("元の操作の解除を確認できません");
    state.phase="active";state.lease.activate(state.scope);this.arm(state);return {id:state.lease.id};
   }
   if(state.phase!=="active")throw Error("ドラッグはまだ開始されていません");
   if(request.action==="native_heartbeat"){state.lease.heartbeat(state.scope);this.arm(state);return {};}
   const data=await state.lease.read(state.scope,request.request,request.index,request.offset,request.length);
   try{this.check(state,false);return {data:data.toString("base64"),offset:request.offset};}finally{data.fill(0);}
  }catch(error){this.cancel(state.gesture);throw error;}
 }
 async close(){this.dead=true;this.cancel();await Promise.all(this.closing);}
}
