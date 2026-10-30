import { AssistantDisabledDevices } from "./AssistantDisabledDevices.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RpcError, type AgentInfo, type AssistantSessionInfo } from "@sodashitsu/protocol";
import { watchAssistantIdleStops, AssistantSessions } from "./AssistantSessions.js";
import { savedAssistantBinding } from "./savedBinding.js";
import { SessionModel } from "../session/SessionModel.js";
import { SessionService } from "../session/SessionService.js";
import { EventBus } from "../bus/EventBus.js";
import { MemoryLogger } from "../log/Logger.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost, ModalInput } from "../terminal/TerminalHost.js";
import type { AgentStarter } from "../agent/AgentStarter.js";
import { FsSessionFile, type SessionFileData } from "../persist/SessionFile.js";
import { ControlSurface } from "../surface/ControlSurface.js";
import { registerAgentMethods } from "../surface/methods/agent.js";
import { registerAssistantMethods } from "../surface/methods/assistant.js";
import type { MethodDeps } from "../surface/methods/deps.js";

/** Entire test uses generated in-memory terminals. No shell, model or real PTY is started. */
class MemoryHost implements TerminalHost {
  readonly pid = 424242;
  readonly mirror = {} as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  readonly writes: Array<string | Uint8Array> = [];
  beforeModal: (() => Promise<void>) | null = null;
  constructor(readonly paneId: string) {}
  write(input: string | Uint8Array) {
    this.writes.push(input);
  }
  async writeModal(input: ModalInput) {
    await this.beforeModal?.();
    await input.prepare?.();
    this.writes.push(...input.build({ bracketedPaste: false, applicationCursorKeys: false }));
  }
  resize() {}
  lastOutputAt() {
    return 0;
  }
  onExit() {
    return { dispose() {} };
  }
  dispose() {}
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(existing?: { model: SessionModel; stateDir: string }) {
  const stateDir =
    existing?.stateDir ?? (await mkdtemp(join(tmpdir(), "soda-assistant-session-test-")));
  const model = existing?.model ?? new SessionModel();
  const hosts = new Map<string, MemoryHost>();
  const terminals: TerminalManager = {
    get: (id) => hosts.get(id),
    create(id) {
      const host = new MemoryHost(id);
      hosts.set(id, host);
      return host;
    },
    resize() {},
    dispose(id) {
      hosts.get(id)?.dispose();
      hosts.delete(id);
    },
  };
  const touch = vi.fn();
  const flush = vi.fn(async () => {});
  const bus = new EventBus();
  const session = new SessionService({
    isAssistantDisabled: device => new AssistantDisabledDevices(stateDir).isDisabled(device),
    model,
    terminals,
    bus,
    persist: { touch, flush, cancel() {} },
    serverVersion: "generated",
    host: { os: "linux", windowsBuild: null, hostname: "generated" },
    scrollbackLines: 100,
    spawnGraceMs: 0,
    defaultCwd: stateDir,
    logger: new MemoryLogger(),
  });
  for (const pane of model.listPanes())
    terminals.create(pane.id, { cwd: pane.cwd, cols: 80, rows: 24 });
  const available = vi.fn(async () => true);
  const tokens = new Map<string, number>();
  const start = vi.fn<AgentStarter["start"]>(async (params, onAccepted, options) => {
    const token = session.beginAgentLaunch(params.paneId, params.name, params.kind);
    tokens.set(params.paneId, token);
    try {
      onAccepted?.();
      options?.beforeWrite?.();
    } catch (error) {
      session.endAgentLaunch(params.paneId, token);
      throw error;
    }
    return {
      paneId: params.paneId,
      name: params.name,
      kind: params.kind,
      argv: ["generated-agent"],
    };
  });
  const manager = new AssistantSessions({
    session,
    starter: { start, isShellAvailable: available },
    flush,
    stateDir,
  });
  cleanups.push(async () => {
    await manager.suspend();
    if (!existing) await rm(stateDir, { recursive: true, force: true });
  });
  const ensure = (deviceId = randomUUID(), kind = "codex", retry = false) =>
    manager.ensure({ deviceId, kind, retry });
  const detect = (info: AssistantSessionInfo, over: Partial<AgentInfo> = {}) => {
    const binding = session.getWorkspace(info.workspaceId)!.assistant!;
    const agent: AgentInfo = {
      instanceId: randomUUID(),
      kind: binding.kind,
      label: "generated",
      state: "idle",
      completionSeq: 0,
      serverSeenSeq: 0,
      since: 1,
      verified: true,
      name: binding.name,
      ...over,
    };
    session.updatePaneRuntime(info.paneId, { agent });
    return session.getPane(info.paneId)!.agent!;
  };
  const ready = async () => {
    const device = randomUUID();
    const info = await ensure(device);
    const agent = detect(info);
    await ensure(device);
    return { device, info, agent };
  };
  return {
    bus,
    stateDir,
    model,
    session,
    hosts,
    terminals,
    touch,
    flush,
    available,
    start,
    tokens,
    manager,
    ensure,
    detect,
    ready,
  };
}

it("coalesces concurrent clients and reconnects without retyping an agent command", async () => {
  const f = await fixture();
  const device = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, () => f.ensure(device)));
  expect(new Set(results.map((item) => item.paneId)).size).toBe(1);
  expect(f.start).toHaveBeenCalledOnce();
  expect(f.session.snapshot().workspaces).toHaveLength(1);
  const info = results[0]!;
  const binding = f.session.getWorkspace(info.workspaceId)!.assistant!;
  expect(binding).toMatchObject({ deviceId: device, paneId: info.paneId, launchRequested: true });
  expect(f.session.getWorkspace(info.workspaceId)!.projectDir).toBe(
    join(f.stateDir, "assistant", device),
  );
  const agent = f.detect(info);
  expect((await f.ensure(device)).state).toBe("ready");
  expect(f.manager.target(device, agent.instanceId).paneId).toBe(info.paneId);
  expect(f.start).toHaveBeenCalledOnce();
});

