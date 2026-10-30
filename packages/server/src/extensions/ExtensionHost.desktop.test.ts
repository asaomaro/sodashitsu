import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { makeHost, ext, type HostHarness } from "./hostHarness.js";
import { DesktopAgentAccess, type AgentTarget } from "../desktop/DesktopAgentAccess.js";
let h: HostHarness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});
it("advertises only explicit desktop capability and routes a real app.call through a scoped human grant", async () => {
  const api = new DesktopAgentAccess(),
    paneId = randomUUID();
  const target: AgentTarget = {
    frame: () => ({
      info: { seq: 1, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
      image: new Uint8Array([1]),
      at: performance.now(),
    }),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
    state: vi.fn(),
    control: vi.fn(),
  };
  h = await makeHost({
    desktopAgents: api,
    panes: [paneId],
    tabPlugins: { w1: { extensionKey: "user:desktop-tools", display: "main" } },
  });
  await h.writeConfig([ext("desktop-tools", { allow: ["desktop-agent"] })]);
  await h.host.start();
  const child = h.children[0]!;
  expect(child.lines()[0]?.methods).toContain("desktop.agent.attach");
  child.say({
    id: "register",
    method: "app.register",
    params: {
      operations: [{ name: "attach", description: "attach", inputSchema: { type: "object" } }],
    },
  });
  await h.until(() => child.lines().some((l) => l.id === "register"));
  const ticket = api.grant(target).ticket;
  const call = h.host.pluginOperations.call({
    key: "user:desktop-tools",
    paneId,
    operation: "attach",
    params: { ticket },
  });
  await h.until(() => child.lines().some((l) => l.type === "app.call"));
  const event = child.lines().find((l) => l.type === "app.call")!;
  child.say({
    id: "attach",
    method: "desktop.agent.attach",
    params: { paneId: (event.target as { paneId: string }).paneId, ...(event.params as object) },
  });
  await h.until(() => child.lines().some((l) => l.id === "attach"));
  const result = child.lines().find((l) => l.id === "attach")!;
  expect(result.ok).toBe(true);
  child.say({
    method: "app.result",
    params: { callId: event.callId, ok: true, result: result.result },
  });
  await expect(call).resolves.toEqual({ result: result.result });
  const originalPane = h.panes.get(paneId)!;
  h.panes.delete(paneId);
  h.bus.publish({ event: "pane.closed", data: { paneId } });
  h.panes.set(paneId, originalPane);
  child.say({
    id: "closed-lease",
    method: "desktop.agent.observe",
    params: { paneId, leaseId: (result.result as { leaseId: string }).leaseId },
  });
  await h.until(() => child.lines().some((l) => l.id === "closed-lease"));
  expect(child.lines().find((l) => l.id === "closed-lease")).toMatchObject({ ok: false });
  await h.run(h.host.restart("user:desktop-tools"));
  expect(target.control).toHaveBeenLastCalledWith(false);
});
it("does not advertise or allow desktop calls without the dedicated capability", async () => {
  h = await makeHost({ desktopAgents: new DesktopAgentAccess() });
  await h.writeConfig([ext("desktop-tools")]);
  await h.host.start();
  const child = h.children[0]!;
  expect(child.lines()[0]?.methods).not.toContain("desktop.agent.attach");
  child.say({
    id: "denied",
    method: "desktop.agent.attach",
    params: { paneId: randomUUID(), ticket: "a".repeat(43) },
  });
  await h.until(() => child.lines().some((l) => l.id === "denied"));
  expect(child.lines().find((l) => l.id === "denied")).toMatchObject({ ok: false });
});
