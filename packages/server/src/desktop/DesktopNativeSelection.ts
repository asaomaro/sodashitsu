import {lstat,unlink,rmdir} from "node:fs/promises";
import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {randomBytes} from "node:crypto";
import {join,win32} from "node:path";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import {desktopWindowsPowerShell} from "./DesktopWindowsPowerShell.js";
import {DesktopPointerWitness,type DesktopPointerWitness as Point} from "./DesktopPointerWitness.js";
/** Fixed program launch only. A child remains owned until actual close, even after timeout. */
export function nativeSelectionProcess(command:string,args:readonly string[],input:string,options:{timeout:number;limit:number;spawn?:typeof spawn;signal?:AbortSignal;now?:()=>number}):Promise<string>{
 return new Promise((resolve,reject)=>{
  const now=options.now??(()=>performance.now()),born=now(),until=born+options.timeout;let observed=born;
  if(!Number.isFinite(born)||born<0||!Number.isFinite(options.timeout)||options.timeout<=0){reject(Error("選択取得の期限が不正です"));return;}
  const fence=()=>{const at=now();if(options.signal?.aborted)throw Error("ドラッグの選択取得を中止しました");if(!Number.isFinite(at)||at<observed||at>=until)throw Error("ドラッグの選択取得が時間切れです");observed=at;};
  let child:ChildProcessWithoutNullStreams;try{child=(options.spawn??spawn)(command,[...args],{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false});}catch(error){reject(error);return;}
  let failed:Error|undefined,output:Buffer[]=[],bytes=0,diagnostics=0,closed=false;
  const fail=(reason:string)=>{if(!failed)failed=Error(reason);child.stdin.destroy();child.kill();};
  const abort=()=>fail("ドラッグの選択取得を中止しました");
  const timer=setTimeout(()=>fail("ドラッグの選択取得が時間切れです"),options.timeout);timer.unref();
  options.signal?.addEventListener("abort",abort,{once:true});
  child.stdout.on("data",(data:Buffer)=>{bytes+=data.length;if(bytes>options.limit)fail("選択情報が上限を超えました");else if(!failed)output.push(Buffer.from(data));});
  child.stderr.on("data",(data:Buffer)=>{diagnostics+=data.length;if(diagnostics>8192)fail("選択取得の診断が上限を超えました");});
  child.on("error",()=>fail("選択取得プログラムを起動できません"));child.stdin.on("error",()=>fail("選択取得の入力が終了しました"));
  child.on("close",(code,signal)=>{if(closed)return;closed=true;clearTimeout(timer);options.signal?.removeEventListener("abort",abort);try{if(failed)throw failed;fence();if(code!==0||signal)throw Error("選択取得プログラムが終了しました");const decoded=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(output));fence();resolve(decoded);}catch(error){reject(error);}finally{for(const data of output)data.fill(0);output=[];}});
  if(options.signal?.aborted)abort();else child.stdin.end(input);
 });
}
const built=z.object({binary:z.string().max(4096),directory:z.string().max(4096)}).strict();
const result=z.object({nonce:z.string().regex(/^[a-f0-9]{64}$/),epoch:z.uuid(),window:z.number().int().safe(),pid:z.number().int().positive(),paths:z.array(z.string().max(4096)).min(1).max(1000)}).strict();
export interface NativeSelectionRuntime {prepare():Promise<void>;capture(point:Point,remainingMs:number,signal:AbortSignal):Promise<readonly string[]>;}
/** Server-launch environment selects Windows or the fixed WSL interoperability paths.
 * No RPC/project configuration can select an executable, script, or source path. */