it("persists the launch marker before writing and never starts on a failed save", async () => {
  const f = await fixture();
  const device = randomUUID();
  let release: (() => void) | undefined;
  f.flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.ensure(device);
  try {
    await vi.waitFor(() => expect(f.flush).toHaveBeenCalledOnce());
    expect(f.manager.get(device)?.state).toBe("starting");
    expect(f.start).not.toHaveBeenCalled();
    expect(f.session.snapshot().workspaces[0]!.assistant?.launchRequested).toBe(true);
  } finally {
    release?.();
    await pending;
  }
  const g = await fixture();
  g.flush.mockRejectedValueOnce(Error("disk full"));
  const id = randomUUID();
  await expect(g.ensure(id)).rejects.toThrow("disk full");
  expect(g.start).not.toHaveBeenCalled();
  expect(g.manager.get(id)?.state).toBe("stopped");
  expect((await g.ensure(id)).state).toBe("stopped");
  expect(g.start).not.toHaveBeenCalled();
});

it("does not restart a requested but stopped agent unless explicitly retried in a fresh terminal", async () => {
  const f = await fixture();
  const device = randomUUID();
  const first = await f.ensure(device);
  f.session.endAgentLaunch(first.paneId, f.tokens.get(first.paneId)!);
  expect((await f.ensure(device)).state).toBe("stopped");
  expect(f.start).toHaveBeenCalledOnce();
  const second = await f.ensure(device, "codex", true);
  expect(second.paneId).not.toBe(first.paneId);
  expect(f.start).toHaveBeenCalledTimes(2);
  expect(f.session.getPane(first.paneId)).toBeDefined();
  expect(f.session.getWorkspace(first.workspaceId)?.assistant).toBeUndefined();
});

it("rejects replacement agents and moved project targets without writing to them", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  expect(f.manager.target(device, agent.instanceId).paneId).toBe(info.paneId);
  f.model.updatePaneRuntime(info.paneId, {
    agent: { ...agent, instanceId: randomUUID() },
    agentSession: null,
  });
  expect(f.manager.get(device)?.state).toBe("conflict");
  expect(() => f.manager.target(device, agent.instanceId)).toThrow("変更");
  await expect(f.ensure(device, "claude")).rejects.toThrow("種別");
  expect(f.start).toHaveBeenCalledOnce();
});

it("does not interrupt or detach a repurposed editor during retry", async () => {
  const f = await fixture();
  const device = randomUUID();
  const info = await f.ensure(device);
  f.session.endAgentLaunch(info.paneId, f.tokens.get(info.paneId)!);
  f.available.mockResolvedValue(false);
  await expect(f.ensure(device, "codex", true)).rejects.toThrow("別のプログラム");
  expect(f.session.getWorkspace(info.workspaceId)?.assistant?.deviceId).toBe(device);
  expect(f.hosts.get(info.paneId)!.writes).toEqual([]);
  expect(f.start).toHaveBeenCalledOnce();
});

