import {desktopOwnedChild as nativeSelectionProcess} from "@sodashitsu/client-core/desktop/DesktopOwnedChild.node";
export {desktopOwnedChild as nativeSelectionProcess} from "@sodashitsu/client-core/desktop/DesktopOwnedChild.node";
import {join,win32} from "node:path";
import {randomBytes} from "node:crypto";
import {DesktopPointerWitness,type DesktopPointerWitness as Point} from "./DesktopPointerWitness.js";
import {DesktopNativeRoleBinary} from "@sodashitsu/client-core/desktop/DesktopNativeRoleBinary.node";
import {z} from "zod";
const result=z.object({nonce:z.string().regex(/^[a-f0-9]{64}$/),epoch:z.uuid(),window:z.number().int().safe(),pid:z.number().int().positive(),paths:z.array(z.string().max(4096)).min(1).max(1000)}).strict();
export interface NativeSelectionRuntime {prepare():Promise<void>;capture(point:Point,remainingMs:number,signal:AbortSignal):Promise<readonly string[]>;}
/** Server-launch environment selects Windows or the fixed WSL interoperability paths.
 * No RPC/project configuration can select an executable, script, or source path. */
export class DesktopNativeSelection implements NativeSelectionRuntime {
 private prepared:Promise<void>|undefined;private ready=false;private busy=false;private stopped=false;private controller:AbortController|undefined;private drained:Promise<void>|undefined;
 private readonly owner:DesktopNativeRoleBinary;
 constructor(private os:NodeJS.Platform=process.platform,private env:NodeJS.ProcessEnv=process.env){this.owner=new DesktopNativeRoleBinary('selection',os,env);}
 private async translate(path:string,windows:boolean){
  if(this.os==="win32")return path;
  const text=await nativeSelectionProcess("/usr/bin/wslpath",[windows?"-w":"-u",path],"",{timeout:3000,limit:8192});
  const value=text.trim();if(!value||/[\r\n\0]/.test(value))throw Error("Windows側の実行パスを確認できません");return value;
 }
 prepare(){if(this.stopped)return Promise.reject(Error("選択取得は終了しました"));return this.prepared??=(async()=>{await this.owner.prepare();if(!this.stopped)this.ready=true;})();}
 async paths(paths:readonly string[],signal:AbortSignal){
  if(this.os==="win32")return paths;
  const drives=new Map<string,string>();const result:string[]=[];
  for(const path of paths){
   if(signal.aborted||! /^[a-z]:\\/i.test(path)||win32.normalize(path)!==path)throw Error("Explorerのパスを確認できません");
   const drive=path.slice(0,3);let root=drives.get(drive);
   if(!root){root=await this.translate(drive,false);drives.set(drive,root);}
   const parts=path.slice(3).split("\\");if(parts.some(p=>p===".."||p==="."||p.includes("/")))throw Error("Explorerのパスを確認できません");
   result.push(join(root,...parts));
  }
  if(signal.aborted)throw Error("ドラッグを中止しました");return result;
 }
 async capture(raw:Point,remainingMs:number,signal:AbortSignal){
  const point=DesktopPointerWitness.parse(raw);
  if(this.stopped||!this.ready||this.busy||signal.aborted||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>750)throw Error("ドラッグの選択取得を開始できません");
  this.busy=true;const started=performance.now(),controller=new AbortController();this.controller=controller;let drain!:()=>void;this.drained=new Promise(resolve=>{drain=resolve;});const combined=AbortSignal.any([signal,controller.signal]);
  const nonce=randomBytes(32).toString("hex");
  try{
   const output=await nativeSelectionProcess(this.owner.executable,[...this.owner.arguments],JSON.stringify({Nonce:nonce,Epoch:point.epoch,X:point.x,Y:point.y,Window:point.window,Process:point.pid})+"\n",{timeout:remainingMs,limit:4194305,signal:combined});
   const selection=result.parse(JSON.parse(output));
   if(combined.aborted||performance.now()-started>=remainingMs||selection.nonce!==nonce||selection.epoch!==point.epoch||selection.window!==point.window||selection.pid!==point.pid)throw Error("入力位置と選択対象が一致しません");
   return selection.paths;
  }finally{this.busy=false;this.controller=undefined;drain();}
 }
 async close(){
  this.stopped=true;this.ready=false;this.controller?.abort();const retiring=this.owner.retirePreparation();await this.prepared?.catch(()=>{});await this.drained;await retiring;
  await this.owner.close();
 }

}
