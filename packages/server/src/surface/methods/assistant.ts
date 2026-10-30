import {
  AssistantImageCancelParams,
  AssistantReminderSaveParams,
  AssistantReminderIdParams,
  AssistantSourceParams,
  AssistantReplyParams,
  AssistantReplyKeysParams,
  AssistantSessionGetParams,
  AssistantSessionEnsureParams,
  AssistantSessionPromptParams,
  AssistantSessionKeysParams,
  AssistantSessionAdoptParams,
  RpcError,
  type AgentInfo,
} from "@sodashitsu/protocol";
import { registerAssistantApps } from "../../assistant/AssistantApps.js";
import { registerAssistantAudio } from "../../assistant/AssistantAudioMethods.js";
import { sourceTarget } from "../../assistant/SourceTarget.js";
import type { ControlSurface, MethodContext } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerAssistantMethods(surface: ControlSurface, deps: MethodDeps): void {
  registerAssistantApps(surface, deps);
  registerAssistantAudio(surface,deps);
  const imagePrompts = new Map<string, {clientId:string; active:boolean; expires:number}>();
  const scheduler = () => {
    if (!deps.scheduler) throw new RpcError("not_found", "予約を利用できません");
    return deps.scheduler;
  };
  const reminders = (deviceId: string) => {
    const all = scheduler().list();
    const jobs = all.jobs.filter(
      (job) => job.action.type === "reminder" && job.action.deviceId === deviceId,
    );
    return {
      jobs,
      runs: all.runs.filter(
        (run) =>
          run.reminderDeviceId === deviceId &&
          run.actionType === "reminder" &&
          run.status === "succeeded" &&
          !run.acknowledgedAt,
      ),
    };
  };
  surface.register("assistant.reminders", {
    schema: AssistantSessionGetParams,
    handler: (_ctx, p) => reminders(p.deviceId),
  });
  surface.register("assistant.reminder_save", {
    schema: AssistantReminderSaveParams,
    handler: (_ctx, p) => {
      if (Date.parse(p.at) <= Date.now() || Date.parse(p.at) > Date.now() + 366 * 86400000)
        throw new RpcError("invalid_params", "1年以内の未来の日時を選んでください");
      return scheduler().save(undefined, {
        label: p.label,
        enabled: true,
        trigger: { type: "once", at: p.at },
        action: { type: "reminder", deviceId: p.deviceId, text: p.text },
        timeoutSeconds: 30,
      });
    },
  });
  surface.register("assistant.reminder_remove", {
    schema: AssistantReminderIdParams,
    handler: async (_ctx, p) => {
      if (!reminders(p.deviceId).jobs.some((job) => job.id === p.id))
        throw new RpcError("not_found", "リマインダーの対象が見つかりません");
      await scheduler().removeReminder(p.id, p.deviceId);
      return {};
    },
  });
  surface.register("assistant.reminder_ack", {
    schema: AssistantReminderIdParams,
    handler: async (_ctx, p) => {
      await scheduler().acknowledgeReminder(p.id, p.deviceId);
      return {};
    },
  });
  const consumed = new Set<string>();
  surface.register("assistant.source", {
    schema: AssistantSourceParams,
    handler: (_ctx, p) => {
      const t = sourceTarget(deps, p.source, p.key, true);
      return {
        paneId: t.pane.id,
        tabId: t.tab.id,
        workspaceId: t.workspace.id,
        title: t.pane.label ?? t.pane.title,
        agent: t.agent,
      };
    },
  });
  const reply = async (
    ctx: MethodContext,
    p: {
      source: import("@sodashitsu/protocol").AssistantSource;
      key: string;
      text?: string;
      keyName?: string;
    },
  ) => {
    const target = sourceTarget(deps, p.source, p.key);
    if (consumed.has(p.key))
      throw new RpcError("not_found", "この通知には既に返答を送信しました。端末で確認してください");
    if (p.text && target.agent.state !== "idle")
      throw new RpcError("agent_pane_busy", "質問フォームか確認キーで返答してください");
    consumed.add(p.key);
    while (consumed.size > 512) consumed.delete(consumed.values().next().value!);
    const guard = (agent: AgentInfo) => {
      if (ctx.connectionAuthorized && !ctx.connectionAuthorized())
        throw new RpcError("not_found", "接続が終了しました");
      ctx.agentPromptGuard?.(agent);
      target.guard();
      if (p.text && agent.state !== "idle")
        throw new RpcError("agent_pane_busy", "送信先が入力待ちではありません");
    };
    // Never replay uncertain writes: a failed send remains consumed until a new notification event.
    const result = await surface.invoke(
      { ...ctx, agentPromptGuard: guard },
      p.text ? "agent.prompt" : "agent.send_keys",
      {
        paneId: target.pane.id,
        instanceId: target.agent.instanceId,
        ...(p.text ? { text: p.text } : { keys: [p.keyName!] }),
      },
    );
    if (!result.ok) throw new RpcError(result.error.code, result.error.message);
    await deps.notifications
      ?.update({ paneId: target.pane.id, key: p.key, status: "resolved" }, ctx.clientId)
      .catch(() => {});
    return { sent: true as const };
  };
  surface.register("assistant.reply", { schema: AssistantReplyParams, handler: reply });
  surface.register("assistant.reply_key", { schema: AssistantReplyKeysParams, handler: reply });
  const sessions = deps.assistantSessions;
  if (!sessions) return;
  const forward = async (
    ctx: MethodContext,
    params: { deviceId: string; instanceId: string },
    method: "agent.prompt" | "agent.send_keys",
    payload: object,
    finalGuard?: (agent: AgentInfo) => void,
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
      finalGuard?.(current.agent);
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
    handler: async (ctx, params) => {
      const requestId = params.imageRequestId;
      if (!requestId) return forward(ctx, params, "agent.prompt", {text:params.text});
      if (imagePrompts.has(requestId) || imagePrompts.size >= 16 || [...imagePrompts.values()].filter(entry=>entry.clientId===ctx.clientId).length >= 2)
        throw new RpcError("agent_pane_busy", "画像指示の完了を待ってください");
      const lease = {clientId:ctx.clientId, active:true, expires:performance.now()+params.ttlMs!};
      imagePrompts.set(requestId,lease);
      const timer=setTimeout(()=>{lease.active=false;},params.ttlMs!);timer.unref();
      const imageGuard = (agent: AgentInfo) => {
        if (!lease.active || performance.now() >= lease.expires || agent.state !== "idle") throw new RpcError("agent_pane_busy", "画像指示が取り消されたか期限が切れ、またはエージェントが待機中ではありません");
      };
      try {
        return await forward({...ctx,agentPromptGuard:agent=>{
          ctx.agentPromptGuard?.(agent);imageGuard(agent);
        }}, params, "agent.prompt", {text:params.text}, imageGuard);
      } finally {clearTimeout(timer);if(imagePrompts.get(requestId)===lease)imagePrompts.delete(requestId);}
    },
  });
  surface.register("assistant.cancel_image", {
    schema: AssistantImageCancelParams,
    handler: (ctx, params) => {const lease=imagePrompts.get(params.requestId);if(lease?.clientId===ctx.clientId)lease.active=false;return{};},
  });
  surface.register("assistant.send_keys", {
    schema: AssistantSessionKeysParams,
    handler: (ctx, params) => forward(ctx, params, "agent.send_keys", { keys: params.keys }),
  });
}
