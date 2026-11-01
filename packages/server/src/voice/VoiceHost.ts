import {VoiceResidentService} from "./VoiceResident.js";
import type {VoiceCoreCall,VoiceCoreResult} from "@sodashitsu/protocol";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const absolute = z.string().min(1).max(4096).refine(v => isAbsolute(v) && !/[\x00\r\n]/.test(v));
export const VoiceRuntimeConfig=z.object({
 python:absolute,runtimeDir:absolute,pythonPath:absolute.optional(),
 threads:z.number().int().min(1).max(16).default(2),
 accelerationMode:z.enum(["CPU","GPU","AUTO"]).default("CPU"),
});
export const AdditionalVoiceCore=VoiceRuntimeConfig.extend({id:z.uuid(),version:z.string().regex(/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?$/)}).strict();
export const VoiceConfig=VoiceRuntimeConfig.extend({
 dataDir:absolute.optional(),
 enabled:z.boolean(),transport:z.enum(["http","ipc"]).default("http"),port:z.number().int().min(1024).max(65535).default(50022),
 additionalCores:z.array(AdditionalVoiceCore).max(16).default([]),
}).strict().refine(value=>new Set(value.additionalCores.map(c=>c.version)).size===value.additionalCores.length,"duplicate CORE version");
export type VoiceConfig = z.infer<typeof VoiceConfig>;
export async function readVoiceConfig(dir:string):Promise<VoiceConfig|null> {
 try { const data=await readFile(join(dir,"voice-core.json"),"utf8"); if(data.length>131072)throw Error("voice config too large");return VoiceConfig.parse(JSON.parse(data)); }
 catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw e;}
}
export async function writeVoiceConfig(dir:string,value:VoiceConfig):Promise<void> {
 const data=VoiceConfig.parse(value);await mkdir(dir,{recursive:true,mode:0o700});
 const tmp=join(dir,`.voice-core-${randomUUID()}.json`);
 await writeFile(tmp,JSON.stringify(data)+"\n",{mode:0o600,flag:"wx"});await rename(tmp,join(dir,"voice-core.json"));
}
/** One owned worker per soda server. No renderer-supplied executables/arguments. */
export class VoiceHost {
 private child:ChildProcess|null=null;
 private resident:VoiceResidentService|null=null;
 private stopping:Promise<void>|null=null;
 private timer:ReturnType<typeof setInterval>|null=null;
 private busy=false;
 private closed=false;
 private paused=false;
 private signature="";
 private retryAt=0;
 private failures=0;
 constructor(private readonly directory:string,private readonly warn:(message:string)=>void=()=>{},private readonly launch:typeof spawn=spawn){}
 async endpoint():Promise<{enabled:boolean;origin:string|null;transport:"http"|"ipc"}>{
  const config=await readVoiceConfig(this.directory);
  return {enabled:config?.enabled??false,transport:config?.transport??"http",origin:config?.enabled&&config.transport==="http"?`http://127.0.0.1:${config.port}`:null};
 }
 start():void {if(this.timer)return;this.timer=setInterval(()=>void this.sync(),2000);this.timer.unref();void this.sync();}
 private async sync():Promise<void>{
  if(this.busy||this.closed||this.paused)return;this.busy=true;
  try {
   const config=await readVoiceConfig(this.directory);
   const signature=JSON.stringify(config);
   if(this.closed||this.paused)return;
   if(signature!==this.signature){await this.stop();this.signature=signature;this.failures=0;this.retryAt=0;}
   if(this.closed||this.paused||!config?.enabled||this.child||this.resident||Date.now()<this.retryAt)return;
   if(config.transport==="ipc"){
    const service=new VoiceResidentService(this.directory,config);this.resident=service;
    try{await service.start();if(this.closed||this.paused||this.resident!==service)await service.close();}
    catch(error){if(this.resident===service)this.resident=null;await service.close();this.retryAt=Date.now()+10000;throw error;}
    return;
   }
   const child=this.launch(config.python,["-u",fileURLToPath(new URL("../../assets/voice-core/worker.py",import.meta.url)),"--managed","--data-dir",config.dataDir??join(this.directory,"voice-core-data"),"--runtime-dir",config.runtimeDir,"--port",String(config.port),"--threads",String(config.threads),"--acceleration-mode",config.accelerationMode],{
    windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,...(config.pythonPath?{PYTHONPATH:config.pythonPath}:{})},
   });
   this.child=child;
   // Output is consumed without retaining paths, utterances or native diagnostic payloads.
   let ready=false,output="";
   const watchdog=setTimeout(()=>{if(!ready)child.kill();},30_000);watchdog.unref();
   child.stdout?.on("data",chunk=>{output=(output+String(chunk)).slice(-4096);if(output.includes('"ready": true')){ready=true;clearTimeout(watchdog);}});
   child.stderr?.resume();
   child.on("error",()=>{this.warn("VOICEVOX COREを起動できません。Pythonと音声ランタイムの設定を確認してください。");});
   child.on("exit",()=>{clearTimeout(watchdog);if(this.child===child){this.child=null;this.retryAt=Date.now()+Math.min(60_000,2000*2**Math.min(++this.failures,5));this.warn("VOICEVOX COREが停止しました。再試行します。");}});
   // Failed spawn emits close rather than exit.
   child.on("close",()=>{clearTimeout(watchdog);if(this.child===child){this.child=null;this.retryAt=Date.now()+60_000;}});
  }catch{this.warn("VOICEVOX COREの設定を読み込めません。");}
  finally{this.busy=false;}
 }
 async call(request:VoiceCoreCall):Promise<VoiceCoreResult>{
  if(this.closed||this.paused)throw Error("COREは停止しています");
  if(!this.resident)throw Error("HTTPなし常駐COREを有効にしてください（soda voice enable --transport ipc）");
  return this.resident.call(request);
 }
 async cancel(requestId:string){
  if(!this.resident)return false;
  const result=await this.resident.call({operation:"cancel",params:{requestId}});
  return result.kind==="json"&&result.value===true;
 }
 private stop():Promise<void>{
  if(this.stopping)return this.stopping;
  const resident=this.resident;this.resident=null;
  const child=this.child;this.child=null;
  const stopping=Promise.all([
   resident?resident.close():Promise.resolve(),
   child?new Promise<void>(resolve=>{
    const timer=setTimeout(()=>child.kill("SIGKILL"),3000);timer.unref();
    child.once("close",()=>{clearTimeout(timer);resolve();});child.kill();
   }):Promise.resolve(),
  ]).then(()=>{});
  this.stopping=stopping;
  void stopping.then(()=>{if(this.stopping===stopping)this.stopping=null;});
  return stopping;
 }
 async suspend():Promise<void>{this.paused=true;await this.stop();}
 resume():void{this.paused=false;void this.sync();}
 async close():Promise<void>{this.closed=true;if(this.timer)clearInterval(this.timer);this.timer=null;await this.stop();}
}