it("cancels pending starts across shutdown/handoff and does not revive them on resume", async () => {
  const f = await fixture();
  const device = randomUUID();
  let release!: () => void;
  f.flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.ensure(device);
  const result = Promise.allSettled([pending]);
  await vi.waitFor(() => expect(f.flush).toHaveBeenCalledOnce());
  const suspended = f.manager.suspend();
  f.manager.resume();
  release();
  await suspended;
  expect((await result)[0]!.status).toBe("rejected");
  expect(f.start).not.toHaveBeenCalled();
  expect((await f.ensure(device)).state).toBe("stopped");
});

it("bounds concurrent workspace creation at32 devices", async () => {
  const f = await fixture();
  for (let index = 0; index < 31; index++)
    await f.session.createWorkspace(f.stateDir, "generated", undefined, undefined, {
      deviceId: randomUUID(),
      kind: "codex",
    });
  const results = await Promise.allSettled([f.ensure(randomUUID()), f.ensure(randomUUID())]);
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
  expect(f.session.snapshot().workspaces.filter((w) => w.assistant)).toHaveLength(32);
});

it("round-trips ownership and verified conversation identity without starting another agent after restore", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  const sessionId = randomUUID();
  f.session.reportAgentSession(info.paneId, "codex", sessionId);
  const pane = f.session.getPane(info.paneId)!;
  const tab = f.session.getTab(pane.tabId)!;
  const ws = f.session.getWorkspace(info.workspaceId)!;
  const binding = savedAssistantBinding(ws, [pane], (paneId, instanceId, sessionId) =>
    f.session.hasVerifiedAgentSession(paneId, instanceId, sessionId),
  );
  expect(binding).toMatchObject({ lastInstanceId: agent.instanceId, sessionId });
  const data: SessionFileData = {
    schema: 1,
    savedAt: new Date().toISOString(),
    groups: [],
    focus: null,
    workspaces: [
      {
        id: ws.id,
        label: ws.label,
        cwd: ws.cwd,
        projectDir: ws.projectDir!,
        assistant: binding,
        activeTabId: tab.id,
        tabs: [
          {
            id: tab.id,
            label: tab.label,
            focusedPaneId: pane.id,
            zoomedPaneId: null,
            layout: { type: "pane", paneId: pane.id },
            panes: [
              {
                id: pane.id,
                label: pane.label,
                cwd: pane.cwd,
                shell: pane.shell,
                agentSession: pane.agentSession!,
              },
            ],
          },
        ],
      },
    ],
  };
  const launchSettings = { model: "custom-model", effort: "high" as const };
  data.workspaces[0]!.assistant!.launchSettings = launchSettings;
  const file = new FsSessionFile(f.stateDir);
  await file.save(data);
  const loaded = await file.load();
  expect(loaded.kind).toBe("ok");
  if (loaded.kind !== "ok") throw Error("No generated session");
  for (const evidence of ["hook", "argv", "argv-stop"]) {
    const model = new SessionModel();
    const g = await fixture({ model, stateDir: f.stateDir });
    await g.session.restore(loaded.data);
    expect(g.manager.get(device)?.launchSettings).toEqual(launchSettings);
    expect(g.session.wasRestoredPane(info.paneId)).toBe(true);
    const resumed = { ...agent, instanceId: randomUUID() };
    delete resumed.name;
    let idleStopSubscription: {dispose():void} | undefined;
    if (evidence === "argv-stop") {
      const workspace = g.session.getWorkspace(info.workspaceId)!;
      g.session.updateAssistantBinding(workspace.id, workspace.assistant!, {stopWhenIdle:true});
      idleStopSubscription = watchAssistantIdleStops(g.bus,g.manager,()=>{});
    }
    if (evidence.startsWith("argv"))
      g.session.setFrontAgent(info.paneId, {
        kind: "codex",
        pids: new Set([1234]),
        resumeId: sessionId,
      });
    g.session.updatePaneRuntime(info.paneId, { agent: resumed });
    if (evidence === "argv-stop") {
      try { await vi.waitFor(()=>expect(g.session.getPane(info.paneId)).toBeUndefined()); }
      finally {idleStopSubscription?.dispose();}
      continue;
    }
    if (evidence === "hook") {
      expect((await g.ensure(device)).state).toBe("conflict"); // Persisted reference alone is never proof.
      g.session.reportAgentSession(info.paneId, "codex", sessionId);
    }
    expect((await g.ensure(device)).state).toBe("ready");
    expect(g.manager.target(device, resumed.instanceId).paneId).toBe(info.paneId);
    expect(g.start).not.toHaveBeenCalled();
    const foreign = { ...resumed, instanceId: randomUUID() };
    g.session.setFrontAgent(info.paneId, { kind: "codex", pids: new Set([5678]) });
    g.session.updatePaneRuntime(info.paneId, { agent: foreign });
    expect(g.session.getPane(info.paneId)?.agentSession?.sessionId).toBe(sessionId);
    g.session.reportAgentSession(info.paneId, "codex", sessionId);
    expect((await g.ensure(device)).state).toBe("conflict");
    expect(g.manager.get(device)?.state).toBe("conflict");
    expect(() => g.manager.target(device, foreign.instanceId)).toThrow("変更");
  }
});

