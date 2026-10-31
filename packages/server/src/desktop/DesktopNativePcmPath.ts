import {lstat,mkdtemp,rmdir,unlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {BigIntStats} from "node:fs";

/** The real OS child, never a shared viewer subscription's synthetic close. */
export interface NativePcmOwner {closed:Promise<void>;exited():boolean;}
export interface NativePcmCapability {paths:DesktopNativePcmPaths;owner:NativePcmOwner;}
type Identity={dev:bigint;ino:bigint};
const same=(value:BigIntStats,witness:Identity)=>value.dev===witness.dev&&value.ino===witness.ino;
const absent=(error:unknown)=>(error as NodeJS.ErrnoException).code==="ENOENT";

/** Darwin TMPDIR often exceeds sun_path once a private child is added. */
export function desktopNativePcmRoot(platform:NodeJS.Platform=process.platform,temporary=tmpdir()):string{return platform==="darwin"?"/private/tmp":temporary;}

/** Bounded private paths. No recursive removal, preexisting unlink or download. */
export class DesktopNativePcmPaths {
 private leases=new Set<DesktopNativePcmPath>();
 constructor(private options:{root?:string;maximum?:number;retryMs?:number;retireMs?:number}={}){}
 get pending(){return this.leases.size;}
 async create(owner:NativePcmOwner,name:string):Promise<DesktopNativePcmPath>{
  if(typeof process.getuid!=="function"||owner.exited()||!/^SodaDesktop(?:Audio|Microphone)-[a-f0-9]{32}$/.test(name)||this.leases.size>=(this.options.maximum??8))throw Error("Native PCM unavailable");
  const lease=new DesktopNativePcmPath(owner,name,this.options,()=>this.leases.delete(lease));this.leases.add(lease);
  try{await lease.create();return lease;}catch(error){await lease.retire();throw error;}
 }
}

export class DesktopNativePcmPath {
 private directory:string|undefined;private identity:Identity|undefined;private socket:Identity|undefined;
 private closed=false;private retiring=false;private released=false;private created=false;private initializing=true;private abandoned=false;
 private timer:ReturnType<typeof setTimeout>|undefined;private cleanup:Promise<void>|undefined;private until=0;
 constructor(private owner:NativePcmOwner,readonly pipeName:string,private options:{root?:string;retryMs?:number;retireMs?:number},private release:()=>void){
  void owner.closed.then(()=>{this.closed=true;this.retiring=true;void this.clean();}).catch(()=>{});
 }
 get path(){if(!this.directory||!this.created)throw Error("Native PCM unavailable");return join(this.directory,"pcm.sock");}
 async create(){
  try{
   if(this.owner.exited()||this.closed)throw Error("Native PCM unavailable");
   this.directory=await mkdtemp(join(this.options.root??desktopNativePcmRoot(),"soda-native-pcm-"));
   const value=await lstat(this.directory,{bigint:true});
   if(!value.isDirectory()||value.isSymbolicLink()||value.uid!==BigInt(process.getuid!())||(value.mode&0o777n)!==0o700n)throw Error("Native PCM unavailable");
   this.identity={dev:value.dev,ino:value.ino};this.created=true;
   if(Buffer.byteLength(this.path,"utf8")>100)throw Error("Native PCM unavailable");
   if(this.closed||this.owner.exited()||this.retiring)throw Error("Native PCM unavailable");
  }catch(error){this.abandoned=true;this.retiring=true;throw error;}
  finally{this.initializing=false;if(this.closed||this.retiring)await this.clean();}
 }
 /** Called on the connected socket, while its incoming PCM is still paused. */
 async verify(){
  try{
   const path=this.path;if(this.retiring||this.closed||this.owner.exited())throw Error();
   const parent=await lstat(this.directory!,{bigint:true});
   const owned=(value:BigIntStats)=>!!this.identity&&same(value,this.identity)&&value.isDirectory()&&!value.isSymbolicLink()&&(value.mode&0o777n)===0o700n&&value.uid===BigInt(process.getuid!());
   if(!owned(parent))throw Error();
   const value=await lstat(path,{bigint:true});
   if(!value.isSocket()||value.isSymbolicLink()||(value.mode&0o777n)!==0o600n||value.uid!==BigInt(process.getuid!())||this.socket&&!same(value,this.socket))throw Error();
   if(!owned(await lstat(this.directory!,{bigint:true}))||this.retiring||this.closed||this.owner.exited())throw Error();
   this.socket={dev:value.dev,ino:value.ino};
  }catch{throw Error("Native PCM unavailable");}
 }
 async retire(){
  this.retiring=true;if(!this.until)this.until=Date.now()+(this.options.retireMs??5000);await this.clean();
 }
 private finish(){
  if(this.released)return;this.released=true;clearTimeout(this.timer);this.timer=undefined;this.release();
 }
 private clean():Promise<void>{
  if(this.cleanup)return this.cleanup;
  this.cleanup=this.perform().finally(()=>{this.cleanup=undefined;if(this.closed&&!this.released&&!this.initializing)void this.clean();});return this.cleanup;
 }
 private async perform(){
  if(this.released||this.initializing)return;
  const closedAtStart=this.closed;
  if(!this.directory){this.finish();return;}
  try{
   const parent=await lstat(this.directory,{bigint:true});
   if(!this.identity||!same(parent,this.identity)||!parent.isDirectory()||parent.isSymbolicLink()){
    // Source exit proves its process is gone, but never authorizes another path.
    if(this.closed||this.abandoned)this.finish();return;
   }
   const stillOwned=async()=>{
    const value=await lstat(this.directory!,{bigint:true});
    return !!this.identity&&same(value,this.identity)&&value.isDirectory()&&!value.isSymbolicLink()&&(value.mode&0o777n)===0o700n&&value.uid===BigInt(process.getuid!());
   };
   if(this.closed&&this.socket){
    const path=join(this.directory,"pcm.sock");
    try{const value=await lstat(path,{bigint:true});if(same(value,this.socket)&&value.isSocket()){if(!await stillOwned()){this.finish();return;}await unlink(path);}}catch(error){if(!absent(error))throw error;}
   }
   if(!await stillOwned()){if(this.closed||this.abandoned)this.finish();return;}
   try{await rmdir(this.directory);this.finish();return;}catch(error){if(absent(error)){this.finish();return;}if((error as NodeJS.ErrnoException).code!=="ENOTEMPTY")throw error;}
  }catch(error){if(absent(error)){this.finish();return;}}
  if(this.closed&&!closedAtStart)return;
  if(this.closed||this.abandoned){this.finish();return;}
  if(this.retiring&&Date.now()<this.until&&!this.timer){this.timer=setTimeout(()=>{this.timer=undefined;void this.clean();},this.options.retryMs??50);this.timer.unref();}
 }
}
