import { NotificationStateParams, NotificationUpdateParams } from "@sodashitsu/protocol";
import {
  AgentSummaryParams,
  AgentConversationParams,
  AgentSessionsParams,
  AgentResumeParams,
  AgentCommandParams,
  AGENT_COMMANDS,
  RpcError,
} from "@sodashitsu/protocol";
import type { ControlSurface, MethodContext } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
export function registerConversationMethods(surface: ControlSurface, deps: MethodDeps): void {
  if (deps.summaries)
    surface.register("agent.summary", {
      schema: AgentSummaryParams,
      handler: (_, p) => deps.summaries!.generate(p.paneId, p.settings, p.mode),
    });
  if (deps.summaries)
    surface.register("agent.summary_cached", {
      schema: AgentConversationParams,
      handler: async (_, p) => ({ summary: await deps.summaries!.cached(p.paneId) }),
    });
  if (deps.notifications) {
    surface.register("notification.state", {
      schema: NotificationStateParams,
      handler: () => deps.notifications!.state(),
    });
    surface.register("notification.update", {
      schema: NotificationUpdateParams,
      handler: (ctx, p) => deps.notifications!.update(p, ctx.clientId),
    });
  }
  const service = deps.conversations;
  if (!service) return;
  surface.register("agent.conversation", {
    schema: AgentConversationParams,
    handler: (_, p) => service.page(p.paneId, p.offset),
  });
  surface.register("agent.sessions", {
    schema: AgentSessionsParams,
    handler: (_, p) => service.sessions(p),
  });
  const invoke = async (ctx: MethodContext, method: string, params: unknown) => {
    const r = await surface.invoke(ctx, method, params);
    if (!r.ok) throw new RpcError(r.error.code, r.error.message);
    return r.result;
  };
  surface.register("agent.command", {
    schema: AgentCommandParams,
    handler: async (ctx, p) => {
      const agent = deps.session.getPane(p.paneId)?.agent,
        command = agent && AGENT_COMMANDS[agent.kind]?.[p.action];
      if (!agent || !command)
        throw new RpcError("invalid_params", "このエージェントは操作に対応していません");
      if (agent.state !== "idle")
        throw new RpcError("agent_pane_busy", "エージェントの処理完了を待ってください");
      await invoke(
        ctx,
        command.startsWith("/") ? "agent.prompt" : "agent.send_keys",
        command.startsWith("/")
          ? { paneId: p.paneId, instanceId: agent.instanceId, text: command }
          : { paneId: p.paneId, instanceId: agent.instanceId, keys: [command] },
      );
      return {};
    },
  });
  surface.register("agent.resume", {
    schema: AgentResumeParams,
    handler: async (ctx, p) => {
      await service.locate(p.kind, p.sessionId);
      if (!deps.agentStarter) throw new RpcError("not_found", "エージェント起動を利用できません");
      await deps.agentStarter.start(
        {
          paneId: p.paneId,
          name: `resume-${p.sessionId.slice(0, 8)}-${crypto.randomUUID().slice(0, 4)}`,
          kind: p.kind,
          args:
            p.kind === "claude"
              ? ["--resume", p.sessionId]
              : ["resume", p.sessionId, "--cd", deps.session.getPane(p.paneId)?.cwd ?? "."],
        },
        () => deps.sizeAuthority.noteInteraction(ctx.clientId, p.paneId),
      );
      return {};
    },
  });
}
