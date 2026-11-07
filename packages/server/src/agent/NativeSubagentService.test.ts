import type { Pane } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { NativeSubagentService } from "./NativeSubagentService.js";
import type { Subagents } from "./SubagentTracker.js";
const pane = (kind = "codex") => ({ id: "pane", agent: { kind, instanceId: "instance", subagents: undefined }, agentSession: { kind, sessionId: "session" } }) as unknown as Pane;
function setup() {
  let current = pane();
  const reader = { read: vi.fn(async (): Promise<Subagents | undefined> => undefined), forget: vi.fn(), close: vi.fn() };
  const publish = vi.fn((id: string, value: Subagents | undefined) => { if (current.agent) { const next = { ...current.agent }; if (value === undefined) delete next.subagents; else next.subagents = value; current.agent = next; } return true; });
  const dispose = vi.fn(), subscribe = vi.fn(() => ({ dispose }));
  const verified = vi.fn(() => true);
  const service = new NativeSubagentService({ session: { snapshot: () => ({ panes: [current] }), getPane: () => current, setAgentSubagents: publish, hasVerifiedAgentSession: verified }, bus: { subscribe }, reader });
  return { service, reader, publish, verified, set: (value: Pane) => { current = value; }, get: () => current, dispose };
}
describe("native activity publication", () => {
  it.each(["bob"])("keeps unsupported %s unknown rather than inventing a zero", async kind => {
    const f = setup(); f.set(pane(kind)); await f.service.refresh();
    expect(f.reader.read).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled(); f.service.close();
  });
  it("publishes AGY membership without disguising it as working and requires fresh verification", async () => {
    const f = setup(); f.set(pane("agy"));
    const value: Subagents = { count: 1, countBasis: "alive", items: [{ id: "child", state: "unknown", startedAt: 0 }] };
    f.reader.read.mockResolvedValue(value); await f.service.refresh();
    expect(f.publish).toHaveBeenLastCalledWith("pane", value);
    f.verified.mockReturnValue(false); await f.service.refresh();
    expect(f.publish).toHaveBeenLastCalledWith("pane", undefined);
    f.reader.read.mockClear(); await f.service.refresh(); expect(f.reader.read).not.toHaveBeenCalled(); f.service.close();
  });
  it("keeps unavailable undefined, publishes a known zero, and leaves Claude to its hook tracker", async () => {
    const f = setup(); await f.service.refresh(); expect(f.publish).not.toHaveBeenCalled();
    f.reader.read.mockResolvedValue({ count: 0, items: [] });
    await f.service.refresh(); expect(f.publish).toHaveBeenLastCalledWith("pane", { count: 0, items: [] });
    f.publish.mockClear(); f.set(pane("claude")); await f.service.refresh(); expect(f.publish).not.toHaveBeenCalled();
    f.service.close(); expect(f.reader.close).toHaveBeenCalledOnce(); expect(f.dispose).toHaveBeenCalledOnce();
  });
  it.each(["instance", "session", "kind", "close"])("rejects a late read across %s changes", async change => {
    const f = setup(); let resolve!: (value: { count: number; items: never[] }) => void;
    f.reader.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const reading = f.service.refresh();
    if (change === "instance") f.set({ ...f.get(), agent: { ...f.get().agent!, instanceId: "next-instance" } });
    if (change === "session") f.set({ ...f.get(), agentSession: { kind: "codex", sessionId: "next-session", reportedAt: 0 } });
    if (change === "kind") f.set(pane("muse"));
    if (change === "close") f.service.close();
    resolve({ count: 1, items: [] }); await reading;
    expect(f.publish).not.toHaveBeenCalled(); f.service.close();
  });
  it("removes previously known data when the session association or record becomes unavailable", async () => {
    const f = setup(); f.reader.read.mockResolvedValue({ count: 1, items: [] }); await f.service.refresh();
    f.reader.read.mockResolvedValue(undefined); await f.service.refresh();
    expect(f.publish).toHaveBeenLastCalledWith("pane", undefined);
    f.reader.read.mockResolvedValue({ count: 1, items: [] }); await f.service.refresh();
    f.set({ ...f.get(), agentSession: null }); await f.service.refresh();
    expect(f.publish).toHaveBeenLastCalledWith("pane", undefined); expect(f.reader.forget).toHaveBeenCalledWith("pane"); f.service.close();
  });
  it.each(["missing", "mismatched-kind", "different-session"])("invalidates owned same-instance values on %s without touching another instance", async change => {
    const f = setup(); f.reader.read.mockResolvedValue({ count: 1, items: [] }); await f.service.refresh();
    f.publish.mockClear();
    f.set({ ...f.get(), agentSession: change === "missing" ? null : { kind: change === "mismatched-kind" ? "muse" : "codex", sessionId: "another-session", reportedAt: 0 } });
    f.reader.read.mockResolvedValue(undefined); await f.service.refresh();
    expect(f.publish).toHaveBeenCalledWith("pane", undefined); f.service.close();
  });
  it("does not clear a different instance's data when an old source disappears", async () => {
    const f = setup(); f.reader.read.mockResolvedValue({ count: 1, items: [] }); await f.service.refresh();
    f.publish.mockClear(); f.set({ ...f.get(), agent: { ...f.get().agent!, instanceId: "other-instance", subagents: { count: 2, items: [] } }, agentSession: null });
    await f.service.refresh(); expect(f.publish).not.toHaveBeenCalled(); f.service.close();
  });
  it("does not attribute a preserved old session reference to a new unverified instance", async () => {
    const f = setup(); f.reader.read.mockResolvedValue({ count: 1, items: [] });
    f.set({ ...f.get(), agent: { ...f.get().agent!, instanceId: "new-instance" } });
    f.verified.mockReturnValue(false); await f.service.refresh();
    expect(f.reader.read).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
    f.set({ ...f.get(), agentSession: { kind: "codex", sessionId: "fresh-session", reportedAt: 0 } });
    f.verified.mockReturnValue(true); await f.service.refresh();
    expect(f.verified).toHaveBeenCalledWith("pane", "new-instance", "fresh-session");
    expect(f.publish).toHaveBeenCalledWith("pane", { count: 1, items: [] }); f.service.close();
  });
  it("checks fresh session verification again after a pending read", async () => {
    const f = setup(); let resolve!: (value: Subagents) => void;
    f.reader.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const reading = f.service.refresh(); f.verified.mockReturnValue(false);
    resolve({ count: 1, items: [] }); await reading;
    expect(f.publish).not.toHaveBeenCalled(); f.service.close();
  });
});
