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

it("allows permission changes only through the local-settings connection, never bridges or sameMachine alone", async () => {
  const surface = new ControlSurface(), set = vi.fn(async p => ({ permissions: p, supported: true, canConfigure: true }));
  registerDesktopMethods(surface, { desktopSettings: { set, get: vi.fn() } } as unknown as MethodDeps);
  const base = { clientId: "local", sink: { clientId: "local", bufferedAmount: 0, sendOutput() {}, sendSnapshot() {} } };
  const p = { enabled: true, allowInput: true, allowClipboard: false, allowDisplayResize: false };
  for (const ctx of [base, { ...base, sameMachine: true }, { ...base, connection: { localSettings: false } }]) {
    const result = await surface.invoke(ctx as Parameters<typeof surface.invoke>[0], "desktop.settings.set", p);
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  }
  expect(set).not.toHaveBeenCalled();
  const result = await surface.invoke({ ...base, connection: { localSettings: true } } as unknown as Parameters<typeof surface.invoke>[0], "desktop.settings.set", p);
  expect(result.ok).toBe(true); expect(set).toHaveBeenCalledWith(p);
});