it("pins assistant prompts and keys through the existing final queued-input guard", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  const surface = new ControlSurface(new MemoryLogger());
  const deps = {
    session: f.session,
    terminals: f.terminals,
    sizeAuthority: { noteInteraction() {} },
    assistantSessions: f.manager,
  } as unknown as MethodDeps;
  registerAgentMethods(surface, deps);
  registerAssistantMethods(surface, deps);
  const ctx = { clientId: randomUUID(), sink: {} as never };
  expect(
    (
      await surface.invoke(ctx, "assistant.prompt", {
        deviceId: device,
        instanceId: agent.instanceId,
        text: "こんにちは",
      })
    ).ok,
  ).toBe(true);
  const host = f.hosts.get(info.paneId)!;
  expect(host.writes).toEqual(["こんにちは", "\r"]);
  host.writes.length = 0;
  for (const method of ["assistant.prompt", "assistant.send_keys"]) {
    let release!: () => void;
    host.beforeModal = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const pending = surface.invoke(ctx, method, {
      deviceId: device,
      instanceId: agent.instanceId,
      ...(method === "assistant.prompt" ? { text: "queued" } : { keys: ["y", "Enter"] }),
    });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    f.session.getWorkspace(info.workspaceId)!.projectDir = join(f.stateDir, "other");
    release();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, error: { code: "agent_not_found" } });
    expect(host.writes).toEqual([]);
    f.session.getWorkspace(info.workspaceId)!.projectDir = join(f.stateDir, "assistant", device);
  }
});

it("refuses untrusted launch options and does not register assistant methods without the service", async () => {
  const f = await fixture();
  expect(() =>
    f.manager.ensure({ deviceId: randomUUID(), kind: "shell", command: "generated" }),
  ).toThrow();
  expect(f.start).not.toHaveBeenCalled();
  const surface = new ControlSurface();
  registerAssistantMethods(surface, {} as MethodDeps);
  expect(
    await surface.invoke({ clientId: "generated", sink: {} as never }, "assistant.ensure", {
      deviceId: randomUUID(),
      kind: "codex",
    }),
  ).toMatchObject({ ok: false, error: { code: "not_found" } });
});

it("rejects a direct runtime instance replacement retaining the old conversation reference", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  const sessionId = randomUUID();
  f.session.reportAgentSession(info.paneId, "codex", sessionId);
  await f.ensure(device);
  expect(f.session.getWorkspace(info.workspaceId)?.assistant?.sessionId).toBe(sessionId);
  const foreign = { ...agent, instanceId: randomUUID() };
  f.session.updatePaneRuntime(info.paneId, { agent: foreign });
  expect(f.session.getPane(info.paneId)?.agentSession?.sessionId).toBe(sessionId);
  expect(f.session.hasVerifiedAgentSession(info.paneId, foreign.instanceId, sessionId)).toBe(false);
  expect((await f.ensure(device)).state).toBe("conflict");
  expect(f.manager.get(device)?.state).toBe("conflict");
  expect(() => f.manager.target(device, foreign.instanceId)).toThrow("変更");
  expect(f.start).toHaveBeenCalledOnce();
});
it("assigns distinct valid agent names to two full UUIDs sharing the first8 characters", async () => {
  const f = await fixture();
  await Promise.all([
    f.ensure("deadbeef-1111-4111-8111-111111111111"),
    f.ensure("deadbeef-2222-4222-8222-222222222222"),
  ]);
  const names = f.start.mock.calls.map((call) => call[0].name);
  expect(new Set(names).size).toBe(2);
  expect(names.every((name) => name.length <= 32)).toBe(true);
});

