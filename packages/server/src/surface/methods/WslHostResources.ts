import {platform,release} from "node:os";
import {desktopOwnedChild} from "@sodashitsu/client-core/desktop/DesktopOwnedChild.node";
export interface WslHostResources {hostMemoryTotalBytes?:number;hostMemoryAvailableBytes?:number;hostCpuPercent?:number;hostMetricsSampledAt?:number}
/** Kernel identity, not a project-supplied executable or WSL_DISTRO_NAME alone. */
export function isWslHost(os:NodeJS.Platform=platform(),kernel=release()):boolean{return os==="linux"&&/microsoft/i.test(kernel);}
const POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const SCRIPT="$ErrorActionPreference='Stop'; $memory=$null; $cpu=@(); try { $memory=Get-CimInstance -ClassName Win32_OperatingSystem -Property TotalVisibleMemorySize,FreePhysicalMemory -OperationTimeoutSec 2 } catch {}; try { $cpu=@(Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Processor -Property Name,PercentProcessorTime -Filter \"Name='_Total'\" -OperationTimeoutSec 2) } catch {}; $value=[ordered]@{}; if($null -ne $memory){$value.TotalVisibleMemorySize=$memory.TotalVisibleMemorySize; $value.FreePhysicalMemory=$memory.FreePhysicalMemory}; if($cpu.Count -eq 1 -and $cpu[0].Name -eq '_Total'){$value.ProcessorName=$cpu[0].Name; $value.PercentProcessorTime=$cpu[0].PercentProcessorTime}; $value | ConvertTo-Json -Compress";
export function parseHostResources(raw:string):Omit<WslHostResources,"hostMetricsSampledAt">|undefined {
 try{
  const row:unknown=JSON.parse(raw.replace(/^\uFEFF/,""));if(!row||typeof row!=="object"||Array.isArray(row))return;
  const value=row as Record<string,unknown>,total=value.TotalVisibleMemorySize,available=value.FreePhysicalMemory;
  // CIM's uint64 values are KiB. Never accept coercion, negative values or unsafe byte counts.
  const result:Omit<WslHostResources,"hostMetricsSampledAt">={};
  if(typeof total==="number"&&typeof available==="number"&&Number.isSafeInteger(total)&&Number.isSafeInteger(available)&&total>0&&available>=0&&available<=total&&Number.isSafeInteger(total*1024)){result.hostMemoryTotalBytes=total*1024;result.hostMemoryAvailableBytes=available*1024;}
  const cpu=value.PercentProcessorTime;
  if(value.ProcessorName==="_Total"&&typeof cpu==="number"&&Number.isFinite(cpu)&&cpu>=0&&cpu<=100)result.hostCpuPercent=cpu;
  return Object.keys(result).length?result:undefined;
 }catch{return;}
}
export async function readWslHostResources(run=desktopOwnedChild):Promise<Omit<WslHostResources,"hostMetricsSampledAt">|undefined>{
 try{
  const raw=await run(POWERSHELL,["-NoLogo","-NoProfile","-NonInteractive","-WindowStyle","Hidden","-EncodedCommand",Buffer.from(SCRIPT,"utf16le").toString("base64")],"",{timeout:6000,limit:4096});
  return parseHostResources(raw);
 }catch{return;}
}
/** One pending owned child; no polling timer or native-Windows/non-WSL probe. */
export class WslHostResourcesCache {
 private value:WslHostResources|undefined;
 private expires=0;
 private pending:Promise<void>|undefined;
 constructor(private readonly detect=readWslHostResources,private readonly now=Date.now,private readonly eligible=isWslHost()){}
 get():WslHostResources|undefined {
  if(!this.eligible)return;
  if(!this.pending&&this.now()>=this.expires){
   this.pending=Promise.resolve().then(()=>this.detect()).then(value=>{
    const at=this.now();this.value=value?{...value,hostMetricsSampledAt:at}:undefined;this.expires=at+(value?10000:30000);
   },()=>{this.value=undefined;this.expires=this.now()+30000;}).finally(()=>{this.pending=undefined;});
  }
  return this.value;
 }
}
