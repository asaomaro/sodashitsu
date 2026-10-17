import { afterEach, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { DesktopAgentAccess, type AgentTarget, type AgentFrame } from "./DesktopAgentAccess.js";
const key = { kind: "key" as const, code: "KeyA", down: true };
function fixture() {
  let frame: AgentFrame = {
    info: { seq: 1, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
    image: new Uint8Array([1, 2, 3]),
    at: performance.now(),
  };
  const target: AgentTarget = {
    frame: () => frame,
    control: vi.fn(),
    state: vi.fn(),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
  };
  const api = new DesktopAgentAccess();
  return {
    api,
    target,
    setFrame: (f: Partial<AgentFrame>) => {
      frame = { ...frame, ...f };
    },
  };
}
afterEach(() => vi.restoreAllMocks());
it("requires a one-use viewer grant, binds a lease to one client and releases held inputs", async () => {
  const { api, target } = fixture();
  expect(() => api.attach("agent", "x".repeat(43))).toThrow();
  const grant = api.grant(target),
    lease = api.attach("agent", grant.ticket);
  expect(() => api.attach("agent", grant.ticket)).toThrow();
  expect(() => api.observe("other", lease.leaseId)).toThrow();
  const observed = api.observe("agent", lease.leaseId);
  expect(observed.imageBase64).toBe("AQID");
  expect(await api.act("agent", lease.leaseId, observed.observationId, [key])).toEqual({
    acknowledged: 1,
    afterFrameSeq: 1,
  });
  expect(target.releaseInputs).toHaveBeenCalledOnce();
  await expect(api.act("agent", lease.leaseId, observed.observationId, [key])).rejects.toThrow();
  api.clientGone("agent");
  expect(target.control).toHaveBeenLastCalledWith(false);
  expect(() => api.observe("agent", lease.leaseId)).toThrow();
});
it("accepts newer identical images but rejects changed, missing, or stale frames", async () => {
  const { api, target, setFrame } = fixture();
  const lease = api.attach("agent", api.grant(target).ticket);
  let observation = api.observe("agent", lease.leaseId);
  setFrame({
    info: { seq: 2, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
  });
  await api.act("agent", lease.leaseId, observation.observationId, [key]);
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 201);
  observation = api.observe("agent", lease.leaseId);
  setFrame({ image: new Uint8Array([9]) });
  await expect(api.act("agent", lease.leaseId, observation.observationId, [key])).rejects.toThrow(
    /changed/,
  );
  setFrame({ at: performance.now() - 3000 });
  expect(() => api.observe("agent", lease.leaseId)).toThrow(/Fresh/);
});
it("expires unclaimed tickets and active leases and revokes after an uncertain input failure", async () => {
  const { api, target } = fixture();
  const now = performance.now();
  const clock = vi.spyOn(performance, "now").mockReturnValue(now);
  const grant = api.grant(target);
  clock.mockReturnValue(now + 30001);
  api.tick();
  expect(() => api.attach("a", grant.ticket)).toThrow();
  const lease = api.attach("a", api.grant(target).ticket);
  clock.mockReturnValue(now + 150002);
  api.tick();
  expect(() => api.observe("a", lease.leaseId)).toThrow();
  clock.mockReturnValue(now);
  const second = api.attach("a", api.grant(target).ticket),
    observation = api.observe("a", second.leaseId);
  vi.mocked(target.input).mockRejectedValue(new Error("lost ACK"));
  await expect(api.act("a", second.leaseId, observation.observationId, [key])).rejects.toThrow(
    "lost ACK",
  );
  expect(() => api.observe("a", second.leaseId)).toThrow();
});
it("serializes actions and interrupts an in-flight sequence on human takeover", async () => {
  const { api, target } = fixture();
  let done = () => {};
  vi.mocked(target.input).mockImplementation(
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
  );
  const lease = api.attach("a", api.grant(target).ticket),
    observation = api.observe("a", lease.leaseId);
  const pending = api.act("a", lease.leaseId, observation.observationId, [key, key]);
  await expect(api.act("a", lease.leaseId, observation.observationId, [key])).rejects.toThrow(
    /progress/,
  );
  api.revoke(target);
  done();
  await expect(pending).rejects.toThrow();
  expect(target.input).toHaveBeenCalledTimes(1);
});
it("an interrupted old action cannot revoke a newly issued grant", async () => {
  const { api, target } = fixture();
  let done = () => {};
  vi.mocked(target.input).mockImplementation(
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
  );
  const lease = api.attach("a", api.grant(target).ticket),
    observation = api.observe("a", lease.leaseId);
  const old = api.act("a", lease.leaseId, observation.observationId, [key]);
  const next = api.grant(target);
  done();
  await expect(old).rejects.toThrow();
  expect(api.attach("b", next.ticket).leaseId).toHaveLength(43);
});
it("requires a post-action frame and bounds screenshot polling", () => {
  const { api, target, setFrame } = fixture(),
    lease = api.attach("a", api.grant(target).ticket);
  expect(() => api.observe("a", lease.leaseId, 1)).toThrow(/Wait/);
  api.observe("a", lease.leaseId);
  expect(() => api.observe("a", lease.leaseId)).toThrow(/five/);
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 201);
  setFrame({
    info: { seq: 2, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
  });
  expect(api.observe("a", lease.leaseId, 1).frameSeq).toBe(2);
});

it("serializes snapshot preparation and rechecks revocation after a pending keyframe", async () => {
  const { api, target } = fixture();
  let done = () => {};
  target.capture = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        done = resolve;
      }),
  );
  const lease = api.attach("a", api.grant(target).ticket);
  const observed = api.observe("a", lease.leaseId);
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 201);
  const pending = api.refresh("a", lease.leaseId, 1);
  await expect(api.refresh("a", lease.leaseId)).rejects.toThrow(/progress/);
  expect(() => api.observe("a", lease.leaseId)).toThrow(/progress/);
  await expect(api.act("a", lease.leaseId, observed.observationId, [key])).rejects.toThrow(
    /progress/,
  );
  const next = api.grant(target);
  done();
  await expect(pending).rejects.toThrow(/expired/);
  expect(api.attach("b", next.ticket).leaseId).toHaveLength(43);
  expect(target.input).not.toHaveBeenCalled();
});
