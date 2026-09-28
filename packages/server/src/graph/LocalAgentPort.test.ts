import { describe, expect, it, vi } from "vitest";
import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import { AgentPortError } from "./AgentPort.js";
import { LocalAgentPort, type LocalAgentPortDeps } from "./LocalAgentPort.js";

// 20260927-agent-graph の 02 T3：手元の pane への口。
const agent: AgentInfo = {
  instanceId: "a1",
  kind: "claude",
  label: "Claude",
  state: "idle",
  completionSeq: 2,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
};

function pane(over: Partial<Pane> = {}): Pane {
  return {
    id: "p1",
    tabId: "t1",
    title: "",
    label: "",
    cols: 80,
    rows: 3,
    cwd: "/",
    status: "running",
    busy: false,
    agent,
    ...over,
  } as Pane;
}

function make(
  opts: {
    lines?: string[];
    pane?: Pane | undefined;
    invoke?: LocalAgentPortDeps["invoke"];
    hostWithoutPane?: boolean;
  } = {},
) {
  const bus = new EventBus();
  const flush = vi.fn(async () => undefined);
  const bottomLines = vi.fn((n: number) => (opts.lines ?? []).slice(-n));
  const p = "pane" in opts ? opts.pane : pane();
  const invoke = opts.invoke ?? vi.fn(async () => ({ ok: true as const, result: {} }));
  const port = new LocalAgentPort({
    bus,
    session: {
      getPane: (id: string) => (p && id === p.id && !opts.hostWithoutPane ? p : undefined),
    },
    terminals: {
      get: (id: string) =>
        p && id === p.id ? ({ mirror: { flush, bottomLines } } as never) : undefined,
    },
    invoke,
  });
  return { port, bus, flush, bottomLines, invoke };
}

describe("LocalAgentPort", () => {
  it("pane.agent_status_changed と pane.closed（null）を渡し、ほかは渡さない。dispose で止まる", () => {
    const { port, bus } = make();
    const seen: unknown[] = [];
    const sub = port.onStatus((e) => seen.push(e));
    bus.publish({ event: "pane.agent_status_changed", data: { paneId: "p1", agent } });
    bus.publish({ event: "pane.closed", data: { paneId: "p2" } });
    bus.publish({ event: "session.focus_changed", data: { focus: null } });
    sub.dispose();
    bus.publish({ event: "pane.agent_status_changed", data: { paneId: "p1", agent: null } });
    expect(seen).toEqual([
      { paneId: "p1", agent },
      { paneId: "p2", agent: null },
    ]);
  });

  it("手元は常に使える", () => {
    const { port } = make();
    expect(port.machine).toBe("local");
    expect(port.available()).toBe(true);
    expect(() => port.onAvailability().dispose()).not.toThrow();
  });

  it("今のエージェントと呼び名（pane が無ければ null）", () => {
    const { port } = make({ pane: pane({ label: "impl" }) });
    expect(port.status("p1")).toEqual(agent);
    expect(port.paneName("p1")).toBe("impl");
    expect(port.status("p9")).toBeNull();
    expect(port.paneName("p9")).toBeNull();
    expect(make({ pane: pane({ agent: null }) }).port.status("p1")).toBeNull();
  });

  it("tail は出力を反映してから、画面の高さぶん多めに読み、末尾の空行を除いた最後の N 行を制御文字なしで返す", async () => {
    const { port, flush, bottomLines } = make({
      lines: ["old", "a", "\u001B[31mb\u001B[0m", "c  ", "", "  "],
    });
    expect(await port.tail("p1", 2)).toBe("b\nc");
    expect(flush).toHaveBeenCalled();
    expect(bottomLines).toHaveBeenCalledWith(2 + 3);
    expect(await port.tail("p9", 2)).toBe("");
  });

  it("tail は画面が空行だけなら空、pane の記録が無ければ（端末だけ残っていても）空", async () => {
    expect(await make({ lines: ["", " ", ""] }).port.tail("p1", 5)).toBe("");
    expect(await make({ lines: ["x"], hostWithoutPane: true }).port.tail("p1", 5)).toBe("");
  });

  it("tail は行が足りなければあるだけ", async () => {
    const { port } = make({ lines: ["only"] });
    expect(await port.tail("p1", 10)).toBe("only");
  });

  it("prompt は agent.prompt を呼び、失敗は code つきの AgentPortError", async () => {
    const invoke = vi.fn(async () => ({
      ok: false as const,
      error: { code: "agent_blocked" as const, message: "blocked" },
    }));
    const { port } = make({ invoke });
    await expect(port.prompt("p1", "hi")).rejects.toMatchObject({
      code: "agent_blocked",
      message: "blocked",
    });
    await expect(port.prompt("p1", "hi")).rejects.toBeInstanceOf(AgentPortError);
    expect(invoke).toHaveBeenCalledWith("agent.prompt", { paneId: "p1", text: "hi" });
    const ok = make();
    await expect(ok.port.prompt("p1", "x")).resolves.toBeUndefined();
  });
});
