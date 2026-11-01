import {spawn,execFile,type ChildProcess} from "node:child_process";
import {createServer,createConnection,type Server,type Socket} from "node:net";
import {createInterface} from "node:readline";
import {readFile,writeFile,lstat,mkdir,chmod,unlink} from "node:fs/promises";
import {createHash,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {fileURLToPath} from "node:url";
import {join,resolve} from "node:path";
import {promisify} from "node:util";
import {VoiceCoreCallParams,type VoiceCoreCall,type VoiceCoreResult} from "@sodashitsu/protocol";
import type {VoiceConfig} from "./VoiceHost.js";
import {pythonLaunch} from './pythonLaunch.js';
export type VoiceProfile={python:string;runtimeDir:string;pythonPath?:string|undefined;threads:number;accelerationMode:"CPU"|"GPU"|"AUTO";version?:string|undefined};
const script=fileURLToPath(new URL("../../assets/voice-core/resident.py",import.meta.url));
export function voiceSocketPath(directory:string){
 return process.platform==="win32"?`\\\\.\\pipe\\soda-voice-${createHash('sha256').update(resolve(directory).toLowerCase()).digest('hex').slice(0,32)}`:join(directory,"voice-core.sock");
}
async function secret(directory:string){
 await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,"voice-core-ipc.key");
 try{await writeFile(path,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==64||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('音声IPCの鍵を確認してください');
 const key=await readFile(path,'utf8');if(!/^[a-f0-9]{64}$/.test(key))throw Error('音声IPCの鍵が不正です');return key;
}
export async function voiceVersions(config:VoiceConfig,signal?:AbortSignal){
 const profiles:VoiceProfile[]=[config,...config.additionalCores];
 if(process.platform==='linux'&&profiles.some(p=>/\.exe$/i.test(p.python))&&profiles.some(p=>!/\.exe$/i.test(p.python)))throw Error('WindowsとLinuxのCOREは同じ保存先のロックを共有できません。追加COREも同じOSのPythonにしてください');
 const values=await Promise.all(profiles.map(async(profile,index)=>{
  const launch=pythonLaunch(profile);
  const {stdout}=await promisify(execFile)(profile.python,launch.code('import importlib.metadata; print(importlib.metadata.version("voicevox-core"))'),{env:launch.env,...(signal?{signal}:{}),windowsHide:true,timeout:10000,maxBuffer:1024});
  const version=stdout.trim();if(!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?$/.test(version)||profile.version&&profile.version!==version)throw Error('登録したCOREとPythonパッケージのバージョンが一致しません');
  return {version,profile,isDefault:index===0};
 }));
 if(new Set(values.map(v=>v.version)).size!==values.length)throw Error('同じCOREバージョンが重複しています');return values;
}
export interface VoiceCoreProcess {gpu:boolean|null;call(request:VoiceCoreCall):Promise<VoiceCoreResult>;cancel(id:string):boolean;pid():number|null;isStopped():boolean;close():Promise<void>}
class CoreProcess implements VoiceCoreProcess {
 private child:ChildProcess;
 private pending=new Map<string,{resolve:(v:VoiceCoreResult)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private ready:Promise<void>;private stopped=false;private closing:Promise<void>|undefined;
 gpu:boolean|null=null;
 constructor(profile:VoiceProfile,dataDir:string,readonly version:string){
  const launch=pythonLaunch(profile);
  const child=this.child=spawn(profile.python,launch.script(script),{env:launch.env,windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr?.resume();
  this.ready=new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>{reject(Error('COREの初期化が時間切れです'));void this.close();},60000);timer.unref();
   const lines=createInterface({input:child.stdout!});
   lines.on('line',line=>{
    try{
     const packet=JSON.parse(line);
     if('ready' in packet){clearTimeout(timer);if(packet.ready&&packet.version===version){this.gpu=!!packet.gpu;resolve();}else{reject(Error(packet.error||'COREの初期化に失敗しました'));void this.close();}return;}
     const waiting=this.pending.get(packet.id);if(!waiting)return;this.pending.delete(packet.id);clearTimeout(waiting.timer);
     if(packet.ok)waiting.resolve(packet.result);else waiting.reject(Error(packet.error||'COREの処理に失敗しました'));
    }catch{reject(Error('COREの応答を確認できません'));void this.close();}
   });
   const failed=()=>{clearTimeout(timer);reject(Error('COREプロセスが終了しました。GPUとランタイムの設定を確認してください'));for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('COREプロセスが終了しました'));}this.pending.clear();this.stopped=true;lines.close();};
   child.once('error',failed);child.once('close',failed);
  });
  child.stdin?.on('error',()=>{});
  child.stdin!.write(JSON.stringify({...profile,runtimeDir:launch.path(profile.runtimeDir),version,dataDir:launch.path(dataDir)})+'\n');
 }
 call(request:VoiceCoreCall){
  if(this.stopped)return Promise.reject(Error('COREプロセスは停止しています'));
  return new Promise<VoiceCoreResult>((resolve,reject)=>{
   const id=request.requestId??randomUUID();if(this.pending.has(id)){reject(Error('音声要求IDが重複しています'));return;}
   const timer=setTimeout(()=>{this.cancel(id);reject(Error('COREの処理が時間切れです'));},360000);timer.unref();
   this.pending.set(id,{resolve,reject,timer});
   void this.ready.then(()=>{if(this.pending.has(id))this.child.stdin!.write(JSON.stringify({id,request})+'\n');}).catch(error=>{const pending=this.pending.get(id);if(pending){this.pending.delete(id);clearTimeout(pending.timer);pending.reject(error);}});
  });
 }
 cancel(id:string){
  const pending=this.pending.get(id);if(!pending)return false;
  this.pending.delete(id);clearTimeout(pending.timer);pending.reject(Error('音声要求を停止しました'));
  this.child.stdin?.write(JSON.stringify({cancel:id})+'\n');return true;
 }
 pid(){return this.stopped?null:this.child.pid??null;}
 isStopped(){return this.stopped;}
 close():Promise<void>{
  if(this.closing)return this.closing;if(this.stopped)return Promise.resolve();
  this.stopped=true;
  return this.closing=new Promise(resolve=>{
   const timer=setTimeout(()=>this.child.kill(),3000);timer.unref();this.child.once('close',()=>{clearTimeout(timer);resolve();});
   // EOF terminates the supervisor's inference child even while native CORE holds the GIL.
   this.child.stdin?.end();
  });
 }
}
export async function requestVoiceResident(directory:string,request:VoiceCoreCall|{operation:'__ping'}):Promise<VoiceCoreResult>{
 const key=await secret(directory),endpoint=voiceSocketPath(directory),id=randomUUID();
 return new Promise((resolve,reject)=>{
  const socket=createConnection(endpoint).setEncoding("utf8"),timer=setTimeout(()=>{socket.destroy();reject(Error('常駐COREの応答が時間切れです'));},request.operation==='__ping'?2000:370000);timer.unref();
  let text='';const fail=(e:Error)=>{clearTimeout(timer);reject(e);};socket.on('error',fail);
  socket.on('connect',()=>socket.write(JSON.stringify({key,id,request})+'\n'));
  socket.on('data',chunk=>{text+=chunk;const end=text.indexOf('\n');if(end<0)return;
   clearTimeout(timer);socket.end();try{const packet=JSON.parse(text.slice(0,end));if(packet.id!==id||!packet.ok)throw Error(packet.error||'常駐COREの応答が不正です');resolve(packet.result);}catch(error){reject(error);}
  });
  socket.on('close',()=>{clearTimeout(timer);if(!text.includes('\n'))reject(Error('常駐COREへ接続できません。soda voice serveで起動してください'));});
 });
}
export class VoiceResidentService {
 private server:Server|undefined;private cores=new Map<string,VoiceCoreProcess>();private peers=new Set<Socket>();private closed=false;
 private versions:Awaited<ReturnType<typeof voiceVersions>>=[];
 private startup=new AbortController();
 private starting:Promise<void>|undefined;
 private closing:Promise<void>|undefined;
 constructor(private readonly directory:string,private readonly config:VoiceConfig,private readonly dependencies:{versions?:typeof voiceVersions;core?:(profile:VoiceProfile,dataDir:string,version:string)=>VoiceCoreProcess}={}){}
 start(){return this.starting??=(this.startImpl());}
 private async startImpl(){
  if(process.platform==='linux'&&/\.exe$/i.test(this.config.python)&&!/^\w:[\\/]/.test(pythonLaunch(this.config).path(this.config.dataDir??join(this.directory,'voice-core-data'))))throw Error('Windows COREの保存先にはWindowsローカルのフォルダが必要です。--data-dir /mnt/c/... を指定してください');
  this.versions=await (this.dependencies.versions??voiceVersions)(this.config,this.startup.signal);const key=await secret(this.directory),endpoint=voiceSocketPath(this.directory);
  const server=createServer(socket=>{
   socket.setEncoding('utf8');
   this.peers.add(socket);socket.on('error',()=>{});socket.once('close',()=>this.peers.delete(socket));let input='';socket.setTimeout(370000,()=>socket.destroy());
   socket.on('data',chunk=>{input+=chunk;if(Buffer.byteLength(input)>16*1024*1024){socket.destroy();return;}const end=input.indexOf('\n');if(end<0)return;socket.removeAllListeners('data');
    void (async()=>{
     let id='';try{
      const packet=JSON.parse(input.slice(0,end));id=packet.id;
      if(typeof packet.key!=='string'||!/^[a-f0-9]{64}$/.test(packet.key)||!timingSafeEqual(Buffer.from(packet.key),Buffer.from(key)))throw Error('音声IPCの認証に失敗しました');
      const result=packet.request?.operation==='__ping'?{kind:'json',value:true}:await this.call(VoiceCoreCallParams.parse(packet.request));
      socket.end(JSON.stringify({id,ok:true,result})+'\n');
     }catch(error){socket.end(JSON.stringify({id,ok:false,error:error instanceof Error?error.message:'COREの処理に失敗しました'})+'\n');}
    })();
   });
  });
  try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.removeListener('error',reject);resolve();});});}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=='EADDRINUSE')throw error;
   // A responding owner is reused. Never unlink a live service's socket.
   try{await requestVoiceResident(this.directory,{operation:'__ping'});return;}catch(probe){if(!["ECONNREFUSED","ENOENT"].includes((probe as NodeJS.ErrnoException).code??""))throw probe;}
   if(process.platform==='win32')throw error;
   const stat=await lstat(endpoint);if(!stat.isSocket()||stat.isSymbolicLink()||typeof process.getuid==='function'&&stat.uid!==process.getuid())throw error;
   await unlink(endpoint);await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.removeListener('error',reject);resolve();});});
  }
  if(this.closed){for(const peer of this.peers)peer.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));return;}this.server=server;if(process.platform!=='win32')await chmod(endpoint,0o600);
 }
 async call(request:VoiceCoreCall):Promise<VoiceCoreResult>{
  await this.starting;
  if(this.closed)throw Error('常駐COREは停止しています');
  if(!this.server)return requestVoiceResident(this.directory,request);
  if(request.operation==='cancel')return {kind:'json',value:[...this.cores.values()].some(core=>core.cancel(String(request.params?.requestId??'')))};
  if(request.operation==='versions')return {kind:'json',value:this.versions.map(v=>({version:v.version,isDefault:v.isDefault,accelerationMode:v.profile.accelerationMode,gpu:this.cores.get(v.version)?.gpu??null,pid:this.cores.get(v.version)?.pid()??null}))};
  const selected=request.coreVersion?this.versions.find(v=>v.version===request.coreVersion):this.versions[0];if(!selected)throw Error('指定したCOREバージョンは登録されていません');
  let worker=this.cores.get(selected.version);if(!worker||worker.isStopped()){const dataDir=this.config.dataDir??join(this.directory,'voice-core-data');worker=this.dependencies.core?this.dependencies.core(selected.profile,dataDir,selected.version):new CoreProcess(selected.profile,dataDir,selected.version);this.cores.set(selected.version,worker);}
  return worker.call(request);
 }
 close():Promise<void>{
  if(this.closing)return this.closing;
  this.closed=true;this.startup.abort();
  return this.closing=(async()=>{
   await this.starting?.catch(()=>{});
   for(const peer of this.peers)peer.destroy();this.peers.clear();
   const closing=this.server?new Promise<void>(resolve=>this.server!.close(()=>resolve())):Promise.resolve();this.server=undefined;
   await Promise.all([closing,...[...this.cores.values()].map(core=>core.close())]);this.cores.clear();
  })();
 }
}
