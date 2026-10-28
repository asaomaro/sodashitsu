import {open,type FileHandle} from "node:fs/promises";
import {win32} from "node:path";
import {DesktopSigninContextProcess,type DesktopSigninContext} from "./DesktopSigninPresenceProcess.js";
const failure=()=>new Error("Signin local context is unavailable");
type Probe=Pick<DesktopSigninContextProcess,"ready"|"close"|"settled">;
type File=Pick<FileHandle,"stat"|"read"|"close">;
export interface DesktopSigninLocalLeaseDependencies {
 now():number;unsafeStop():void;
 context(options:ConstructorParameters<typeof DesktopSigninContextProcess>[0]):Probe;
 open(path:string):Promise<File>;
}
const defaults:DesktopSigninLocalLeaseDependencies={now:()=>performance.now(),unsafeStop:()=>process.exit(1),context:options=>new DesktopSigninContextProcess(options),open:path=>open(path,"r")};
/** Owns only a local quiescence handle, never signed-out/presence authority.
 * Native host must keep its independently verified immutable barrier lease. */
export async function desktopSigninLocalLease(ownerSid:string,signal:AbortSignal,deps=defaults):Promise<{context:DesktopSigninContext;current():boolean;close():void;settled():Promise<void>}>{
 let ended=false,probe:Probe|undefined,file:File|undefined,closing:Promise<void>|undefined;const pending=new Set<Promise<unknown>>();
 const current=()=>!ended&&!signal.aborted;
 const closeFile=()=>{if(file&&!closing){closing=Promise.resolve().then(()=>file!.close());void closing.catch(()=>{});}return closing;};
 const stop=()=>{ended=true;probe?.close();closeFile();};signal.addEventListener("abort",stop,{once:true});
 const settled=async()=>{stop();let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([(async()=>{await Promise.allSettled([...pending]);await closeFile();if(probe)await probe.settled();})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(failure()),8000);timer.unref();})]);}catch{try{deps.unsafeStop();}catch{}throw failure();}finally{clearTimeout(timer);signal.removeEventListener("abort",stop);}};
 try{
  if(!current())throw failure();probe=deps.context({ownerSid,signal,active:current,closed:()=>{}});if(!current()){probe.close();throw failure();}
  const context=await probe.ready();await probe.settled();if(!current())throw failure();
  const deadline=deps.now()+5000;
  const read=async<T>(operation:()=>Promise<T>):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;
   const task=Promise.resolve().then(()=>{if(!current()||deps.now()>=deadline)throw failure();return operation();});pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));
   try{const result=await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{stop();reject(failure());},Math.max(1,deadline-deps.now()));timer.unref();})]);if(!current()||deps.now()>=deadline)throw failure();return result;}finally{clearTimeout(timer);}
  };
  await read(async()=>{file=await deps.open(win32.join(context.stateDir,"..","quiescence.lock"));if(!current()){await closeFile();throw failure();}});
  const before=await read(()=>file!.stat());if(!before.isFile()||before.size!==1||before.nlink!==1)throw failure();
  const marker=Buffer.alloc(2);try{const result=await read(()=>file!.read(marker,0,2,0));if(result.bytesRead!==1||marker[0]!==83)throw failure();}finally{marker.fill(0);}
  const after=await read(()=>file!.stat());if(!after.isFile()||after.size!==1||after.nlink!==1||before.dev!==after.dev||before.ino!==after.ino||!current())throw failure();
  return {context,current,close:stop,settled};
 }catch{stop();await settled();throw failure();}
}
