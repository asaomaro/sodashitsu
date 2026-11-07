import type{OpenedFile}from'../agent/safeFile.js';
import{readRange}from'../agent/safeFile.js';
import type{UsageAdapter,UsageSourceInfo}from'./UsageService.js';
import{grokSessionUsage}from'./grokUsage.js';

export interface GrokUsageDeps{
 /** Fixed usage.json leaf, opened by the shared exact-parent Grok session locator. */
 openUsage(sessionId:string):Promise<OpenedFile|null>;
 /** Undefined until current kind/instance/session has fresh verified attribution. */
 currentProof(source:UsageSourceInfo):string|undefined;
}
const MAX_BYTES=2*1024*1024;
const same=(a:OpenedFile['st'],b:OpenedFile['st'])=>b.isFile()&&b.nlink===1&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
/** Bounded ledger snapshot, not a historic turn fold. All ownership and file revisions must still match. */
export class GrokUsageAdapter implements UsageAdapter{
 readonly kind='grok';
 private closed=false;
 private scopes=new Map<string,{proof:string;busy:boolean}>();
 constructor(private readonly deps:GrokUsageDeps){}
 forget(paneId:string){this.scopes.delete(paneId);}
 close(){this.closed=true;this.scopes.clear();}
 async usageFor(source:UsageSourceInfo){
  if(this.closed)return null;
  let proof:string|undefined;
  try{proof=this.deps.currentProof(source);}catch{return null;}
  if(!proof)return null;
  let scope=this.scopes.get(source.paneId);
  if(!scope||scope.proof!==proof){scope={proof,busy:false};this.scopes.set(source.paneId,scope);}
  if(scope.busy)return null;
  scope.busy=true;
  let opened:OpenedFile|null=null,after:OpenedFile|null=null;
  const current=()=>!this.closed&&this.scopes.get(source.paneId)===scope&&this.deps.currentProof(source)===proof;
  try{
   opened=await this.deps.openUsage(source.sessionId);
   if(!opened||!current()||opened.st.size<1||opened.st.size>MAX_BYTES)return null;
   const bytes=await readRange(opened.fd,0,opened.st.size+1);
   if(bytes.length!==opened.st.size||!same(opened.st,await opened.fd.stat())||!current())return null;
   // The locator rechecks all parent components, not just the still-open descriptor.
   after=await this.deps.openUsage(source.sessionId);
   if(!after||!same(opened.st,after.st)||!current())return null;
   const value=grokSessionUsage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),source.sessionId);
   return current()?value:null;
  }catch{return null;}
  finally{scope.busy=false;await after?.fd.close().catch(()=>{});await opened?.fd.close().catch(()=>{});}
 }
}