it("never promotes a requested-only restored marker by an actor's matching name", async () => {
  const f = await fixture();
  const device = randomUUID();
  const info = await f.ensure(device);
  const ws = f.session.getWorkspace(info.workspaceId)!;
  const pane = f.session.getPane(info.paneId)!;
  const binding = structuredClone(ws.assistant!);
  expect(binding.lastInstanceId).toBeUndefined();
  expect(binding.sessionId).toBeUndefined();
  const data: SessionFileData = {
    schema: 1,
    savedAt: new Date().toISOString(),
    groups: [],
    focus: null,
    workspaces: [
      {
        id: ws.id,
        label: ws.label,
        cwd: ws.cwd,
        projectDir: ws.projectDir!,
        assistant: binding,
        activeTabId: pane.tabId,
        tabs: [
          {
            id: pane.tabId,
            label: "generated",
            focusedPaneId: pane.id,
            zoomedPaneId: null,
            layout: { type: "pane", paneId: pane.id },
            panes: [{ id: pane.id, label: null, cwd: pane.cwd, shell: pane.shell }],
          },
        ],
      },
    ],
  };
  const file = new FsSessionFile(f.stateDir);
  await file.save(data);
  const loaded = await file.load();
  if (loaded.kind !== "ok") throw Error("Generated marker missing");
  const g = await fixture({ model: new SessionModel(), stateDir: f.stateDir });
  await g.session.restore(loaded.data);
  const actor = g.detect(info);
  expect(actor.name).toBe(binding.name);
  expect((await g.ensure(device)).state).toBe("conflict");
  expect(g.manager.get(device)?.state).toBe("conflict");
  expect(() => g.manager.target(device, actor.instanceId)).toThrow("変更");
  g.session.reportAgentSession(pane.id, "codex", randomUUID());
  const saved = savedAssistantBinding(
    g.session.getWorkspace(ws.id)!,
    g.session.snapshot().panes,
    (paneId, instanceId, sessionId) =>
      g.session.hasVerifiedAgentSession(paneId, instanceId, sessionId),
  );
  expect(saved.lastInstanceId).toBeUndefined();
  expect(saved.sessionId).toBeUndefined();
  expect(g.start).not.toHaveBeenCalled();
  expect(g.hosts.get(pane.id)!.writes).toEqual([]);
});

it("only adopts an explicitly selected current actor and never carries its stale conversation reference", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  const oldSession = randomUUID();
  f.session.reportAgentSession(info.paneId, "codex", oldSession);
  await f.ensure(device);
  const actor = { ...agent, instanceId: randomUUID() };
  f.session.updatePaneRuntime(info.paneId, { agent: actor });
  expect(f.manager.get(device)?.state).toBe("conflict");
  expect(f.manager.get(device)?.observedAgent?.instanceId).toBe(actor.instanceId);
  expect(() => f.manager.adopt({ deviceId: device, instanceId: agent.instanceId })).toThrow("変更");
  const result = await f.manager.adopt({ deviceId: device, instanceId: actor.instanceId });
  expect(result.state).toBe("ready");
  expect(f.manager.target(device, actor.instanceId).paneId).toBe(info.paneId);
  expect(() => f.manager.target(device, agent.instanceId)).toThrow();
  const workspace = f.session.getWorkspace(info.workspaceId)!;
  expect(workspace.assistant?.sessionId).toBeUndefined();
  expect((await f.ensure(device)).state).toBe("ready");
  expect(workspace.assistant?.sessionId).toBeUndefined();
  const saved = savedAssistantBinding(
    workspace,
    f.session.snapshot().panes,
    (paneId, instanceId, sessionId) =>
      f.session.hasVerifiedAgentSession(paneId, instanceId, sessionId),
  );
  expect(saved.sessionId).toBeUndefined();
  expect(f.session.getPane(info.paneId)?.agentSession?.sessionId).toBe(oldSession);
  expect(f.start).toHaveBeenCalledOnce();
  expect(f.hosts.get(info.paneId)!.writes).toEqual([]);
});

