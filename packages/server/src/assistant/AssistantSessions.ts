import { AssistantDisabledDevices } from "./AssistantDisabledDevices.js";
import { assistantLaunchArgs } from "@sodashitsu/protocol";
import { mkdir, lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  AssistantSessionEnsureParams,
  AssistantSessionAdoptParams,
  AssistantSessionGetParams,
  RpcError,
  type AssistantWorkspaceBinding,
  type AssistantSessionInfo,
  type AgentInfo,
  type Workspace,
} from "@sodashitsu/protocol";
import type { SessionService } from "../session/SessionService.js";
import type { AgentStarter } from "../agent/AgentStarter.js";

export interface AssistantSessionDeps {
  session: Pick<
    SessionService,
    | "snapshot"
    | "getWorkspace"
    | "getTab"
    | "getPane"
    | "closePane"
    | "createWorkspace"
    | "updateAssistantBinding"
    | "detachAssistantBinding"
    | "hasAgentLaunch"
    | "matchesAgentLaunch"
    | "hasPendingResume"
    | "wasRestoredPane"
    | "hasVerifiedAgentSession"
  >;
  starter: Pick<AgentStarter, "start" | "isShellAvailable">;
  flush: () => Promise<void>;
  stateDir: string;
}

/** A device owns one tagged workspace. Reconnection never retypes a launch command. */
export class AssistantSessions {
  private pending = new Map<
    string,
    { kind: string; settings?: string; promise: Promise<AssistantSessionInfo>; adoptInstanceId?: string }
  >();
  private readonly stopRequests = new Set<Promise<void>>();
  private draining: Promise<void> | null = null;
  private drainAgain = false;
  private readonly disabledDevices: AssistantDisabledDevices;
  private readonly stopTokens = new Map<string, object>();
  private generation = 0;
  private starting = new Set<string>();
  private startedHere = new Set<string>();
  private adopting = new Set<string>();
  private runtimeOwners = new Map<string, { paneId: string; instanceId: string }>();
  private creation: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private readonly deps: AssistantSessionDeps) { this.disabledDevices = new AssistantDisabledDevices(deps.stateDir); }

  close(): void {
    this.closed = true;
    ++this.generation;
  }
  resume(): void {
    this.closed = false;
  }
  async suspend(): Promise<void> {
    this.close();
    await Promise.allSettled([...this.pending.values()].map((item) => item.promise).map(promise => promise as Promise<unknown>).concat([...this.stopRequests], this.draining ? [this.draining] : []));
  }

  /** Disable only this installation's dedicated agent; active work may finish before closure. */
  private isStopped(deviceId: string): boolean {
    const id = AssistantSessionGetParams.parse({deviceId}).deviceId;
    return this.stopTokens.has(id) || this.disabledDevices.isDisabled(id);
  }
  requestStop(deviceId: string): Promise<void> {
    const id = AssistantSessionGetParams.parse({deviceId}).deviceId;
    if (this.closed) return Promise.resolve();
    this.disabledDevices.disable(id);
    const token = {}; this.stopTokens.set(id, token);
    const pending = this.finishStop(id, token);
    this.stopRequests.add(pending);
    void pending.then(() => this.stopRequests.delete(pending), () => this.stopRequests.delete(pending));
    return pending;
  }
  private async finishStop(id: string, token: object): Promise<void> {
    await this.pending.get(id)?.promise.catch(() => {});
    if (this.closed || this.stopTokens.get(id) !== token) return;
    const workspace = this.find(id);
    if (!workspace || !this.scoped(workspace, workspace.assistant!)) return;
    this.deps.session.updateAssistantBinding(workspace.id, workspace.assistant!, {stopWhenIdle: true});
    await this.deps.flush();
    if (this.stopTokens.get(id) === token) await this.drainIdleStops();
  }
  activate(deviceId: string): void {
    const id = AssistantSessionGetParams.parse({deviceId}).deviceId;
    if (this.closed) return;
    this.disabledDevices.activate(id);
    this.stopTokens.delete(id);
    const workspace = this.find(id);
    if (workspace && this.scoped(workspace, workspace.assistant!) && workspace.assistant!.stopWhenIdle)
      this.deps.session.updateAssistantBinding(workspace.id, workspace.assistant!, {stopWhenIdle: false});
  }
  /** Existing monitor events drive this; no timer or process is allocated for disabled agents. */
  drainIdleStops(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.draining) { this.drainAgain = true; return this.draining; }
    const generation = this.generation;
    let task!: Promise<void>;
    task = (async () => {
      try {
        do { this.drainAgain = false; await this.closeIdleAgents(generation); }
        while (this.drainAgain && !this.closed && generation === this.generation);
      } finally { if (this.draining === task) this.draining = null; }
    })();
    this.draining = task;
    return task;
  }
  private async closeIdleAgents(generation: number): Promise<void> {
    for (const workspace of this.deps.session.snapshot().workspaces) {
      if (this.closed || generation !== this.generation) return;
      const current = this.deps.session.getWorkspace(workspace.id);
      if (!current?.assistant?.stopWhenIdle) continue;
      const binding = current.assistant;
      if (!this.scoped(current, binding)) continue;
      const actor = this.ownAgent(current, binding) ?? this.initialAgent(current, binding);
      if (actor?.state !== "idle") continue;
      // No await between final identity/scope check and the session's synchronous pane removal.
      if (current.assistant !== binding || !binding.stopWhenIdle || this.deps.session.getPane(binding.paneId)?.agent?.instanceId !== actor.instanceId) continue;
      await this.deps.session.closePane(binding.paneId);
    }
  }

  get(deviceId: string): AssistantSessionInfo | null {
    const id = AssistantSessionGetParams.parse({ deviceId }).deviceId;
    const workspace = this.find(id);
    return workspace ? this.info(workspace) : null;
  }

  ensure(input: unknown): Promise<AssistantSessionInfo> {
    const request = AssistantSessionEnsureParams.parse(input);
    assistantLaunchArgs(request.kind, request.launchSettings ?? {});

    if (this.closed) throw new RpcError("agent_pane_busy", "専用セッションの起動を停止しています");
    if (request.activate) this.activate(request.deviceId);
    if (this.isStopped(request.deviceId) || this.find(request.deviceId)?.assistant?.stopWhenIdle)
      throw new RpcError("agent_pane_busy", "アシスタントは無効です。明示的に有効化してください");
    if (this.closed) throw new RpcError("agent_pane_busy", "専用セッションの起動を停止しています");
    const current = this.pending.get(request.deviceId);
    if (current) {
      if (current.kind !== request.kind || current.settings !== JSON.stringify(request.launchSettings ?? {model: "", effort: ""}))
        throw new RpcError("agent_pane_busy", "別のエージェントで起動中です");
      return current.promise;
    }
    if (this.pending.size >= 16)
      throw new RpcError("agent_pane_busy", "専用セッションの起動件数の上限です");
    const promise = this.launch(request).finally(() => {
      if (this.pending.get(request.deviceId)?.promise === promise)
        this.pending.delete(request.deviceId);
    });
    this.pending.set(request.deviceId, { kind: request.kind, settings: JSON.stringify(request.launchSettings ?? {model: "", effort: ""}), promise });
    return promise;
  }

  /** Explicit user-selected actor only. Used when a live handoff lacks fresh hook/argv evidence. */
  adopt(input: unknown): Promise<AssistantSessionInfo> {
    const request = AssistantSessionAdoptParams.parse(input);
    if (this.isStopped(request.deviceId) || this.find(request.deviceId)?.assistant?.stopWhenIdle) throw new RpcError("agent_pane_busy", "アシスタントは停止待ちです");
    if (this.closed) throw new RpcError("agent_pane_busy", "専用セッションの操作を停止しています");
    const pending = this.pending.get(request.deviceId);
    if (pending) {
      if (pending.adoptInstanceId === request.instanceId) return pending.promise;
      throw new RpcError(
        "agent_pane_busy",
        "専用セッションを確認しています。完了後に選び直してください",
      );
    }
    const workspace = this.find(request.deviceId);
    const binding = workspace?.assistant;
    if (!workspace || !binding || !this.scoped(workspace, binding))
      throw new RpcError("agent_not_found", "専用セッションが変更されました");
    const actor = this.deps.session.getPane(binding.paneId)?.agent;
    if (!actor || actor.instanceId !== request.instanceId || actor.kind !== binding.kind)
      throw new RpcError("agent_not_found", "選んだエージェントが変更されました");
    if (this.pending.size >= 16)
      throw new RpcError("agent_pane_busy", "専用セッションの確認件数の上限です");
    const generation = this.generation;
    this.adopting.add(request.deviceId);
    const promise = (async () => {
      const pane = this.deps.session.getPane(binding.paneId)!;
      const reference = pane.agentSession;
      const sessionId =
        reference?.kind === binding.kind &&
        this.deps.session.hasVerifiedAgentSession(pane.id, actor.instanceId, reference.sessionId)
          ? reference.sessionId
          : undefined;
      const next = this.deps.session.updateAssistantBinding(workspace.id, binding, {
        launchRequested: true,
        launchSettings: undefined,
        lastInstanceId: actor.instanceId,
        sessionId,
      });
      try {
        await this.deps.flush();
        if (
          this.closed ||
          generation !== this.generation ||
          !this.scoped(workspace, next) ||
          this.deps.session.getPane(binding.paneId)?.agent?.instanceId !== actor.instanceId
        )
          throw new RpcError("agent_not_found", "確認中に専用セッションが変更されました");
        this.runtimeOwners.set(request.deviceId, {
          paneId: binding.paneId,
          instanceId: actor.instanceId,
        });
        this.startedHere.delete(binding.paneId);
        this.adopting.delete(request.deviceId);
        return this.info(workspace);
      } catch (error) {
        if (this.deps.session.getWorkspace(workspace.id)?.assistant === next)
          this.deps.session.updateAssistantBinding(workspace.id, next, {
            launchRequested: binding.launchRequested,
            launchSettings: binding.launchSettings,
            lastInstanceId: binding.lastInstanceId,
            sessionId: binding.sessionId,
          });
        throw error;
      }
    })().finally(() => {
      this.adopting.delete(request.deviceId);
      if (this.pending.get(request.deviceId)?.promise === promise)
        this.pending.delete(request.deviceId);
    });
    this.pending.set(request.deviceId, {
      kind: binding.kind,
      promise,
      adoptInstanceId: actor.instanceId,
    });
    return promise;
  }

  /** Used both before queueing a prompt and by its final TerminalHost input guard. */
  target(
    deviceId: string,
    instanceId: string,
  ): { paneId: string; workspaceId: string; tabId: string; projectDir: string; agent: AgentInfo } {
    if (this.isStopped(deviceId) || this.find(deviceId)?.assistant?.stopWhenIdle) throw new RpcError("agent_pane_busy", "アシスタントは停止待ちです");
    if (this.closed) throw new RpcError("agent_pane_busy", "専用セッションの操作を停止しています");
    const workspace = this.find(AssistantSessionGetParams.parse({ deviceId }).deviceId);
    if (!workspace) throw new RpcError("agent_not_found", "専用セッションが見つかりません");
    const info = this.info(workspace);
    if (info.state !== "ready" || info.agent?.instanceId !== instanceId)
      throw new RpcError("agent_not_found", "専用セッションのエージェントが変更されました");
    return {
      paneId: info.paneId,
      workspaceId: workspace.id,
      tabId: info.tabId!,
      projectDir: workspace.projectDir!,
      agent: info.agent,
    };
  }

  private find(deviceId: string): Workspace | undefined {
    const all = this.deps.session.snapshot().workspaces;
    const liveOwners = new Set(
      all.flatMap((workspace) => (workspace.assistant ? [workspace.assistant.deviceId] : [])),
    );
    const livePanes = new Set(
      all.flatMap((workspace) => (workspace.assistant ? [workspace.assistant.paneId] : [])),
    );
    for (const paneId of this.startedHere)
      if (!livePanes.has(paneId)) this.startedHere.delete(paneId);
    for (const owner of this.runtimeOwners.keys())
      if (!liveOwners.has(owner)) this.runtimeOwners.delete(owner);
    const workspaces = all.filter((workspace) => workspace.assistant?.deviceId === deviceId);
    if (workspaces.length > 1)
      throw new RpcError(
        "agent_pane_busy",
        "専用セッションが重複しています。操舵室で確認してください",
      );
    return workspaces[0];
  }

  /** Audio uses a daemon API, so a requested/resumed marker alone is insufficient. */
  audioTarget(deviceId:string,instanceId:string):{paneId:string;instanceId:string;threadId:string;projectDir:string;agent:AgentInfo} {
    const target=this.target(deviceId,instanceId),pane=this.deps.session.getPane(target.paneId),reference=pane?.agentSession;
    if(target.agent.kind!=="codex" || target.agent.state!=="idle" || reference?.kind!=="codex" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reference.sessionId) ||
      !this.deps.session.hasVerifiedAgentSession(target.paneId,instanceId,reference.sessionId))
      throw new RpcError("agent_pane_busy","音声入力は、会話IDを確認済みで待機中のCodex専用セッションを選んでください");
    return{paneId:target.paneId,instanceId,threadId:reference.sessionId,projectDir:target.projectDir,agent:target.agent};
  }

  private scoped(workspace: Workspace, binding: AssistantWorkspaceBinding): boolean {
    const session = this.deps.session;
    const pane = session.getPane(binding.paneId);
    const tab = pane && session.getTab(pane.tabId);
    return (
      session.getWorkspace(workspace.id) === workspace &&
      workspace.assistant === binding &&
      tab?.workspaceId === workspace.id &&
      workspace.projectDir === this.home(binding.deviceId)
    );
  }

  private ownAgent(workspace: Workspace, binding: AssistantWorkspaceBinding): AgentInfo | null {
    if (!this.scoped(workspace, binding)) return null;
    const pane = this.deps.session.getPane(binding.paneId)!;
    const agent = pane.agent;
    if (!agent || agent.kind !== binding.kind) return null;
    const known = this.runtimeOwners.get(binding.deviceId);
    if (known?.paneId === binding.paneId)
      return known.instanceId === agent.instanceId ? agent : null;
    const resumed =
      binding.sessionId &&
      this.deps.session.wasRestoredPane(binding.paneId) &&
      this.deps.session.hasVerifiedAgentSession(
        binding.paneId,
        agent.instanceId,
        binding.sessionId,
      );
    if (agent.instanceId === binding.lastInstanceId || resumed) {
      this.runtimeOwners.set(binding.deviceId, {
        paneId: binding.paneId,
        instanceId: agent.instanceId,
      });
      return agent;
    }
    return null;
  }

  /** A persisted requested marker/name alone never proves that this runtime launched an actor. */
  private initialAgent(workspace: Workspace, binding: AssistantWorkspaceBinding): AgentInfo | null {
    const agent = this.deps.session.getPane(binding.paneId)?.agent;
    return this.scoped(workspace, binding) &&
      this.startedHere.has(binding.paneId) &&
      !!agent &&
      this.deps.session.matchesAgentLaunch(binding.paneId, agent.instanceId, binding.name) &&
      !binding.lastInstanceId &&
      binding.launchRequested &&
      agent?.kind === binding.kind &&
      agent.name === binding.name
      ? agent
      : null;
  }

  private info(workspace: Workspace): AssistantSessionInfo {
    const binding = workspace.assistant!;
    const pane = this.deps.session.getPane(binding.paneId);
    const adopting = this.adopting.has(binding.deviceId);
    const agent = adopting ? null : this.ownAgent(workspace, binding);
    const state = !this.scoped(workspace, binding)
      ? "conflict"
      : adopting
        ? "starting"
        : agent
          ? binding.lastInstanceId === agent.instanceId
            ? "ready"
            : "starting"
          : this.initialAgent(workspace, binding)
            ? "starting"
            : pane?.agent
              ? "conflict"
              : this.starting.has(binding.deviceId) ||
                  this.deps.session.hasAgentLaunch(binding.paneId) ||
                  this.deps.session.hasPendingResume(binding.paneId)
                ? "starting"
                : binding.launchRequested
                  ? "stopped"
                  : "shell";
    return {
      deviceId: binding.deviceId,
      workspaceId: workspace.id,
      tabId: pane?.tabId ?? null,
      paneId: binding.paneId,
      kind: binding.kind,
      ...(binding.launchSettings ? {launchSettings: binding.launchSettings} : {}),
      state,
      agent: agent ? structuredClone(agent) : null,
      observedAgent:
        this.scoped(workspace, binding) && pane?.agent ? structuredClone(pane.agent) : null,
    };
  }

  private home(deviceId: string): string {
    return join(this.deps.stateDir, "assistant", deviceId);
  }

  private async prepareHome(deviceId: string): Promise<void> {
    const root = join(this.deps.stateDir, "assistant");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      throw new RpcError("invalid_params", "専用フォルダにリンクは利用できません");
    const home = this.home(deviceId);
    await mkdir(home, { recursive: true, mode: 0o700 });
    const st = await lstat(home);
    if (
      !st.isDirectory() ||
      st.isSymbolicLink() ||
      (await realpath(home)) !== join(await realpath(root), deviceId)
    )
      throw new RpcError("invalid_params", "専用フォルダの場所を確認できません");
  }

  private async launch(
    request: ReturnType<typeof AssistantSessionEnsureParams.parse>,
  ): Promise<AssistantSessionInfo> {
    const generation = this.generation;
    const live = () => {
      if (this.closed || generation !== this.generation || this.stopTokens.has(request.deviceId))
        throw new RpcError("agent_pane_busy", "専用セッションの起動を中断しました");
    };
    live();
    let workspace = this.find(request.deviceId);
    if (workspace && request.retry) {
      const binding = workspace.assistant!;
      if (
        !this.scoped(workspace, binding) ||
        this.deps.session.getPane(binding.paneId)?.agent ||
        this.deps.session.hasAgentLaunch(binding.paneId) ||
        this.deps.session.hasPendingResume(binding.paneId)
      )
        throw new RpcError("agent_pane_busy", "前の専用セッションは停止していません");
      if (!(await this.deps.starter.isShellAvailable(binding.paneId)))
        throw new RpcError("agent_pane_busy", "前の専用端末で別のプログラムを実行しています");
      live();
      if (!this.scoped(workspace, binding))
        throw new RpcError("agent_pane_busy", "専用セッションが変更されました");
      // Preserve the old empty/failed terminal. Never clear its input or close a repurposed pane.
      this.deps.session.detachAssistantBinding(workspace.id, binding);
      workspace = undefined;
    }
    if (!workspace) {
      const create = this.creation.then(async () => {
        live();
        if (this.deps.session.snapshot().workspaces.filter((w) => w.assistant).length >= 32)
          throw new RpcError("agent_pane_busy", "専用セッションは32台までです");
        await this.prepareHome(request.deviceId);
        live();
        const created = await this.deps.session.createWorkspace(
          this.home(request.deviceId),
          "船長アシスタント",
          undefined,
          undefined,
          { deviceId: request.deviceId, kind: request.kind },
        );
        live();
        return created.workspace;
      });
      this.creation = create.then(
        () => {},
        () => {},
      );
      workspace = await create;
    }
    let binding = workspace.assistant!;
    const guard = () => {
      live();
      if (!this.scoped(workspace!, binding))
        throw new RpcError("agent_pane_busy", "専用セッションの作業先が変更されました");
    };
    guard();
    if (binding.kind !== request.kind)
      throw new RpcError(
        "agent_pane_busy",
        "専用セッションのエージェント種別が異なります。停止してから再作成してください",
      );
    const agent = this.ownAgent(workspace, binding) ?? this.initialAgent(workspace, binding);
    if (agent) {
      const pane = this.deps.session.getPane(binding.paneId)!;
      const sessionId =
        pane.agentSession?.kind === binding.kind &&
        this.deps.session.hasVerifiedAgentSession(
          pane.id,
          agent.instanceId,
          pane.agentSession.sessionId,
        )
          ? pane.agentSession.sessionId
          : undefined;
      if (
        binding.lastInstanceId !== agent.instanceId ||
        (sessionId && binding.sessionId !== sessionId)
      )
        binding = this.deps.session.updateAssistantBinding(workspace.id, binding, {
          lastInstanceId: agent.instanceId,
          ...(sessionId ? { sessionId } : {}),
        });
      return this.info(workspace);
    }
    if (this.deps.session.getPane(binding.paneId)?.agent) return this.info(workspace);
    // A durable launch request can be in progress or stopped. Neither is automatically relaunched.
    if (binding.launchRequested) return this.info(workspace);
    if (!(await this.deps.starter.isShellAvailable(binding.paneId))) {
      guard();
      return this.info(workspace);
    }
    guard();
    if (
      this.deps.session.getPane(binding.paneId)?.agent ||
      this.deps.session.hasPendingResume(binding.paneId)
    )
      return this.info(workspace);
    this.starting.add(request.deviceId);
    try {
      binding = this.deps.session.updateAssistantBinding(workspace.id, binding, {
        launchRequested: true,
        launchSettings: request.launchSettings ?? { model: "", effort: "" },
      });
      await this.deps.flush();
      guard();
      await this.deps.starter.start(
        { paneId: binding.paneId, name: binding.name, kind: binding.kind, args: assistantLaunchArgs(binding.kind, binding.launchSettings ?? {}) },
        guard,
        { skipInterrupt: true, beforeWrite: guard },
      );
      guard();
      this.startedHere.add(binding.paneId);
      const detected = this.initialAgent(workspace, binding);
      if (detected)
        binding = this.deps.session.updateAssistantBinding(workspace.id, binding, {
          lastInstanceId: detected.instanceId,
        });
      return this.info(workspace);
    } finally {
      this.starting.delete(request.deviceId);
    }
  }
}

/** Status is published before fresh argv evidence; evaluate after that synchronous update completes. */
export function watchAssistantIdleStops(bus: Pick<import("../bus/EventBus.js").EventBus, "subscribe">, sessions: AssistantSessions, warn: () => void): {dispose():void} {
 let active=true, queued=false;
 const subscription=bus.subscribe(event=>{
  if(event.event!=="pane.agent_status_changed"||queued)return;
  queued=true;queueMicrotask(()=>{queued=false;if(active)void sessions.drainIdleStops().catch(warn);});
 });
 return {dispose(){active=false;subscription.dispose();}};
}
