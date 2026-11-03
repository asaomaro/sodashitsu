import {loadSummarySettings,NotificationSummaryParams} from "@sodashitsu/protocol";
import {sourceTarget} from "../../assistant/SourceTarget.js";
import {conversationResumeArgs} from "../../agent/conversationResume.js";
import { SessionToolsParams, SessionNoteSaveParams, SessionNoteDeleteParams } from "@sodashitsu/protocol";
import { readAgentTodos } from "../../conversation/AgentTodos.js";
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
  if (deps.notificationTest) surface.register("notification.test", {
    schema: NotificationStateParams,
    handler: () => { deps.notificationTest!(); return { ok: true as const }; },
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
  if(deps.summaries)surface.register("notification.summary",{
    schema:NotificationSummaryParams,
    handler:(_ctx,p)=>{
      const pane=deps.session.getPane(p.paneId),tab=pane&&deps.session.getTab(pane.tabId);
      if(!pane?.agent||!tab)throw new RpcError("not_found","通知元が見つかりません");
      const source={serverOrigin:"http://127.0.0.1:7780",machineId:"local",paneId:p.paneId,workspaceId:p.workspaceId??tab.workspaceId,agentInstanceId:p.agentInstanceId??pane.agent.instanceId};
      const target=sourceTarget(deps,source,p.key,true),settings=loadSummarySettings(deps.prefs?.get().prefs.summarySettings);
      let conversation:{kind:string;sessionId:string}|undefined;
      try{const found=deps.conversations?.source(p.paneId);if(found)conversation={kind:found.kind,sessionId:found.sessionId};}catch{}
      const scope=JSON.stringify([p.key,source,pane.agentSession?.sessionId,conversation,target.workspace.projectDir,target.workspace.cwd]);
      const reference=pane.agentSession?.sessionId;
      const guard=()=>{
        target.guard();
        if(deps.session.getPane(p.paneId)?.agentSession?.sessionId!==reference)throw new RpcError("not_found","会話が変更されました");
        if(conversation){const now=deps.conversations!.source(p.paneId);if(now.kind!==conversation.kind||now.sessionId!==conversation.sessionId)throw new RpcError("not_found","会話が変更されました");}
        const current=loadSummarySettings(deps.prefs?.get().prefs.summarySettings);
        if(current.notificationSummary===false||current.kind!==settings.kind||current.model!==settings.model)throw new RpcError("not_found","要約設定が変更されました");
      };
      // The disabled state is available without starting a job.
      if(settings.notificationSummary===false)return {status:"disabled" as const,text:"",message:"通知の作業要約は設定で無効です。"};
      return deps.summaries!.notificationSummary(scope,settings,async()=>{
        guard();
        const cached=await deps.summaries!.cached(p.paneId).catch(()=>null);
        const tail=await deps.conversations?.tail(p.paneId).catch(()=>null);
        guard();
        if(tail&&conversation&&(tail.sessionId!==conversation.sessionId||tail.kind!==conversation.kind))throw new RpcError("not_found","会話が変更されました");
        let question:unknown=null;
        if(p.key.startsWith("ask:"))question=deps.asks?.notificationText(p.paneId,p.key.slice(4))??null;
        return {notification:{key:p.key,agent:target.pane.label??target.pane.title,workspace:target.workspace.label,state:target.agent.state,question},
          previousSummary:cached?{text:cached.text.slice(0,4000),partial:cached.partial||cached.text.length>4000,stale:cached.stale}:null,
          recentConversation:tail?{partial:tail.partial||tail.messages.length>12||tail.messages.some(m=>m.text.length>650),messages:tail.messages.slice(-12).map(m=>({role:m.role,text:m.text.slice(0,650)}))}:"作業記録は取得できませんでした。推測せず不明と記してください。"};
      },guard,p.refresh);
    },
  });
  if (deps.sessionNotes) {
    surface.register("agent.notes", { schema: SessionToolsParams, handler: (_, p) => deps.sessionNotes!.list(p.paneId) });
    surface.register("agent.note_save", { schema: SessionNoteSaveParams, handler: (_, p) => deps.sessionNotes!.save(p) });
    surface.register("agent.note_delete", { schema: SessionNoteDeleteParams, handler: (_, p) => deps.sessionNotes!.delete(p) });
  }
  const service = deps.conversations;
  if (!service) return;
  surface.register("agent.todos", { schema: SessionToolsParams, handler: (_, p) => readAgentTodos(service, p.paneId) });
  surface.register("agent.conversation_tail",{schema:AgentConversationParams,handler:(_,p)=>service.tail(p.paneId)});
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
          args:conversationResumeArgs(p.kind,p.sessionId,deps.session.getPane(p.paneId)?.cwd??"."),
        },
        () => deps.sizeAuthority.noteInteraction(ctx.clientId, p.paneId),
      );
      return {};
    },
  });
}