export class DesktopNativeSelection implements NativeSelectionRuntime {
 private prepared:Promise<void>|undefined;private binary:string|undefined;private busy=false;private stopped=false;private controller:AbortController|undefined;private drained:Promise<void>|undefined;private artifact:{directory:string;binary:string;directoryStamp:string;binaryStamp:string}|undefined;
 constructor(private os:NodeJS.Platform=process.platform,private env:NodeJS.ProcessEnv=process.env){}
 private async translate(path:string,windows:boolean){
  if(this.os==="win32")return path;
  const text=await nativeSelectionProcess("/usr/bin/wslpath",[windows?"-w":"-u",path],"",{timeout:3000,limit:8192});
  const value=text.trim();if(!value||/[\r\n\0]/.test(value))throw Error("Windows側の実行パスを確認できません");return value;
 }
 prepare(){if(this.stopped)return Promise.reject(Error("選択取得は終了しました"));return this.prepared??=this.build();}
 private async build(){
  if(this.os!=="win32"&&!this.env.WSL_DISTRO_NAME)throw Error("ExplorerドラッグはWindows側の共有で利用できます");
  const powershell=this.os==="win32"?desktopWindowsPowerShell(this.env.SystemRoot):"/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const script=await this.translate(fileURLToPath(new URL("../../../../scripts/remote-desktop/build-explorer-selection.ps1",import.meta.url)),true);
  const value=built.parse(JSON.parse((await nativeSelectionProcess(powershell,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script],"",{timeout:30000,limit:16384})).replace(/^\uFEFF/,"")));
  // Both values originate solely from the fixed builder. Refuse any unexpected shape.
  if(!/^[a-z]:\\/i.test(value.directory)||! /\\soda-explorer-worker-[a-f0-9]{32}$/i.test(value.directory)||value.binary!==value.directory+"\\selection.exe")throw Error("選択取得プログラムの準備結果が不正です");
  const directory=await this.translate(value.directory,false),binary=join(directory,"selection.exe");
  const [d,b]=await Promise.all([lstat(directory,{bigint:true}),lstat(binary,{bigint:true})]);
  if(!d.isDirectory()||d.isSymbolicLink()||!b.isFile()||b.isSymbolicLink()||b.nlink!==1n)throw Error("選択取得の実行ファイルを確認できません");
  const stamp=(s:typeof d)=>`${s.dev}:${s.ino}:${s.birthtimeNs}`;
  this.artifact={directory,binary,directoryStamp:stamp(d),binaryStamp:stamp(b)};this.binary=binary;
 }
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
  if(this.stopped||!this.binary||this.busy||signal.aborted||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>750)throw Error("ドラッグの選択取得を開始できません");
  this.busy=true;const started=performance.now(),controller=new AbortController();this.controller=controller;let drain!:()=>void;this.drained=new Promise(resolve=>{drain=resolve;});const combined=AbortSignal.any([signal,controller.signal]);
  const nonce=randomBytes(32).toString("hex");
  try{
   const output=await nativeSelectionProcess(this.binary,[],JSON.stringify({Nonce:nonce,Epoch:point.epoch,X:point.x,Y:point.y,Window:point.window,Process:point.pid})+"\n",{timeout:remainingMs,limit:4194305,signal:combined});
   const selection=result.parse(JSON.parse(output));
   if(combined.aborted||performance.now()-started>=remainingMs||selection.nonce!==nonce||selection.epoch!==point.epoch||selection.window!==point.window||selection.pid!==point.pid)throw Error("入力位置と選択対象が一致しません");
   return selection.paths;
  }finally{this.busy=false;this.controller=undefined;drain();}
 }
 async close(){
  this.stopped=true;this.controller?.abort();await this.prepared?.catch(()=>{});await this.drained;
  const artifact=this.artifact;this.binary=undefined;this.artifact=undefined;if(!artifact)return;
  const [d,b]=await Promise.all([lstat(artifact.directory,{bigint:true}),lstat(artifact.binary,{bigint:true})]);const stamp=(s:typeof d)=>`${s.dev}:${s.ino}:${s.birthtimeNs}`;
  if(!d.isDirectory()||d.isSymbolicLink()||!b.isFile()||b.isSymbolicLink()||b.nlink!==1n||stamp(d)!==artifact.directoryStamp||stamp(b)!==artifact.binaryStamp)throw Error("選択取得の生成物が変更されたため削除を中止しました");
  await unlink(artifact.binary);await rmdir(artifact.directory);
 }

}
