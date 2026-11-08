import {AgentSubagentHistoryParams,AgentSubagentHistoryTranscriptParams,AgentSubagentHistoryUsageParams,RpcError} from "@sodashitsu/protocol";
import type {ControlSurface} from "../ControlSurface.js";
import type {MethodContext} from "../ControlSurface.js";
import type {SubagentHistoryService} from "../../agent/SubagentHistoryService.js";
/** Authenticated only. No additions to pane.sock or current child APIs. */
export function registerSubagentHistory(surface:ControlSurface,service:Pick<SubagentHistoryService,"read"|"transcript"|"usageRead">|undefined):void {
 if(!service)return;
 const context=(ctx:MethodContext)=>{
  const allowed=()=>ctx.connectionAuthorized?.()!==false&&!ctx.signal?.aborted;
  const check=()=>{if(ctx.connectionAuthorized?.()===false)throw new RpcError("unauthorized","接続の認証が失効しました");if(ctx.signal?.aborted)throw new RpcError("agent_prompt_failed","処理が取り消されました");};
  return{allowed,check};
 };
 surface.register("agent.subagent_history",{schema:AgentSubagentHistoryParams,handler:async(ctx,params)=>{const {check,allowed}=context(ctx);check();const result=await service.read(params,allowed);check();return result;}});
 surface.register("agent.subagent_history_transcript",{schema:AgentSubagentHistoryTranscriptParams,handler:async(ctx,params)=>{const {check,allowed}=context(ctx);check();const result=await service.transcript(params,allowed);check();return result;}});
 surface.register("agent.subagent_history_usage",{schema:AgentSubagentHistoryUsageParams,handler:async(ctx,params)=>{const {check,allowed}=context(ctx);check();const result=await service.usageRead(params,allowed);check();return result;}});
}