it("coalesces explicit adoption, fences inputs while saving and rolls back failed persistence", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  const actor = { ...agent, instanceId: randomUUID() };
  f.session.updatePaneRuntime(info.paneId, { agent: actor });
  let release!: () => void;
  f.flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.manager.adopt({ deviceId: device, instanceId: actor.instanceId });
  try {
    expect(f.manager.adopt({ deviceId: device, instanceId: actor.instanceId })).toBe(pending);
    expect(f.manager.get(device)?.state).toBe("starting");
    expect(() => f.manager.target(device, actor.instanceId)).toThrow();
  } finally {
    release();
    await pending;
  }
  const foreign = { ...actor, instanceId: randomUUID() };
  f.session.updatePaneRuntime(info.paneId, { agent: foreign });
  f.flush.mockRejectedValueOnce(Error("disk full"));
  await expect(
    f.manager.adopt({ deviceId: device, instanceId: foreign.instanceId }),
  ).rejects.toThrow("disk full");
  expect(f.session.getWorkspace(info.workspaceId)?.assistant?.lastInstanceId).toBe(
    actor.instanceId,
  );
  expect(f.manager.get(device)?.state).toBe("conflict");
  expect(() => f.manager.target(device, foreign.instanceId)).toThrow();
});

it("rejects an adoption if the chosen actor changes while persistence is pending", async () => {
  const f = await fixture();
  const { device, info, agent } = await f.ready();
  const actor = { ...agent, instanceId: randomUUID() };
  f.session.updatePaneRuntime(info.paneId, { agent: actor });
  let release!: () => void;
  f.flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.manager.adopt({ deviceId: device, instanceId: actor.instanceId });
  const outcome = Promise.allSettled([pending]);
  const foreign = { ...actor, instanceId: randomUUID() };
  f.session.updatePaneRuntime(info.paneId, { agent: foreign });
  release();
  expect((await outcome)[0]!.status).toBe("rejected");
  expect(f.session.getWorkspace(info.workspaceId)?.assistant?.lastInstanceId).toBe(
    agent.instanceId,
  );
  expect(f.manager.get(device)?.state).toBe("conflict");
  expect(() => f.manager.target(device, foreign.instanceId)).toThrow();
  expect(f.start).toHaveBeenCalledOnce();
});

it("never adopts a same-name replacement before the first launch detection is claimed", async () => {
  for (const viaNull of [false, true]) {
    const f = await fixture();
    const device = randomUUID();
    const info = await f.ensure(device);
    const first = f.detect(info);
    if (viaNull) f.session.updatePaneRuntime(info.paneId, { agent: null });
    const foreign = { ...first, instanceId: randomUUID() };
    f.session.updatePaneRuntime(info.paneId, { agent: foreign });
    expect(f.session.getPane(info.paneId)?.agent?.name).toBe(first.name);
    expect((await f.ensure(device)).state).toBe("conflict");
    expect(() => f.manager.target(device, foreign.instanceId)).toThrow("変更");
    expect(f.start).toHaveBeenCalledOnce();
    expect(f.hosts.get(info.paneId)!.writes).toEqual([]);
  }
});

it("records session-only model and effort, restores them, and never rewrites an existing session", async () => {
 const f=await fixture(); const deviceId=randomUUID();
 const launchSettings={model:"sonnet",effort:"high"};
 const info=await f.manager.ensure({deviceId,kind:"claude",launchSettings});
 expect(f.start.mock.calls[0]![0].args).toEqual(["--model","sonnet","--effort","high"]);
 expect(info.launchSettings).toEqual(launchSettings);
 const again=await f.manager.ensure({deviceId,kind:"claude",launchSettings:{model:"opus",effort:"low"}});
 expect(again.launchSettings).toEqual(launchSettings);
 expect(f.start).toHaveBeenCalledTimes(1);
 const restored=await fixture({model:f.model,stateDir:f.stateDir});
 expect(restored.manager.get(deviceId)?.launchSettings).toEqual(launchSettings);
 expect(restored.start).not.toHaveBeenCalled();
});
it("rejects unsupported launch settings before allocating a workspace", async () => {
 const f=await fixture();
 expect(() => f.manager.ensure({deviceId:randomUUID(),kind:"gemini",launchSettings:{model:"x"}})).toThrow();
 expect(f.model.listWorkspaces()).toHaveLength(0);
 expect(f.start).not.toHaveBeenCalled();
});

