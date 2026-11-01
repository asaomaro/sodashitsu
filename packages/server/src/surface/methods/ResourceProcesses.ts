import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ResourceProcess } from "@sodashitsu/protocol";
const exec = promisify(execFile);
export interface ProcessSample {pid:number;ppid:number;name:string;start:string;cpuMs:number;rss:number|null;threads:number|null}
export interface PaneProcess {pid:number;paneId:string;label:string;agent:boolean}
/** /proc comm may itself contain spaces and parentheses. */
export function linuxStat(text:string):ProcessSample {
 const left=text.indexOf("("),right=text.lastIndexOf(")"),f=text.slice(right+2).trim().split(/\s+/);
 if(left<1||right<left||f.length<22)throw Error("Invalid process stat");
 const pid=Number(text.slice(0,left).trim()),ppid=Number(f[1]),ticks=Number(f[11])+Number(f[12]);
 if(!Number.isSafeInteger(pid)||!Number.isFinite(ticks))throw Error("Invalid process stat");
 return {pid,ppid,name:text.slice(left+1,right),start:f[19]!,cpuMs:ticks*10,rss:null,threads:Number(f[17])};
}
async function linuxProcesses():Promise<ProcessSample[]> {
 const names=(await readdir("/proc")).filter(n=>/^\d+$/.test(n)),out:ProcessSample[]=[];
 // Bounded parallel reads avoid descriptor exhaustion as panes start and exit.
 for(let offset=0;offset<names.length;offset+=32)await Promise.all(names.slice(offset,offset+32).map(async id=>{
  try{
   const row=linuxStat(await readFile(`/proc/${id}/stat`,"utf8"));
   try{const status=await readFile(`/proc/${id}/status`,"utf8"),rss=/^VmRSS:\s+(\d+)\s+kB/m.exec(status);row.rss=rss?Number(rss[1])*1024:null;}catch{}
   out.push(row);
  }catch{/* A process may exit between the directory and stat reads. */}
 }));
 return out;
}
function cpuTime(text:string) {
 const [days,clock]=text.includes("-")?text.split("-"):["0",text];
 const parts=clock!.split(":").map(Number);let seconds=0;for(const n of parts)seconds=seconds*60+n;
 return (Number(days)*86400+seconds)*1000;
}
export async function collectProcesses():Promise<ProcessSample[]> {
 if(process.platform==="linux")return linuxProcesses();
 if(process.platform==="win32"){
  const command="Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CreationDate,KernelModeTime,UserModeTime,WorkingSetSize,ThreadCount | ConvertTo-Json -Compress";
  const {stdout}=await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{timeout:5000,maxBuffer:8*1024*1024,windowsHide:true});
  const parsed=JSON.parse(stdout);return (Array.isArray(parsed)?parsed:[parsed]).map(p=>({pid:Number(p.ProcessId),ppid:Number(p.ParentProcessId),name:String(p.Name),start:String(/^\/Date\((\d+)/.exec(String(p.CreationDate))?.[1]??Date.parse(String(p.CreationDate))),cpuMs:(Number(p.KernelModeTime)+Number(p.UserModeTime))/10000,rss:Number(p.WorkingSetSize),threads:Number(p.ThreadCount)}));
 }
 const {stdout}=await exec("ps",["-axo","pid=,ppid=,time=,rss=,lstart=,comm="],{timeout:5000,maxBuffer:8*1024*1024});
 return stdout.trim().split("\n").flatMap(line=>{
  const m=/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/.exec(line);
  return m?[{pid:Number(m[1]),ppid:Number(m[2]),cpuMs:cpuTime(m[3]!),rss:Number(m[4])*1024,start:m[5]!.trim().replace(/\s+/g," "),name:m[6]!.split("/").pop()!,threads:null}]:[];
 });
}
export class ProcessResourceSampler {
 private previous=new Map<number,{start:string;cpuMs:number;at:number}>();
 private cached:{at:number;rows:ResourceProcess[];warning?:string}|undefined;
 private pending:Promise<{at:number;rows:ResourceProcess[];warning?:string}>|undefined;
 constructor(private readonly collect=collectProcesses,private readonly root=process.pid,private readonly now=Date.now){}
 async get(panes:PaneProcess[]) {
  if(this.pending)return this.pending;
  if(this.cached&&this.now()-this.cached.at<2000)return this.cached;
  this.pending=this.sample(panes).finally(()=>{this.pending=undefined;});return this.pending;
 }
 private async sample(panes:PaneProcess[]) {
  const at=this.now();let all:ProcessSample[];
  try{all=await this.collect();}catch{this.previous.clear();return this.cached={at,rows:[],warning:"プロセス情報を取得できません。"};}
  const byPid=new Map(all.map(p=>[p.pid,p])),paneByPid=new Map(panes.map(p=>[p.pid,p]));
  const roots=new Set([this.root,...paneByPid.keys()]),rows:ResourceProcess[]=[],previous=new Map<number,{start:string;cpuMs:number;at:number}>();
  for(const p of all){
   let cursor=p,matched:PaneProcess|undefined,owned=false;const seen=new Set<number>();
   while(!seen.has(cursor.pid)){
    seen.add(cursor.pid);matched??=paneByPid.get(cursor.pid);
    if(roots.has(cursor.pid))owned=true;
    const parent=byPid.get(cursor.ppid);if(!parent)break;cursor=parent;
   }
   if(!owned)continue;
   const before=this.previous.get(p.pid),delta=before?at-before.at:0;
   const cpu=before&&before.start===p.start&&delta>0&&p.cpuMs>=before.cpuMs?(p.cpuMs-before.cpuMs)/delta*100:null;
   previous.set(p.pid,{start:p.start,cpuMs:p.cpuMs,at});
   const group=p.pid===this.root?"server":matched?(matched.agent?"agent":"terminal"):"service";
   rows.push({startIdentity:`${process.platform}:${p.start}`,id:`server:${p.pid}:${p.start}`,pid:p.pid,parentPid:p.ppid,name:p.name,group,label:p.pid===this.root?"操舵室サーバ":matched?.label??"関連プロセス",source:"server",platform:process.platform,...(matched?{paneId:matched.paneId}:{}),cpuPercent:cpu,rssBytes:p.rss,threads:p.threads});
  }
  this.previous=previous;return this.cached={at,rows};
 }
}
