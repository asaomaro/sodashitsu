import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterEach, expect, it, vi } from "vitest";
import type { ExtLine, ExtPane } from "@sodashitsu/protocol";
import { DesktopAgentAccess, type AgentTarget } from "../desktop/DesktopAgentAccess.js";
import { ExtensionDesktopAgents } from "./ExtensionDesktopAgents.js";
import type { ApiExtension } from "./ExtensionApi.js";
const keyInput = { kind: "key", code: "KeyA", down: true };
const owned: Array<() => void> = [];
afterEach(() => {
  for (const close of owned.splice(0)) close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture() {
  const api = new DesktopAgentAccess();
  const ext: ApiExtension = {
    key: "user:desktop-tools",
    id: "desktop-tools",
    scope: "user",
    root: null,
    runId: randomUUID(),
    tag: "test",
    allow: ["desktop-agent"],
    onUnresponsive: "pass",
  };
  const pane: ExtPane = {
    id: randomUUID(),
    tabId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceLabel: "work",
    workspaceCwd: "/work",
    projectDir: "/work",
    label: "plugin",
    agent: null,
    plugin: { extensionKey: ext.key, display: "main" },
  };
  let live = true;
  let image: Uint8Array = new Uint8Array([1, 2, 3]);
  const replies: ExtLine[] = [];
  const target: AgentTarget = {
    frame: () => ({
      info: { seq: 1, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
      image,
      at: performance.now(),
    }),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
    control: vi.fn(),
    state: vi.fn(),
  };
  const panes = [pane];
  const runtime = () =>
    live
      ? {
          ext,
          panes,
          send: (line: ExtLine) => {
            replies.push(line);
          },
        }
      : undefined;
  const bridge = new ExtensionDesktopAgents(api, runtime);
  owned.push(() => bridge.stopped(ext.key, ext.runId));
  let n = 0;
  const begin = (method: string, params: Record<string, unknown>) => {
    const id = String(++n);
    bridge.handle(ext.key, ext.runId, { id, method, params });
    return id;
  };
  const response = async (id: string) => {
    await vi.waitFor(() =>
      expect(replies.some((r) => r.type === "ext.result" && r.id === id)).toBe(true),
    );
    return replies.find((r) => r.type === "ext.result" && r.id === id) as Extract<
      ExtLine,
      { type: "ext.result" }
    >;
  };
  const call = async (method: string, params: unknown) =>
    response(begin(method, { paneId: pane.id, ...(params as object) }));
  const claim = async () => {
    const { ticket } = api.grant(target);
    const result = await call("desktop.agent.attach", { ticket });
    expect(result.ok).toBe(true);
    return (result as { result: { leaseId: string } }).result.leaseId;
  };
  return {
    api,
    bridge,
    ext,
    pane,
    panes,
    target,
    replies,
    begin,
    response,
    call,
    claim,
    live: (value: boolean) => {
      live = value;
    },
    image: (value: Uint8Array) => {
      image = value;
    },
  };
}
it("requires both an explicit plugin capability and an actual one-use human grant", async () => {
  const f = fixture(),
    { ticket } = f.api.grant(f.target);
  f.ext.allow = [];
  expect((await f.call("desktop.agent.attach", { ticket })).ok).toBe(false);
  f.ext.allow = ["desktop-agent"];
  const attached = await f.call("desktop.agent.attach", { ticket });
  expect(attached.ok).toBe(true);
  expect((await f.call("desktop.agent.attach", { ticket })).ok).toBe(false);
});
it("observes and acts through existing frame guards without minting grants or settings access", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  const observed = await f.call("desktop.agent.observe", { leaseId });
  expect(observed.ok).toBe(true);
  const value = (observed as { result: { observationId: string; imageBase64: string } }).result;
  expect(value.imageBase64).toBe("AQID");
  expect(
    (
      await f.call("desktop.agent.act", {
        leaseId,
        observationId: value.observationId,
        inputs: [keyInput],
      })
    ).ok,
  ).toBe(true);
  expect(f.target.input).toHaveBeenCalledOnce();
  expect(
    (
      await f.call("desktop.agent.act", {
        leaseId,
        observationId: value.observationId,
        inputs: [keyInput],
      })
    ).ok,
  ).toBe(false);
  expect(
    f.bridge.handle(f.ext.key, f.ext.runId, {
      id: "unrelated",
      method: "desktop.start",
      params: {},
    }),
  ).toBe(false);
});
it("rejects foreign and unattached panes without consuming the human grant", async () => {
  const f = fixture(),
    { ticket } = f.api.grant(f.target);
  expect((await f.call("desktop.agent.attach", { paneId: randomUUID(), ticket })).ok).toBe(false);
  delete f.pane.plugin;
  expect((await f.call("desktop.agent.attach", { ticket })).ok).toBe(false);
  expect(() => f.api.attach("original-owner", ticket)).not.toThrow();
  f.api.clientGone("original-owner");
});
it("does not let one plugin run borrow another run's lease", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  f.ext.runId = randomUUID();
  expect((await f.call("desktop.agent.observe", { leaseId })).ok).toBe(false);
  expect(f.target.control).toHaveBeenLastCalledWith(false);
});
it("revokes immediately on scope removal and does not revive when the same view is reattached", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  const plugin = f.pane.plugin;
  delete f.pane.plugin;
  f.bridge.review();
  f.pane.plugin = plugin!;
  expect((await f.call("desktop.agent.observe", { leaseId })).ok).toBe(false);
  expect(f.target.control).toHaveBeenLastCalledWith(false);
});
it("pins project, cwd and tab during a delayed capture and discards the image", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  let finish!: () => void;
  f.target.capture = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const id = f.begin("desktop.agent.observe", { paneId: f.pane.id, leaseId });
  f.pane.workspaceCwd = "/replacement";
  f.bridge.review();
  finish();
  expect((await f.response(id)).ok).toBe(false);
  expect(f.replies.filter((r) => r.type === "ext.result" && r.id === id)).toHaveLength(1);
  expect(f.target.control).toHaveBeenLastCalledWith(false);
});
it("rechecks the plugin lifetime between queued actions and releases all held input", async () => {
  const f = fixture(),
    leaseId = await f.claim(),
    observation = (await f.call("desktop.agent.observe", { leaseId })) as {
      result: { observationId: string };
    };
  let finish!: () => void;
  vi.mocked(f.target.input).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const id = f.begin("desktop.agent.act", {
    paneId: f.pane.id,
    leaseId,
    observationId: observation.result.observationId,
    inputs: [keyInput, keyInput],
  });
  f.bridge.stopped(f.ext.key, f.ext.runId);
  finish();
  expect((await f.response(id)).ok).toBe(false);
  expect(f.target.input).toHaveBeenCalledTimes(1);
  expect(f.target.releaseInputs).toHaveBeenCalled();
});
it("keeps the observation size limit before allocating base64 and permits a later smaller frame", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  const oversized = new Uint8Array(3 * 1024 * 1024);
  f.image(oversized);
  const encoding = vi.spyOn(Buffer, "from");
  const result = await f.call("desktop.agent.observe", { leaseId });
  expect(result).toMatchObject({ ok: false, error: { code: "server_busy" } });
  expect(encoding.mock.calls.filter((call) => (call as unknown[])[0] === oversized)).toHaveLength(
    0,
  );
  f.image(new Uint8Array([1]));
  expect((await f.call("desktop.agent.observe", { leaseId })).ok).toBe(true);
});
it("expires requests on monotonic time even before timer callbacks run", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  const now = performance.now();
  vi.spyOn(performance, "now").mockReturnValue(now + 120001);
  expect((await f.call("desktop.agent.observe", { leaseId })).ok).toBe(false);
  expect(f.target.control).toHaveBeenLastCalledWith(false);
});
it("bounds sixteen physical captures across timeout and leaves rejected grants unused", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    finishers: Array<() => void> = [];
  const leases: Array<{ paneId: string; leaseId: string }> = [];
  for (let i = 0; i < 16; i++) {
    const pane = { ...f.pane, id: randomUUID() };
    f.panes.push(pane);
    const target = {
      ...f.target,
      capture: () => new Promise<void>((resolve) => finishers.push(resolve)),
    };
    const ticket = f.api.grant(target).ticket,
      id = f.begin("desktop.agent.attach", { paneId: pane.id, ticket });
    const reply = f.replies.find((r) => r.type === "ext.result" && r.id === id) as {
      ok: boolean;
      result: { leaseId: string };
    };
    expect(reply.ok).toBe(true);
    leases.push({ paneId: pane.id, leaseId: reply.result.leaseId });
    f.begin("desktop.agent.observe", { paneId: pane.id, leaseId: reply.result.leaseId });
  }
  expect(finishers).toHaveLength(16);
  const releaseId = f.begin("desktop.agent.release", leases[0]!);
  expect(f.replies.find((r) => r.type === "ext.result" && r.id === releaseId)).toMatchObject({
    ok: true,
    result: { released: true },
  });
  await vi.advanceTimersByTimeAsync(20000);
  const { ticket } = f.api.grant(f.target),
    id = f.begin("desktop.agent.attach", { paneId: f.pane.id, ticket });
  expect(f.replies.find((r) => r.type === "ext.result" && r.id === id)).toMatchObject({
    ok: false,
    error: { code: "server_busy" },
  });
  expect(() => f.api.attach("unused-control", ticket)).not.toThrow();
  f.api.clientGone("unused-control");
  for (const finish of finishers) finish();
  await Promise.resolve();
  await Promise.resolve();
  const fresh = f.api.grant(f.target).ticket,
    freshId = f.begin("desktop.agent.attach", { paneId: f.pane.id, ticket: fresh });
  expect(f.replies.find((r) => r.type === "ext.result" && r.id === freshId)).toMatchObject({
    ok: true,
  });
});
it("never accepts or consumes a recipient-bound encrypted grant on this ordinary host API", async () => {
  const f = fixture(),
    fingerprint = "a".repeat(64),
    { ticket } = f.api.grant(f.target, { fingerprint, active: () => true });
  expect((await f.call("desktop.agent.attach", { ticket })).ok).toBe(false);
  expect(() => f.api.attachRecipient("encrypted-owner", ticket, fingerprint)).not.toThrow();
  f.api.clientGone("encrypted-owner");
});