it("restores known launch settings when explicit adoption cannot be persisted", async () => {
 const f=await fixture(); const {device,info,agent}=await f.ready();
 const workspace=f.session.getWorkspace(info.workspaceId)!;
 const launchSettings={model:"custom-model",effort:"high" as const};
 f.session.updateAssistantBinding(workspace.id,workspace.assistant!,{launchSettings});
 const actor={...agent,instanceId:randomUUID()};
 f.session.updatePaneRuntime(info.paneId,{agent:actor});
 f.flush.mockRejectedValueOnce(Error("generated disk failure"));
 await expect(f.manager.adopt({deviceId:device,instanceId:actor.instanceId})).rejects.toThrow("generated disk failure");
 expect(f.manager.get(device)?.launchSettings).toEqual(launchSettings);
});

it("coalesces equal profiles but rejects a different concurrent launch profile", async () => {
 const f=await fixture(); const deviceId=randomUUID();
 let release!:()=>void;
 f.available.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{release=()=>resolve(true);}));
 const first=f.manager.ensure({deviceId,kind:"claude",launchSettings:{model:"sonnet",effort:"high"}});
 expect(f.manager.ensure({deviceId,kind:"claude",launchSettings:{model:"sonnet",effort:"high"}})).toBe(first);
 expect(()=>f.manager.ensure({deviceId,kind:"claude",launchSettings:{model:"opus",effort:"high"}})).toThrow("起動中");
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 release(); await first;
 expect(f.start).toHaveBeenCalledTimes(1);
});

it("closes only the disabled installation's idle owned agent and requires explicit reactivation", async () => {
 const f=await fixture();const {device,info}=await f.ready();
 await f.manager.requestStop(device);
 expect(f.session.getPane(info.paneId)).toBeUndefined();
 expect(()=>f.manager.ensure({deviceId:device,kind:"codex"})).toThrow("無効");
 const next=await f.manager.ensure({deviceId:device,kind:"codex",activate:true});
 expect(next.paneId).not.toBe(info.paneId);
});
it("lets active work finish, persists the stop request, and closes on the existing idle event", async () => {
 const f=await fixture();const {device,info,agent}=await f.ready();
 f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"working"}});
 await f.manager.requestStop(device);expect(f.session.getPane(info.paneId)).toBeDefined();
 expect(f.session.getWorkspace(info.workspaceId)?.assistant?.stopWhenIdle).toBe(true);
 f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"idle"}});
 await f.manager.drainIdleStops();expect(f.session.getPane(info.paneId)).toBeUndefined();
});
it("does not close a replacement actor and cancels a queued stop on explicit activation", async () => {
 const f=await fixture();const {device,info,agent}=await f.ready();
 f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"working"}});
 await f.manager.requestStop(device);f.manager.activate(device);
 f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"idle"}});
 await f.manager.drainIdleStops();expect(f.session.getPane(info.paneId)).toBeDefined();
 const foreign={...agent,instanceId:randomUUID()};f.session.updatePaneRuntime(info.paneId,{agent:foreign});
 await f.manager.requestStop(device);expect(f.session.getPane(info.paneId)?.agent?.instanceId).toBe(foreign.instanceId);
});

it("rejects queued input guards after disable while active work finishes", async () => {
 const f=await fixture();const {device,info,agent}=await f.ready();
 f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"working"}});
 await f.manager.requestStop(device);
 expect(()=>f.manager.target(device,agent.instanceId)).toThrow();
});
it("remembers a fully stopped device after replacing the manager and requires explicit activation", async () => {
 const f=await fixture();const {device}=await f.ready();await f.manager.requestStop(device);
 const g=await fixture({model:new SessionModel(),stateDir:f.stateDir});
 expect(()=>g.manager.ensure({deviceId:device,kind:"codex"})).toThrow();
 await expect(g.manager.ensure({deviceId:device,kind:"codex",activate:true})).resolves.toBeDefined();
});
it("does not close the next owned idle agent after suspension begins", async () => {
 const f=await fixture();const first=await f.ready(),second=await f.ready();
 for(const info of [first.info,second.info]) {const ws=f.session.getWorkspace(info.workspaceId)!;f.session.updateAssistantBinding(ws.id,ws.assistant!,{stopWhenIdle:true});}
 let release!:()=>void;const original=f.session.closePane.bind(f.session);
 vi.spyOn(f.session,"closePane").mockImplementationOnce(async pane=>{await original(pane);await new Promise<void>(resolve=>{release=resolve;});});
 const drain=f.manager.drainIdleStops();await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 const pause=f.manager.suspend();release();await Promise.all([drain,pause]);
 expect(f.session.getPane(second.info.paneId)).toBeDefined();
});

