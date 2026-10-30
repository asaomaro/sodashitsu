import {AssistantAudioBeginParams,AssistantAudioChunkParams,AssistantAudioIdParams,RpcError} from "@sodashitsu/protocol";
import type {ControlSurface} from "../surface/ControlSurface.js";
import type {MethodDeps} from "../surface/methods/deps.js";

export function registerAssistantAudio(surface:ControlSurface,deps:MethodDeps):void {
 const uploads=deps.assistantAudio,sessions=deps.assistantSessions;if(!uploads || !sessions)return;
 surface.register("assistant.audio_begin",{schema:AssistantAudioBeginParams,handler:(ctx,p)=>uploads.begin(ctx.clientId,p,()=>{
  if(ctx.connectionAuthorized && !ctx.connectionAuthorized())throw new RpcError("agent_not_found","接続が終了しました");
  const target=sessions.audioTarget(p.deviceId,p.instanceId);ctx.agentPromptGuard?.(target.agent);
  if(ctx.connectionAuthorized && !ctx.connectionAuthorized())throw new RpcError("agent_not_found","接続が終了しました");
  return sessions.audioTarget(p.deviceId,p.instanceId);
 })});
 surface.register("assistant.audio_chunk",{schema:AssistantAudioChunkParams,handler:(ctx,p)=>{uploads.chunk(ctx.clientId,p);return{};}});
 surface.register("assistant.audio_commit",{schema:AssistantAudioIdParams,handler:(ctx,p)=>uploads.commit(ctx.clientId,p)});
 surface.register("assistant.audio_cancel",{schema:AssistantAudioIdParams,handler:(ctx,p)=>{uploads.cancel(ctx.clientId,p);return{};}});
}
