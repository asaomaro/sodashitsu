import {AgentSubagentUsageParams,RpcError} from "@sodashitsu/protocol";
import type {ControlSurface} from "../ControlSurface.js";
import type {SubagentUsageService} from "../../usage/SubagentUsageService.js";
/** Authenticated surface only; intentionally absent from pane.sock's allowlist. */
export function registerSubagentUsage(surface:ControlSurface,usage:Pick<SubagentUsageService,"read">|undefined):void {
 if(!usage)return;
 surface.register("agent.subagent_usage",{schema:AgentSubagentUsageParams,handler:async(ctx,params)=>{
  const check=()=>{if(ctx.connectionAuthorized?.()===false)throw new RpcError("unauthorized","接続の認証が失効しました");if(ctx.signal?.aborted)throw new RpcError("agent_prompt_failed","処理が取り消されました");};
  check();const result=await usage.read(params.paneId,params.agentId);check();return result;
 }});
}
