import {platform,release} from "node:os";
import {desktopOwnedChild} from "@sodashitsu/client-core/desktop/DesktopOwnedChild.node";
export interface WslHostMemory {hostMemoryTotalBytes:number;hostMemoryAvailableBytes:number;hostMemorySampledAt:number}
/** Kernel identity, not a project-supplied executable or WSL_DISTRO_NAME alone. */
export function isWslHost(os:NodeJS.Platform=platform(),kernel=release()):boolean{return os==="linux"&&/microsoft/i.test(kernel);}
const POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const SCRIPT="$ErrorActionPreference='Stop'; Get-CimInstance -ClassName Win32_OperatingSystem -OperationTimeoutSec 2 | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json -Compress";
export function parseHostMemory(raw:string):Omit<WslHostMemory,"hostMemorySampledAt">|undefined {
 try{
  const row:unknown=JSON.parse(raw.replace(/^\uFEFF/,""));if(!row||typeof row!=="object"||Array.isArray(row))return;
  const value=row as Record<string,unknown>,total=value.TotalVisibleMemorySize,available=value.FreePhysicalMemory;
  // CIM's uint64 values are KiB. Never accept coercion, negative values or unsafe byte counts.
  if(typeof total!=="number"||typeof available!=="number"||!Number.isSafeInteger(total)||!Number.isSafeInteger(available)||total<=0||available<0||available>total||!Number.isSafeInteger(total*1024))return;
  return {hostMemoryTotalBytes:total*1024,hostMemoryAvailableBytes:available*1024};
 }catch{return;}
}
export async function readWslHostMemory(run=desktopOwnedChild):Promise<Omit<WslHostMemory,"hostMemorySampledAt">|undefined>{
 try{
  const raw=await run(POWERSHELL,["-NoLogo","-NoProfile","-NonInteractive","-WindowStyle","Hidden","-EncodedCommand",Buffer.from(SCRIPT,"utf16le").toString("base64")],"",{timeout:3000,limit:4096});
  return parseHostMemory(raw);
 }catch{return;}
}
/** One pending owned child; no polling timer or native-Windows/non-WSL probe. */
export class WslHostMemoryCache {
 private value:WslHostMemory|undefined;
 private expires=0;
 private pending:Promise<void>|undefined;
 constructor(private readonly detect=readWslHostMemory,private readonly now=Date.now,private readonly eligible=isWslHost()){}
 get():WslHostMemory|undefined {
  if(!this.eligible)return;
  if(!this.pending&&this.now()>=this.expires){
   this.pending=Promise.resolve().then(()=>this.detect()).then(value=>{
    const at=this.now();this.value=value?{...value,hostMemorySampledAt:at}:undefined;this.expires=at+(value?10000:30000);
   },()=>{this.value=undefined;this.expires=this.now()+30000;}).finally(()=>{this.pending=undefined;});
  }
  return this.value;
 }
}
