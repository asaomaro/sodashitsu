import { RpcError, type AgentInfo, type ServerEvent } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../bus/EventBus.js";
import { AgentLineage } from "../../graph/AgentLineage.js";
import { MemoryLogger } from "../../log/Logger.js";
import type { AgentStarter } from "../../agent/AgentStarter.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerAgentMethods } from "./agent.js";
import type { MethodDeps } from "./deps.js";
import { registerPaneMethods } from "./pane.js";
import { registerTabMethods } from "./tab.js";
import { registerWorkspaceMethods } from "./workspace.js";

// 20261003-graph-auto-nodes T5：ハンドラの配線。実物の AgentLineage（attach は spy）を、検出の事実（bus）まで通して見る。
const agentInfo: AgentInfo = {
  instanceId: "i1",
  kind: "claude",
  label: "Claude",
  state: "idle",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
};

function setup(starter?: Pick<AgentStarter, "start">) {
  const bus = new EventBus();
  const attach = vi.fn();
  const live = new Set(["p1", "p2", "p3"]);
  const lineage = new AgentLineage({
    bus,
    store: { get: vi.fn(), update: vi.fn() } as never,
    paneExists: (id) => live.has(id),
    logger: new MemoryLogger(),
    attach,
  });
  const created = (id: string) => ({ pane: { id }, workspace: { id: "w1" }, tab: { id: "t1" } });
  const deps = {
    session: {
      splitPane: async () => created("p2"),
      createWorkspace: async () => created("p2"),
      createTab: async () => created("p2"),
    },
    clients: { touch: () => undefined },
    sizeAuthority: { noteInteraction: () => undefined },
    gitPoller: { pollWorkspaceNow: () => Promise.resolve() },
    terminals: { get: () => undefined },
    agentStarter: starter,
    lineage,
  } as unknown as MethodDeps;
  const surface = new ControlSurface(new MemoryLogger());
  registerPaneMethods(surface, deps);
  registerWorkspaceMethods(surface, deps);
  registerTabMethods(surface, deps);
  registerAgentMethods(surface, deps);
  const call = (method: string, params: unknown) =>
    surface.invoke({ clientId: "c1", sink: {} as never }, method, params);
  /** p2 でエージェントが検出された事実を流し、attach（応答の後の microtask）が呼ばれたかを見る。 */
  const detected = async (): Promise<[string, string][]> => {
    bus.publish({
      event: "pane.agent_status_changed",
      data: { paneId: "p2", agent: agentInfo },
    } as ServerEvent);
    await new Promise<void>((r) => setTimeout(r, 0));
    return attach.mock.calls.map((c) => [c[0], c[1]] as [string, string]);
  };
  return { call, detected, live };
}

const CREATE_CALLS: [string, unknown][] = [
  ["pane.split", { paneId: "p1", direction: "right" }],
  ["workspace.create", {}],
  ["tab.create", {}],
];

describe("pane.split / workspace.create / tab.create の記録（AC1）", () => {
  for (const [method, base] of CREATE_CALLS) {
    const p = base as Record<string, unknown>;
    it(`${method}: callerPaneId があれば結果の pane.id を子として記録し、検出で親に載る`, async () => {
      const s = setup();
      expect(await s.call(method, { ...p, callerPaneId: "p1" })).toMatchObject({ ok: true });
      expect(await s.detected()).toEqual([["p2", "p1"]]);
    });
    it(`${method}: callerPaneId なし（旧形）は従来どおり成功し、何も記録しない`, async () => {
      const s = setup();
      expect(await s.call(method, p)).toMatchObject({ ok: true });
      expect(await s.detected()).toEqual([]);
    });
    it(`${method}: 実在しない callerPaneId・対象と同じ callerPaneId は何も記録しない`, async () => {
      const s = setup();
      await s.call(method, { ...p, callerPaneId: "p99" });
      expect(await s.detected()).toEqual([]);
      const s2 = setup();
      await s2.call(method, { ...p, callerPaneId: "p2" });
      expect(await s2.detected()).toEqual([]);
    });
  }
});

describe("agent.start の記録（AC1・AC3・AC11）", () => {
  const params = { name: "r", kind: "claude", paneId: "p2", args: [], callerPaneId: "p1" };
  const RESULT = { paneId: "p2", name: "r", kind: "claude", argv: ["claude"] };

  it("成功した要求は onAccepted の中で noteStarted され、検出で親に載る", async () => {
    const s = setup({
      start: async (_p, onAccepted) => {
        onAccepted?.();
        return RESULT as never;
      },
    });
    expect(await s.call("agent.start", params)).toMatchObject({ ok: true });
    expect(await s.detected()).toEqual([["p2", "p1"]]);
  });

  it("拒否された要求（onAccepted を呼ばない）は記録しない", async () => {
    const s = setup({ start: () => Promise.reject(new RpcError("agent_pane_busy", "busy")) });
    expect(await s.call("agent.start", params)).toMatchObject({
      ok: false,
      error: { code: "agent_pane_busy" },
    });
    expect(await s.detected()).toEqual([]);
  });

  it("検査の途中（onAccepted の前）は記録しない——受け付ける前に検出が来ても親に載らない", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({
      start: async (_p, onAccepted) => {
        await gate; // 前面の確認などの待ち
        onAccepted?.();
        return RESULT as never;
      },
    });
    const pending = s.call("agent.start", params);
    expect(await s.detected()).toEqual([]);
    release();
    await pending;
  });

  it("onAccepted の後で start が投げたら（書き込みの失敗）、その記録を取り消す", async () => {
    const s = setup({
      start: async (_p, onAccepted) => {
        onAccepted?.();
        throw new RpcError("agent_start_input_failed", "write failed");
      },
    });
    expect(await s.call("agent.start", params)).toMatchObject({
      ok: false,
      error: { code: "agent_start_input_failed" },
    });
    expect(await s.detected()).toEqual([]);
  });

  it("callerPaneId なし・実在しない・対象と同じなら何も記録しない", async () => {
    const accept = async (_p: unknown, onAccepted?: () => void) => {
      onAccepted?.();
      return RESULT as never;
    };
    for (const caller of [undefined, "p99", "p2"]) {
      const s = setup({ start: accept });
      await s.call("agent.start", { ...params, callerPaneId: caller });
      expect(await s.detected()).toEqual([]);
    }
  });
});
