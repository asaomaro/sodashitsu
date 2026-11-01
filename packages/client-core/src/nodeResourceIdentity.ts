/** Node-only host/namespace identity for joining process metrics. No raw machine ID leaves the host. */
import { createHash } from "node:crypto";
import { readFile,readlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hostname } from "node:os";
let cached:Promise<string|null>|undefined;
export function resourceHostIdentity():Promise<string|null> {
 return cached??=(async()=>{
  try{
   let value:string;
   if(process.platform==="linux"){
    const [boot,namespace]=await Promise.all([readFile("/proc/sys/kernel/random/boot_id","utf8"),readlink("/proc/self/ns/pid")]);
    value=boot.trim()+":"+namespace;
   }else if(process.platform==="darwin"){
    value=hostname()+":"+(await promisify(execFile)("sysctl",["-n","kern.boottime"],{timeout:3000,maxBuffer:8192})).stdout.trim();
   }else if(process.platform==="win32"){
    const out=(await promisify(execFile)("reg.exe",["query","HKLM\\SOFTWARE\\Microsoft\\Cryptography","/v","MachineGuid"],{timeout:3000,maxBuffer:8192,windowsHide:true})).stdout;
    const guid=/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i.exec(out)?.[1]?.trim();if(!guid)return null;value=guid;
   }else return null;
   return createHash("sha256").update(process.platform+":"+value).digest("hex");
  }catch{return null;}
 })();
}
/** Exact kernel identity where exposed; unknown identities are never joined by PID alone. */
export async function resourceProcessIdentities(pids:readonly number[]):Promise<Map<number,string>> {
 const result=new Map<number,string>();
 if(process.platform==="linux")await Promise.all(pids.map(async pid=>{
  try{const stat=await readFile(`/proc/${pid}/stat`,"utf8"),fields=stat.slice(stat.lastIndexOf(")")+2).trim().split(/\s+/);if(fields[19])result.set(pid,`linux:${fields[19]}`);}catch{}
 }));
 else if(process.platform==="darwin"&&pids.length){
  try{
   const {stdout}=await promisify(execFile)("ps",["-p",pids.join(","),"-o","pid=,lstart="],{timeout:3000,maxBuffer:16384});
   for(const line of stdout.trim().split("\n")){const m=/^\s*(\d+)\s+(.+)$/.exec(line);if(m)result.set(Number(m[1]),`darwin:${m[2]!.trim().replace(/\s+/g," ")}`);}
  }catch{}
 }
 return result;
}
