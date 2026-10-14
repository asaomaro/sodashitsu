import { expect, it } from "vitest";
import type { CpuInfo } from "node:os";
import { cpuDelta, SystemResourceSampler } from "./SystemResources.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerServerMethods } from "./server.js";
import type { MethodDeps } from "./deps.js";
import type { ClientSink } from "../../terminal/OutputFanout.js";
const cpu = (idle: number, user: number) =>
  ({ times: { idle, user, nice: 0, sys: 0, irq: 0 } }) as CpuInfo;
it("measures interval CPU usage across all cores and rejects reset counters", () => {
  expect(cpuDelta([cpu(50, 50), cpu(50, 50)], [cpu(125, 75), cpu(125, 75)])).toBe(25);
  expect(cpuDelta([], [cpu(50, 50)])).toBeNull();
  expect(cpuDelta([cpu(50, 50)], [cpu(0, 50)])).toBeNull();
  expect(cpuDelta([cpu(50, 50)], [cpu(50, 50)])).toBeNull();
});
it("shares the cached sample without creating background timers", () => {
  const sampler = new SystemResourceSampler(),
    data = sampler.get();
  expect(sampler.get()).toBe(data);
  expect(data.cpuPercent).toBeNull();
  expect(data.memoryTotalBytes).toBeGreaterThan(0);
  expect(data.memoryAvailableBytes).toBeLessThanOrEqual(data.memoryTotalBytes);
  expect(data.serverRssBytes).toBeGreaterThan(0);
});
it("exposes resources through the authenticated RPC surface", async () => {
  const surface = new ControlSurface();
  let counts = { total: 2, states: { working: 1, idle: 1, blocked: 0, unknown: 0 } };
  registerServerMethods(surface, {
    session: { agentCounts: () => counts },
  } as unknown as MethodDeps);
  const response = await surface.invoke(
    { clientId: "c", sink: {} as ClientSink },
    "server.resources",
    {},
  );
  expect(response).toMatchObject({ ok: true, result: { cpuPercent: null, agents: counts } });
  counts = { total: 1, states: { working: 0, idle: 0, blocked: 1, unknown: 0 } };
  const next = await surface.invoke(
    { clientId: "c", sink: {} as ClientSink },
    "server.resources",
    {},
  );
  expect(next).toMatchObject({ ok: true, result: { agents: counts } });
});
