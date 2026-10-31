import {lstat,mkdir,realpath,readlink,rename,rm,unlink,writeFile} from "node:fs/promises";
import {join,relative,isAbsolute} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import type {BigIntStats} from "node:fs";
import {downloadAssistantRuntime,type RuntimeTransport} from "./AssistantRuntimeDownload.js";
import {extractAssistantRuntimeZip,type RuntimeFile} from "./AssistantRuntimeZip.js";
import {selectAssistantRuntime,validateRuntimeVariant,runtimeEntry,type RuntimeVariant,type RuntimePlatform,type RuntimeArchitecture} from "./AssistantRuntimeCatalog.js";
import {boundedRuntimeJson,runtimeChildren,runtimeTree,runtimeFileDigest,runtimeRelativePath,sameRuntimeFile,RuntimeIntegrityError} from "./AssistantRuntimeFiles.js";
/** Caller capability: native root ownership/ACL and stable ancestor identity, never RPC data. */
export interface AssistantRuntimeRoot{path:string;assert():Promise<void>}
export interface PreparedAssistantRuntime{directory:string;executable:string;relativeDirectory:string;variant:RuntimeVariant;cached:boolean}
interface Options{signal?:AbortSignal;check?:()=>void;expires?:number}
interface Dependencies{now?:()=>number;select?:typeof selectAssistantRuntime;transport?:RuntimeTransport;download?:typeof downloadAssistantRuntime;extract?:typeof extractAssistantRuntimeZip}
interface Ready{version:1;archiveSha256:string;platform:RuntimePlatform;arch:RuntimeArchitecture;entry:string;directories:string[];files:RuntimeFile[]}
interface Job{controller:AbortController;promise:Promise<PreparedAssistantRuntime>;token:symbol}
const COHORT=/^(ready|stage)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const corrupt=(message:string):never=>{throw new RuntimeIntegrityError(message);};
function readyData(raw:unknown,variant:RuntimeVariant):Ready{
 const value=raw as Ready;
 if(!value||value.version!==1||value.archiveSha256!==variant.sha256||value.platform!==variant.platform||value.arch!==variant.arch||value.entry!==variant.entry||!Array.isArray(value.files)||!value.files.length||value.files.length>10000||!Array.isArray(value.directories)||value.directories.length>20000)corrupt("Invalid cached runtime inventory");
 const names=new Set<string>();let total=0;
 for(const path of value.directories){if(!runtimeRelativePath(path)||names.has(path.toLowerCase()))corrupt("Invalid cached runtime directory");names.add(path.toLowerCase());}
 for(const file of value.files){
  if(!file||!runtimeRelativePath(file.path)||names.has(file.path.toLowerCase())||!["file","symlink"].includes(file.kind)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>512*1024*1024||(total+=file.bytes)>1024*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256)||typeof file.executable!=="boolean")corrupt("Invalid cached runtime file");names.add(file.path.toLowerCase());
  if(file.kind==="symlink"&&(variant.platform!=="darwin"||typeof file.target!=="string"||!file.target||Buffer.byteLength(file.target)>4096||/[\\:\x00-\x1f\x7f]/.test(file.target)||isAbsolute(file.target)))corrupt("Invalid cached runtime link");
 }
 const entry=value.files.find(file=>file.path===runtimeEntry(variant.platform));if(!entry||entry.kind!=="file"||!entry.executable)corrupt("Cached runtime entry is missing");return value;
}
/** An explicit prepare is the only operation that resolves roots, reads files or opens a connection. */
export class AssistantRuntimeCache{
 private active:Job|null=null;private closed=false;private generation=0;private cleanupFailure:unknown;
 constructor(private readonly root:(signal:AbortSignal,expires:number)=>Promise<AssistantRuntimeRoot>,private readonly deps:Dependencies={}){}
 prepare(platform:RuntimePlatform,arch:RuntimeArchitecture,options:Options={}):Promise<PreparedAssistantRuntime>{
  if(this.closed||this.active||this.cleanupFailure)return Promise.reject(Error("Runtime preparation is stopped or still retiring"));
  let resolve!:(value:PreparedAssistantRuntime)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<PreparedAssistantRuntime>((yes,no)=>{resolve=yes;reject=no;}),job:Job={promise,controller:new AbortController(),token:Symbol()},generation=this.generation;
  this.active=job;
  const abort=()=>job.controller.abort(options.signal?.reason??Error("Runtime preparation cancelled"));
  if(options.signal?.aborted)abort();else options.signal?.addEventListener("abort",abort,{once:true});
  let expires:number;
  try{const started=this.deps.now?.()??performance.now();expires=options.expires??started+240000;if(!Number.isFinite(expires)||expires<=started||expires-started>300000)throw Error("Invalid runtime preparation deadline");}catch(error){options.signal?.removeEventListener("abort",abort);this.active=null;reject(error);return promise;}
  void Promise.resolve().then(()=>this.run(job,generation,platform,arch,expires,options.check)).finally(()=>{options.signal?.removeEventListener("abort",abort);if(this.active===job)this.active=null;}).then(resolve,reject);
  return promise;
 }
 cancel():void{this.active?.controller.abort(Error("Runtime preparation cancelled"));}
 async dispose():Promise<void>{this.closed=true;++this.generation;const active=this.active;active?.controller.abort(Error("Runtime preparation stopped"));await active?.promise.catch(()=>{});if(this.cleanupFailure)throw this.cleanupFailure;}
 private async run(job:Job,generation:number,platform:RuntimePlatform,arch:RuntimeArchitecture,expires:number,check?:()=>void):Promise<PreparedAssistantRuntime>{
  const signal=job.controller.signal,clock=this.deps.now??(()=>performance.now());
  const live=()=>{
   signal.throwIfAborted();if(this.closed||generation!==this.generation||this.active!==job){job.controller.abort(Error("Runtime owner changed"));signal.throwIfAborted();}
   try{check?.();}catch(error){job.controller.abort(error);throw error;}
   if(!Number.isFinite(expires)||clock()>=expires){job.controller.abort(Error("Runtime preparation deadline"));signal.throwIfAborted();}signal.throwIfAborted();
  };
  live();const selected=await(this.deps.select??selectAssistantRuntime)(platform,arch,live);live();const variant=Object.freeze({...selected});validateRuntimeVariant(variant);
  const root=await this.root(signal,expires);live();if(!root||!isAbsolute(root.path)||typeof root.assert!=="function")throw Error("Runtime root authorization is required");
  const assertAuthority=async()=>{live();try{await root.assert();}catch(error){job.controller.abort(error);throw error;}live();};
  await assertAuthority();const path=await realpath(root.path);live();const rootStamp=await lstat(path,{bigint:true});live();
  if(!rootStamp.isDirectory()||rootStamp.isSymbolicLink())throw Error("Invalid owned runtime root");
  const rootLive=async()=>{await assertAuthority();const current=await lstat(path,{bigint:true});live();if(!sameRuntimeFile(rootStamp,current)||!current.isDirectory()||current.isSymbolicLink())throw Error("Runtime root identity changed");};
  const key=`v${variant.version}-${platform}-${arch}-${variant.sha256.slice(0,16)}`,family=join(path,key);
  await rootLive();await mkdir(family,{mode:0o700}).catch(error=>{if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;});live();
  const familyStamp=await lstat(family,{bigint:true});live();if(!familyStamp.isDirectory()||familyStamp.isSymbolicLink())throw Error("Invalid runtime cache family");
  const familyLive=async()=>{await rootLive();const current=await lstat(family,{bigint:true});live();if(!sameRuntimeFile(familyStamp,current)||!current.isDirectory()||current.isSymbolicLink())throw Error("Runtime cache family changed");};
  const names=await runtimeChildren(family,16,live);live();
  if(names.some(name=>!COHORT.test(name)))throw Error("Unexpected runtime cache entry");
  for(const name of names){if(!name.startsWith("ready-"))continue;await familyLive();const cached=await this.verify(join(family,name),variant,live);live();if(cached){await familyLive();return{...cached,relativeDirectory:key+"/"+name,variant,cached:true};}}
  if(names.length>=8)throw Error("Runtime cache preparation limit exceeded");
  const stageName="stage-"+randomUUID(),stage=join(family,stageName);await familyLive();let stageStamp:BigIntStats|undefined,created=false,published=false;
  const stageLive=async()=>{await familyLive();const current=await lstat(stage,{bigint:true});live();if(!stageStamp||!sameRuntimeFile(stageStamp,current)||!current.isDirectory()||current.isSymbolicLink())throw Error("Owned runtime staging changed");};
  try{
   await mkdir(stage,{mode:0o700});created=true;stageStamp=await lstat(stage,{bigint:true});live();
   if(!stageStamp.isDirectory()||stageStamp.isSymbolicLink())throw Error("Invalid owned runtime staging");
   const archive=join(stage,"archive.zip"),engine=join(stage,"engine");await stageLive();await mkdir(engine,{mode:0o700});live();
   await(this.deps.download??downloadAssistantRuntime)(variant,archive,{signal,expires,now:clock,check:live,...(this.deps.transport?{transport:this.deps.transport}:{})});live();await stageLive();
   const files=await(this.deps.extract??extractAssistantRuntimeZip)(archive,engine,{bytes:variant.bytes,sha256:variant.sha256,platform:variant.platform,signal,check:live});live();await stageLive();
   const tree=await runtimeTree(engine,live),directories:string[]=[];const expected=new Map(files.map(file=>[file.path,file]));
   for(const [name,info]of tree){if(info.isDirectory()&&!info.isSymbolicLink())directories.push(name);else if(!expected.has(name))corrupt("Unexpected extracted runtime file");}
   if(files.length+directories.length!==tree.size)corrupt("Extracted runtime inventory differs");
   const data:Ready={version:1,archiveSha256:variant.sha256,platform,arch,entry:variant.entry,directories:directories.sort(),files};readyData(data,variant);
   const bytes=Buffer.from(JSON.stringify(data)+"\n");if(bytes.length>4*1024*1024)throw Error("Runtime inventory limit exceeded");
   await stageLive();await writeFile(join(stage,"runtime.json"),bytes,{flag:"wx",mode:0o600});live();await stageLive();await unlink(archive);live();
   const verified=await this.verify(stage,variant,live);live();if(!verified)throw Error("Prepared runtime verification failed");
   const name="ready-"+randomUUID(),directory=join(family,name);await stageLive();await rename(stage,directory);published=true;live();await familyLive();const publishedStamp=await lstat(directory,{bigint:true});live();if(!sameRuntimeFile(stageStamp,publishedStamp)||!publishedStamp.isDirectory()||publishedStamp.isSymbolicLink())throw Error("Published runtime identity changed");
   return{directory,executable:join(directory,"engine",...variant.entry.split("/")),relativeDirectory:key+"/"+name,variant,cached:false};
  }finally{
   if(created&&!published){
    try{
     const currentRoot=await lstat(path,{bigint:true}),currentFamily=await lstat(family,{bigint:true}),currentStage=await lstat(stage,{bigint:true});
     if(!stageStamp||!sameRuntimeFile(rootStamp,currentRoot)||!sameRuntimeFile(familyStamp,currentFamily)||!sameRuntimeFile(stageStamp,currentStage)||!currentRoot.isDirectory()||currentRoot.isSymbolicLink()||!currentFamily.isDirectory()||currentFamily.isSymbolicLink()||!currentStage.isDirectory()||currentStage.isSymbolicLink())throw Error("Cannot confirm owned runtime staging cleanup");
     await rm(stage,{recursive:true});
    }catch(error){this.cleanupFailure=error;throw error;}
   }
  }
 }
 private async verify(directory:string,variant:RuntimeVariant,guard:()=>void):Promise<{directory:string;executable:string}|null>{
  try{
   guard();const root=await lstat(directory,{bigint:true});guard();if(!root.isDirectory()||root.isSymbolicLink())corrupt("Invalid ready runtime root");
   const children=await runtimeChildren(directory,3,guard);if(children.length!==2||!children.includes("engine")||!children.includes("runtime.json"))corrupt("Unexpected runtime cohort entry");
   const data=readyData(await boundedRuntimeJson(join(directory,"runtime.json"),4*1024*1024,guard),variant),engine=join(directory,"engine"),engineStat=await lstat(engine,{bigint:true});guard();
   if(!engineStat.isDirectory()||engineStat.isSymbolicLink())corrupt("Invalid runtime engine root");
   const canonical=await realpath(engine);guard();const tree=await runtimeTree(engine,guard),expected=new Set([...data.directories,...data.files.map(file=>file.path)]);
   if(tree.size!==expected.size||[...tree.keys()].some(path=>!expected.has(path)))corrupt("Runtime tree differs from its inventory");
   for(const name of data.directories){const info=tree.get(name);if(!info?.isDirectory()||info.isSymbolicLink())corrupt("Runtime directory changed");}
   for(const file of data.files){
    guard();const info=tree.get(file.path)!;const path=join(engine,...file.path.split("/"));
    if(file.kind==="file"){
     if(!info.isFile()||info.isSymbolicLink()||info.size!==BigInt(file.bytes))corrupt("Runtime file changed");
     if(variant.platform!=="win32"&&process.platform!=="win32"&&((info.mode&0o111n)!==0n)!==file.executable)corrupt("Runtime executable mode changed");
     if(await runtimeFileDigest(path,info,guard)!==file.sha256)corrupt("Runtime file digest differs");
    }else{
     if(!info.isSymbolicLink())corrupt("Runtime link changed");const link=await readlink(path);guard();
     if(link!==file.target||Buffer.byteLength(link)!==file.bytes||createHash("sha256").update(link).digest("hex")!==file.sha256)corrupt("Runtime link differs");
     const referent=await realpath(path);guard();const rel=relative(canonical,referent);if(!rel||rel===".."||rel.startsWith("../")||rel.startsWith("..\\")||isAbsolute(rel))corrupt("Runtime link escapes its cohort");
    }
   }
   guard();const afterRoot=await lstat(directory,{bigint:true}),afterEngine=await lstat(engine,{bigint:true});guard();
   if(!sameRuntimeFile(root,afterRoot)||!sameRuntimeFile(engineStat,afterEngine)||afterRoot.isSymbolicLink()||afterEngine.isSymbolicLink())corrupt("Runtime cohort changed during verification");
   return{directory,executable:join(engine,...variant.entry.split("/"))};
  }catch(error){guard();if(error instanceof RuntimeIntegrityError||["ENOENT","ELOOP","ENOTDIR","EACCES","EPERM","EINVAL"].includes((error as NodeJS.ErrnoException).code??""))return null;throw error;}
 }
}
