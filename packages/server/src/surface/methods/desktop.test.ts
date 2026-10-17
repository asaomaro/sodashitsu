import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import { registerDesktopMethods } from "./desktop.js";
import type { MethodDeps } from "./deps.js";
import { DesktopAgentAccess, type AgentTarget } from "../../desktop/DesktopAgentAccess.js";
import { performance } from "node:perf_hooks";
it("revokes a congested agent before encoding another screenshot", async () => {
  const api = new DesktopAgentAccess(),
    frame = vi.fn(() => ({
      info: {
        seq: 1,
        width: 1,
        height: 1,
        format: "image/png" as const,
        captureMs: 0,
        encodeMs: 0,
      },
      image: new Uint8Array([1]),
      at: performance.now(),
    }));
  const target: AgentTarget = {
    frame,
    control: vi.fn(),
    state: vi.fn(),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
  };
  const lease = api.attach("a", api.grant(target).ticket);
  const surface = new ControlSurface();
  registerDesktopMethods(surface, { desktopRelay: { agents: api } } as unknown as MethodDeps);
  const ctx = {
    clientId: "a",
    sink: { clientId: "a", bufferedAmount: 300000, sendOutput() {}, sendSnapshot() {} },
  };
  const result = await surface.invoke(ctx, "desktop.agent.observe", { leaseId: lease.leaseId });
  expect(result).toMatchObject({ ok: false, error: { code: "server_busy" } });
  expect(frame).not.toHaveBeenCalled();
  expect(() => api.observe("a", lease.leaseId)).toThrow(/lease/);
  expect(target.control).toHaveBeenLastCalledWith(false);
});
