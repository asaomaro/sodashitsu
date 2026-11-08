import { homedir } from "node:os";
import { join } from "node:path";
import { openCodexControl, type CodexChannelTarget, type CodexControlChannel } from "./CodexControlSocket.js";
import { openCodexChildRecord } from "./CodexChildRecord.js";
import type { VerifiedSubagentTarget } from "./VerifiedSubagentTarget.js";

const METHODS=["initialize","thread/loaded/list","thread/read","thread/turns/list","turn/start","turn/steer"] as const;
type Channel=CodexControlChannel<typeof METHODS[number]>;
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export interface CodexSubagentInputState { daemon:string; mode:"start"|"steer"; turnId?:string }
interface Options {
  home?:string;
  open?:(target:CodexChannelTarget,allowed:typeof METHODS)=>Promise<Channel>;
  record?:typeof openCodexChildRecord;
}
export interface CodexSubagentInputRequest {
  target:VerifiedSubagentTarget;
  signal:AbortSignal;
  current():boolean;
  /** Only these already probed exact state and text permit the one mutating request. */
  send?:{state:CodexSubagentInputState;text:string;requestId:string};
}
export type CodexSubagentInputResult =
  | {status:"ready";state:CodexSubagentInputState}
  | {status:"accepted";turnId:string}
  | {status:"unavailable"}
  | {status:"delivery-unknown"};

/** Existing loaded child only. No daemon/thread start or resume, no policy overrides and no retry.
 * Provider canAcceptDirectInput excludes parent-managed children even when visible in /subagents. */
export async function codexSubagentInput(request:CodexSubagentInputRequest,options:Options={}):Promise<CodexSubagentInputResult> {
  const {target,signal}=request;
  const live=()=>{signal.throwIfAborted();if(!target.current()||!request.current())throw Error("Subagent scope expired");};
  let channel:Channel|undefined,opened:Awaited<ReturnType<typeof openCodexChildRecord>>,attempted=false;
  try {
    live();if(target.kind!=="codex"||target.parentId===target.recordId)return {status:"unavailable"};
    const home=options.home??process.env.CODEX_HOME??join(homedir(),".codex");
    opened=await(options.record??openCodexChildRecord)(home,target.parentId,target.recordId);live();
    if(!opened)return {status:"unavailable"};
    channel=await(options.open??openCodexControl)({home,key:"subagent-input:"+target.recordId,signal,expires:performance.now()+3500,check:live,requestMs:1000,maxRequests:6},METHODS);live();
    const initialized=object(await channel.request("initialize",{clientInfo:{name:"sodashitsu-subagent-input",version:"0.1.0"},capabilities:{experimentalApi:true}}));live();
    if(typeof initialized?.userAgent!=="string"||initialized.userAgent.length>1024)return {status:"unavailable"};
    channel.initialized();
    const loaded=object(await channel.request("thread/loaded/list",{}))?.data;live();
    if(!Array.isArray(loaded)||loaded.length>10000||!loaded.includes(target.parentId)||!loaded.includes(target.recordId))return {status:"unavailable"};
    const thread=object(object(await channel.request("thread/read",{threadId:target.recordId,includeTurns:false}))?.thread);live();
    if(thread?.id!==target.recordId||thread.path!==opened.file||thread.canAcceptDirectInput!==true||!channel.identity)return {status:"unavailable"};
    const status=object(thread.status);
    let state:CodexSubagentInputState;
    if(status?.type==="idle")state={daemon:channel.identity,mode:"start"};
    else if(status?.type==="active"&&Array.isArray(status.activeFlags)&&status.activeFlags.length===0){
      const turns=object(await channel.request("thread/turns/list",{threadId:target.recordId,limit:1,sortDirection:"desc",itemsView:"notLoaded"}))?.data;live();
      if(!Array.isArray(turns)||turns.length!==1)return {status:"unavailable"};
      const turn=object(turns[0]);if(turn?.status!=="inProgress"||!id(turn.id))return {status:"unavailable"};
      state={daemon:channel.identity,mode:"steer",turnId:turn.id};
    }else return {status:"unavailable"};
    if(!await channel.unchanged()||!await opened.unchanged())return {status:"unavailable"};live();
    if(!request.send)return {status:"ready",state};
    if(JSON.stringify(request.send.state)!==JSON.stringify(state))return {status:"unavailable"};
    // This last check and the sole mutation are synchronous. A rejected/racing/unknown write is never retried.
    live();attempted=true;
    const input=[{type:"text",text:request.send.text}],clientUserMessageId=request.send.requestId;
    const result=state.mode==="steer"
      ?object(await channel.request("turn/steer",{threadId:target.recordId,expectedTurnId:state.turnId,input,clientUserMessageId}))
      :object(object(await channel.request("turn/start",{threadId:target.recordId,input,clientUserMessageId}))?.turn);
    const turnId=state.mode==="steer"?result?.turnId:result?.id;
    live();if(!id(turnId))return {status:"delivery-unknown"};
    return {status:"accepted",turnId};
  }catch{return {status:attempted?"delivery-unknown":"unavailable"};}
  finally{
    let closed=channel===undefined;
    try{if(channel)closed=await channel.close();}catch{/* Unknown physical close fails closed below. */}
    try{await opened?.fd.close();}catch{return {status:attempted?"delivery-unknown":"unavailable"};}
    if(!closed)return {status:attempted?"delivery-unknown":"unavailable"};
  }
}
