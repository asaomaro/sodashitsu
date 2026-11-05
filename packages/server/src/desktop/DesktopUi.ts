import {execFile} from "node:child_process";
import {win32} from "node:path";
import {randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
import {z} from "zod";
import {DesktopUiAction,DesktopUiActParams,RpcError,type DesktopUiSnapshot} from "@sodashitsu/protocol";
import type {DesktopAgentAccess} from "./DesktopAgentAccess.js";
import {windowsUiAutomationScript} from "./WindowsUiAutomationScript.js";

const Window=z.object({id:z.string().regex(/^[1-9][0-9]{0,18}$/),name:z.string().max(256),processId:z.number().int().positive()}).strict();
const Runtime=z.array(z.number().int()).max(128);
const NativeTree=z.object({window:Window,windows:z.array(Window).max(64),started:z.string().regex(/^[0-9]{1,20}$/),rootRuntime:Runtime,elements:z.array(z.object({parent:z.number().int().min(-1).max(511),name:z.string().max(256),controlType:z.string().max(100),automationId:z.string().max(256),value:z.string().max(512).nullable(),enabled:z.boolean(),offscreen:z.boolean(),password:z.boolean(),actions:z.array(DesktopUiAction).max(7),bounds:z.object({x:z.number(),y:z.number(),width:z.number().nonnegative(),height:z.number().nonnegative()}).strict(),runtime:Runtime,signature:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(512),truncated:z.boolean()}).strict();
type Tree=z.infer<typeof NativeTree>;
type Proof={owner:string;id:string;at:number;tree:Tree;elements:Map<string,Tree["elements"][number]>;unsubscribe:()=>void};
export type UiRunner=(request:unknown,signal:AbortSignal)=>Promise<unknown>;
export async function runWindowsUi(request:unknown,signal:AbortSignal):Promise<unknown>{
 const executable=process.platform==="win32"?win32.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe"):process.env.WSL_DISTRO_NAME?"/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe":undefined;
 if(!executable)return {unavailable:true};
 return new Promise((resolve,reject)=>{
  const child=execFile(executable,["-NoLogo","-NoProfile","-NonInteractive","-MTA","-EncodedCommand",Buffer.from(windowsUiAutomationScript,"utf16le").toString("base64")],{windowsHide:true,timeout:12000,maxBuffer:2*1024*1024,signal},(error,stdout)=>{
   if(error){reject(new Error("Windows UI Automationを実行できません"));return;}
   try{resolve(JSON.parse(stdout));}catch{reject(new Error("UI情報を読み取れません"));}
  });
  child.stdin?.on("error",()=>{});child.stdin?.end(JSON.stringify(request));
 });
}
/** UI references are private, one use, source scoped, and never selected by a caller's runtime id. */
export class DesktopUi {
 private proofs=new Map<string,Proof>();
 constructor(private readonly access:DesktopAgentAccess,private readonly guard:(owner:string,lease:string)=>void,private readonly run:UiRunner=runWindowsUi){}
 invalidate(lease:string):void{const proof=this.proofs.get(lease);this.proofs.delete(lease);proof?.unsubscribe();}
 private async execute(owner:string,lease:string,request:unknown):Promise<unknown>{
  this.guard(owner,lease);
  return this.access.exclusive(owner,lease,async()=>{
   const controller=new AbortController();const unsubscribe=this.access.onOwnerRevoked(owner,()=>controller.abort());
   try{this.guard(owner,lease);const value=await this.run(request,controller.signal);this.guard(owner,lease);return value;}finally{unsubscribe();}
  });
 }
 async observe(owner:string,lease:string,windowId?:string):Promise<DesktopUiSnapshot>{
  this.guard(owner,lease);this.invalidate(lease);
  let result:unknown;
  try{result=await this.execute(owner,lease,{mode:"observe",...(windowId?{windowId}:{})});}catch(error){this.guard(owner,lease);return {available:false,reason:"UI情報を取得できません。画像で確認してください。"};}
  const parsed=NativeTree.safeParse(result);
  if(!parsed.success)return {available:false,reason:"この画面からUI情報を取得できません。画像で確認してください。"};
  const tree=parsed.data,id=randomUUID(),ids=tree.elements.map(()=>randomUUID());
  const proof:Proof={owner,id,at:performance.now(),tree,elements:new Map(ids.map((id,i)=>[id,tree.elements[i]!])),unsubscribe:()=>{}};
  proof.unsubscribe=this.access.onOwnerRevoked(owner,()=>this.invalidate(lease));this.proofs.set(lease,proof);
  return {available:true,observationId:id,window:tree.window,windows:tree.windows,truncated:tree.truncated,validForMs:60000,elements:tree.elements.map((element,i)=>{
   const {runtime:_runtime,signature:_signature,parent,value,...publicFields}=element;
   return {...publicFields,...(element.password?{name:"Password",automationId:"",actions:[]}:{}),id:ids[i]!,parentId:parent>=0&&parent<i?ids[parent]!:null,...(value!==null&&!element.password?{value}:{})};
  })};
 }
 async act(owner:string,input:z.infer<typeof DesktopUiActParams>):Promise<{acted:true}>{
  this.guard(owner,input.leaseId);const proof=this.proofs.get(input.leaseId);this.invalidate(input.leaseId);
  const element=proof?.elements.get(input.elementId);
  if(!proof||proof.owner!==owner||proof.id!==input.observationId||performance.now()-proof.at>60000||!element||element.password||!element.enabled||!element.actions.includes(input.action))throw new RpcError("unauthorized","UI情報が無効・更新済みです。もう一度取得してください");
  const result=await this.execute(owner,input.leaseId,{mode:"act",windowId:proof.tree.window.id,processId:proof.tree.window.processId,started:proof.tree.started,rootRuntime:proof.tree.rootRuntime,runtime:element.runtime,signature:element.signature,action:input.action,...(input.value===undefined?{}:{value:input.value})});
  if(!z.object({acted:z.literal(true)}).strict().safeParse(result).success)throw new RpcError("server_busy","UI操作を完了できませんでした。状態を確認してください。自動再試行は行いません。");
  return {acted:true};
 }
}
