import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {z} from "zod";
const MonitorId=z.string().min(1).max(128).refine(value=>value!=="all"&&!value.includes("\0"));
export const DesktopNativeMonitorRestore=z.object({type:z.literal("native_monitor_restore"),token:z.string().min(1).max(8192).refine(value=>!value.includes("\0")),monitors:z.array(MonitorId).min(1).max(16)}).strict();
/** Portal restore tokens stay on B, are single-use and tied to one permitted
 * controller origin. Nothing survives a local permission/source epoch change. */
export class DesktopNativeMonitorRestores {
 private records=new Map<string,{token:string;at:number;until:number}>();
 private seen=new Set<string>();
 constructor(private clock=()=>performance.now()){}
 private origin(url:string){const value=new URL(url);if(!["http:","https:"].includes(value.protocol)||value.username||value.password)throw Error("Native monitor controller origin");return value.origin;}
 remember(url:string,token:string){
  DesktopNativeMonitorRestore.shape.token.parse(token);const origin=this.origin(url),digest=createHash("sha256").update(token).digest("hex");
  if(this.seen.has(digest)||this.seen.size>=1024)return;
  this.seen.add(digest);if(!this.records.has(origin)&&this.records.size>=32)return;
  const at=this.clock();this.records.set(origin,{token,at,until:at+600000});
 }
 take(url:string){const origin=this.origin(url),record=this.records.get(origin);this.records.delete(origin);const now=this.clock();return record&&now>=record.at&&now<record.until?record.token:undefined;}
 forget(url:string){this.records.delete(this.origin(url));}
 clear(){this.records.clear();this.seen.clear();}
}