it.each(["project", "deadline"] as const)(
  "rechecks %s before the second input without an explicit review callback",
  async (kind) => {
    const f = fixture(),
      leaseId = await f.claim();
    const observation = (await f.call("desktop.agent.observe", { leaseId })) as {
      result: { observationId: string };
    };
    vi.mocked(f.target.input).mockImplementation(async () => {
      if (kind === "project") f.pane.projectDir = "/changed";
      else vi.spyOn(performance, "now").mockReturnValue(performance.now() + 20001);
    });
    const result = await f.call("desktop.agent.act", {
      leaseId,
      observationId: observation.result.observationId,
      inputs: [keyInput, keyInput],
    });
    expect(result.ok).toBe(false);
    expect(f.target.input).toHaveBeenCalledTimes(1);
    expect(f.target.control).toHaveBeenLastCalledWith(false);
  },
);

it("releases a pending capture immediately and fences its late completion from a fresh grant", async () => {
  const f = fixture(),
    leaseId = await f.claim();
  let finish!: () => void;
  f.target.capture = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const oldId = f.begin("desktop.agent.observe", { paneId: f.pane.id, leaseId });
  expect((await f.call("desktop.agent.release", { leaseId })).ok).toBe(true);
  const fresh = await f.claim();
  f.target.capture = async () => {};
  finish();
  await Promise.resolve();
  await Promise.resolve();
  expect((await f.response(oldId)).ok).toBe(false);
  expect(f.replies.filter((r) => r.type === "ext.result" && r.id === oldId)).toHaveLength(1);
  expect((await f.call("desktop.agent.observe", { leaseId: fresh })).ok).toBe(true);
});