it("drops an already queued assistant prompt after disabling its working owner", async () => {
 const f=await fixture();const {device,info,agent}=await f.ready();
 f.session.updatePaneRuntime(info.paneId,{agent:{...agent,state:"working"}});
 const surface=new ControlSurface(new MemoryLogger());
 const deps={session:f.session,terminals:f.terminals,sizeAuthority:{noteInteraction(){}},assistantSessions:f.manager} as unknown as MethodDeps;
 registerAgentMethods(surface,deps);registerAssistantMethods(surface,deps);
 const host=f.hosts.get(info.paneId)!;let release!:()=>void;
 host.beforeModal=()=>new Promise<void>(resolve=>{release=resolve;});
 const pending=surface.invoke({clientId:randomUUID(),sink:{} as never},"assistant.prompt",{deviceId:device,instanceId:agent.instanceId,text:"queued"});
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 await f.manager.requestStop(device);release();
 expect(await pending).toMatchObject({ok:false});expect(host.writes).toEqual([]);
});

it("rechecks an idle event received while another dedicated pane is closing", async () => {
 const f=await fixture();const first=await f.ready(),second=await f.ready();
 f.session.updatePaneRuntime(first.info.paneId,{agent:{...first.agent,state:"working"}});
 for(const info of [first.info,second.info]) {const ws=f.session.getWorkspace(info.workspaceId)!;f.session.updateAssistantBinding(ws.id,ws.assistant!,{stopWhenIdle:true});}
 let release!:()=>void;const original=f.session.closePane.bind(f.session);
 vi.spyOn(f.session,"closePane").mockImplementationOnce(async pane=>{await original(pane);await new Promise<void>(resolve=>{release=resolve;});});
 const drain=f.manager.drainIdleStops();await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 f.session.updatePaneRuntime(first.info.paneId,{agent:{...first.agent,state:"idle"}});
 const again=f.manager.drainIdleStops();release();await Promise.all([drain,again]);
 expect(f.session.getPane(first.info.paneId)).toBeUndefined();
});
it("does not auto-resume a disabled marker when the binding flag has not been saved", async () => {
 const f=await fixture();const {device,info}=await f.ready();
 const sessionId=randomUUID();f.session.reportAgentSession(info.paneId,"codex",sessionId);
 const pane=f.session.getPane(info.paneId)!,tab=f.session.getTab(pane.tabId)!,ws=f.session.getWorkspace(info.workspaceId)!;
 const file=new FsSessionFile(f.stateDir);
 await file.save({schema:1,savedAt:new Date().toISOString(),groups:[],focus:null,workspaces:[{id:ws.id,label:ws.label,cwd:ws.cwd,projectDir:ws.projectDir!,assistant:ws.assistant!,activeTabId:tab.id,tabs:[{id:tab.id,label:tab.label,focusedPaneId:pane.id,zoomedPaneId:null,layout:{type:"pane",paneId:pane.id},panes:[{id:pane.id,label:pane.label,cwd:pane.cwd,shell:pane.shell,agentSession:pane.agentSession!}]}]}]});
 const loaded=await file.load();if(loaded.kind!=="ok")throw Error("No generated file");
 const {mkdir,writeFile}=await import("node:fs/promises");await mkdir(join(f.stateDir,"assistant-disabled"),{recursive:true});await writeFile(join(f.stateDir,"assistant-disabled",device),"");
 const g=await fixture({model:new SessionModel(),stateDir:f.stateDir});await g.session.restore(loaded.data);
 expect(g.hosts.get(info.paneId)?.writes).toEqual([]);
});
it("starts a fresh drain for a notification at the prior drain's completion boundary", async () => {
 const f=await fixture();const {info}=await f.ready();
 const first=f.manager.drainIdleStops();let next!:Promise<void>;
 queueMicrotask(()=>{const ws=f.session.getWorkspace(info.workspaceId)!;f.session.updateAssistantBinding(ws.id,ws.assistant!,{stopWhenIdle:true});next=f.manager.drainIdleStops();});
 await first;await next;expect(f.session.getPane(info.paneId)).toBeUndefined();
});
