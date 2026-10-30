import {
  AssistantSessionGetParams,
  AssistantSessionEnsureParams,
  AssistantSessionPromptParams,
  AssistantSessionKeysParams,
  AssistantSessionAdoptParams,
  RpcError,
  type AgentInfo,
} from "@sodashitsu/protocol";
import type { ControlSurface, MethodContext } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerAssistantMethods(surface: ControlSurface, deps: MethodDeps): void {
  const sessions = deps.assistantSessions;
  if (!sessions) return;
  const forward = async (
    ctx: MethodContext,
    params: { deviceId: string; instanceId: string },
    method: "agent.prompt" | "agent.send_keys",
    payload: object,
  ) => {
    const target = sessions.target(params.deviceId, params.instanceId);
    const guard = (agent: AgentInfo) => {
      if (ctx.connectionAuthorized && !ctx.connectionAuthorized())
        throw new RpcError("agent_not_found", "接続が終了したため送信を取りやめました");
      ctx.agentPromptGuard?.(agent);
      const current = sessions.target(params.deviceId, params.instanceId);
      if (
        current.paneId !== target.paneId ||
        current.workspaceId !== target.workspaceId ||
        current.tabId !== target.tabId ||
        current.projectDir !== target.projectDir ||
        agent.instanceId !== target.agent.instanceId
      )
        throw new RpcError("agent_not_found", "専用セッションの送信先が変更されました");
    };
    const result = await surface.invoke({ ...ctx, agentPromptGuard: guard }, method, {
      paneId: target.paneId,
      instanceId: params.instanceId,
      ...payload,
    });
    if (!result.ok) throw new RpcError(result.error.code, result.error.message);
    return result.result;
  };
  surface.register("assistant.get", {
    schema: AssistantSessionGetParams,
    handler: (_ctx, params) => sessions.get(params.deviceId),
  });
  surface.register("assistant.ensure", {
    schema: AssistantSessionEnsureParams,
    handler: (_ctx, params) => sessions.ensure(params),
  });
  surface.register("assistant.adopt", {
    schema: AssistantSessionAdoptParams,
    handler: (_ctx, params) => sessions.adopt(params),
  });
  surface.register("assistant.prompt", {
    schema: AssistantSessionPromptParams,
    handler: (ctx, params) => forward(ctx, params, "agent.prompt", { text: params.text }),
  });
  surface.register("assistant.send_keys", {
    schema: AssistantSessionKeysParams,
    handler: (ctx, params) => forward(ctx, params, "agent.send_keys", { keys: params.keys }),
  });
}
