import {lstat} from "node:fs/promises";
import {locateExtra,openExtra,type ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import {verifyAntigravityChild} from "./AntigravitySubagentReader.js";
import {entriesOfLine} from "./SubagentTranscript.js";
import type {SubagentTranscriptEntry} from "@sodashitsu/protocol";
/** Parent invoke result + exact descriptor UUID/spawn-step proof. Never follows workspaceUris.
 * Optional verifier is a server-private KILLED-only proof; RPC never supplies callbacks. */
export async function openAntigravityChildRecord(parent:string,child:string,roots:ExtraRoots,verify?:()=>Promise<boolean>) {
 const owned=verify??(()=>verifyAntigravityChild(parent,child,roots));
 if(parent===child||!await owned())return undefined;
 const path=await locateExtra("agy",child,roots),opened=path&&await openExtra("agy",child,roots);
 if(!path||!opened)return undefined;
 try{
  if(process.geteuid&&opened.st.uid!==process.geteuid())throw Error("child owner mismatch");
  const revision=await opened.fd.stat({bigint:true});
  const unchanged=async()=>{
   if(!await owned())return false;
   const after=await opened.fd.stat({bigint:true}).catch(()=>undefined),leaf=await lstat(path,{bigint:true}).catch(()=>undefined);
   return await locateExtra("agy",child,roots)===path&&!!leaf&&!leaf.isSymbolicLink()&&[leaf,after].every(st=>st!==undefined&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===revision[k]));
  };
  if(!await unchanged())throw Error("child changed");
  return {...opened,unchanged};
 }catch{await opened.fd.close();return undefined;}
}
/** Only an explicit parent-directed public message request is displayed, never planner/private content. */
export function antigravityChildEntries(row:unknown,parent:string):SubagentTranscriptEntry[]{
 if(!row||typeof row!=="object"||Array.isArray(row))return [];
 const r=row as Record<string,any>;
 if(r.source!=="MODEL"||r.type!=="PLANNER_RESPONSE"||r.status!=="DONE"||!Array.isArray(r.tool_calls))return [];
 const out:SubagentTranscriptEntry[]=[];
 for(const call of r.tool_calls.slice(0,64)){
  if(call?.name!=="send_message"||typeof call.args?.Recipient!=="string"||typeof call.args?.Message!=="string")continue;
  try{
   const recipient=JSON.parse(call.args.Recipient),message=JSON.parse(call.args.Message);
   if(recipient!==parent||typeof message!=="string"||!message)continue;
   out.push(...entriesOfLine({type:"assistant",timestamp:r.created_at,message:{content:"【親への送信要求】\n"+message}}).map(entry=>({kind:"tool" as const,name:"send_message",text:entry.text,...(entry.truncated!==undefined?{truncated:entry.truncated}:{}),...(entry.at?{at:entry.at}:{})})));
  }catch{/* Unknown argument encoding is not public chat. */}
 }
 return out;
}
