import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import { loadCatalog, saveCatalog } from "./MachineCatalog.js";
vi.setConfig({ testTimeout: 30_000 });
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function boot() {
  const dir = await mkdtemp(join(tmpdir(), "soda-reverse-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  let active = true;
  const server = await composeServerOnFreePort({
    stateDir: dir,
    host: "127.0.0.1",
    shell: "/bin/bash",
    origin: [],
  });
  const stop = async () => {
    if (active) {
      active = false;
      await server.close();
    }
  };
  cleanup.push(stop);
  const origin = `http://127.0.0.1:${server.options.port}`;
  const res = await fetch(origin + "/api/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token: server.freshToken }),
  });
  expect(res.status).toBe(204);
  return { server, dir, origin, stop, cookie: res.headers.get("set-cookie")!.split(";")[0]! };
}
async function client(server: Awaited<ReturnType<typeof boot>>, machine?: string) {
  const ws = new WebSocket(
    server.origin.replace("http", "ws") + "/ws" + (machine ? "?machine=" + machine : ""),
    { headers: { origin: server.origin, cookie: server.cookie } },
  );
  await new Promise<void>((ok, fail) => {
    ws.once("open", ok);
    ws.once("error", fail);
  });
  cleanup.push(async () => {
    ws.terminate();
  });
  let seq = 0;
  const pending = new Map<string, (x: any) => void>();
  ws.on("message", (data, binary) => {
    if (binary) return;
    const r = JSON.parse(String(data));
    if (r.id) {
      pending.get(r.id)?.(r);
      pending.delete(r.id);
    }
  });
  const request = (method: string, params: unknown = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = String(++seq);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("timeout " + method));
      }, 5000);
      pending.set(id, (r) => {
        clearTimeout(timer);
        r.error ? reject(Object.assign(Error(r.error.message), r.error)) : resolve(r.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const hello = await request("client.hello", { protocol: 1, kind: "external" });
  return { ws, request, hello };
}
function rejected(url: string, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    ws.on("error", () => undefined);
    ws.once("unexpected-response", (_req, res) => {
      const code = res.statusCode!;
      res.resume();
      ws.terminate();
      resolve(code);
    });
    ws.once("open", () => {
      ws.terminate();
      reject(Error("unexpectedly accepted"));
    });
  });
}
it("outbound-only provider is listed/routed without SSH, permits operations, reconnects, and can be revoked from either end", async () => {
  const controller = await boot(),
    provider = await boot(),
    operator = await client(controller),
    owner = await client(provider);
  const grant = await operator.request("machine.invite", { label: "No inbound PC" });
  const url = controller.origin.replace("http", "ws") + "/machine-delegation";
  expect(
    await rejected(url, {
      authorization: "Bearer " + "x".repeat(43),
      "x-soda-machine-id": grant.machineId,
    }),
  ).toBe(401);
  expect(
    await rejected(url, {
      authorization: "Bearer " + grant.token,
      "x-soda-machine-id": grant.machineId,
      origin: controller.origin,
    }),
  ).toBe(403);
  const invalidUpgrade = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      controller.origin + "/machine-delegation",
      {
        headers: {
          upgrade: "websocket",
          connection: "Upgrade",
          "sec-websocket-version": "12",
          "sec-websocket-key": "MDEyMzQ1Njc4OWFiY2RlZg==",
          authorization: "Bearer " + grant.token,
          "x-soda-machine-id": grant.machineId,
        },
      },
      (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode!));
      },
    );
    req.once("error", reject);
    req.end();
  });
  expect(invalidUpgrade).toBe(400);
  await owner.request("machine.delegate", { url, machineId: grant.machineId, token: grant.token });
  await vi.waitFor(
    async () =>
      expect((await operator.request("machine.list")).machines).toContainEqual(
        expect.objectContaining({ id: grant.machineId, state: "online" }),
      ),
    { timeout: 10_000 },
  );
  const remote = await client(controller, grant.machineId);
  expect(remote.hello.snapshot.panes[0].id).toBe(owner.hello.snapshot.panes[0].id);
  expect(remote.hello.snapshot.panes[0].id).not.toBe(operator.hello.snapshot.panes[0].id);
  await remote.request("workspace.create", { label: "Delegated work", cwd: "/tmp" });
  const providerSnapshot = provider.server.session.snapshot();
  expect(JSON.stringify(providerSnapshot)).toContain("Delegated work");
  const list = await owner.request("machine.delegations");
  expect(list.delegations[0]).toMatchObject({ id: grant.machineId, state: "online" });
  expect(JSON.stringify(list)).not.toContain(grant.token);
  // Closing and resuming the controller's server-side machine transport forces real outbound reconnection.
  const catalog = await loadCatalog(controller.dir);
  if (catalog.kind !== "ok") throw Error("catalog");
  catalog.data.machines[0]!.enabled = false;
  await saveCatalog(controller.dir, catalog.data);
  await vi.waitFor(
    async () => expect((await operator.request("machine.list")).machines).toEqual([]),
    { timeout: 5000 },
  );
  catalog.data.machines[0]!.enabled = true;
  await saveCatalog(controller.dir, catalog.data);
  await vi.waitFor(
    async () => expect((await operator.request("machine.list")).machines[0]?.state).toBe("online"),
    { timeout: 10_000 },
  );
  await owner.request("machine.stop_delegation", { id: grant.machineId });
  expect((await owner.request("machine.delegations")).delegations).toEqual([]);
  await vi.waitFor(async () =>
    expect((await operator.request("machine.list")).machines[0]?.state).not.toBe("online"),
  );
  // Invitation credentials cannot authenticate as the operator on normal /ws.
  expect(
    await rejected(controller.origin.replace("http", "ws") + "/ws", {
      origin: controller.origin,
      authorization: "Bearer " + grant.token,
    }),
  ).toBe(401);
});

it("restores delegated providers after server replacement without another invitation", async () => {
  const controller = await boot(),
    provider = await boot(),
    operator = await client(controller),
    owner = await client(provider);
  const grant = await operator.request("machine.invite", { label: "Persistent PC" });
  await owner.request("machine.delegate", {
    url: controller.origin,
    machineId: grant.machineId,
    token: grant.token,
  });
  await vi.waitFor(
    async () => expect((await operator.request("machine.list")).machines[0]?.state).toBe("online"),
    { timeout: 10_000 },
  );
  await provider.stop();
  const restarted = await composeServerOnFreePort({
    stateDir: provider.dir,
    host: "127.0.0.1",
    shell: "/bin/bash",
    origin: [],
  });
  cleanup.push(() => restarted.close());
  await vi.waitFor(
    async () => expect((await operator.request("machine.list")).machines[0]?.state).toBe("online"),
    { timeout: 10_000 },
  );
  const remote = await client(controller, grant.machineId);
  expect(remote.hello.snapshot.workspaces[0].id).toBe(
    provider.server.session.snapshot().workspaces[0]!.id,
  );
});

it("pairs only after the provider supplies the operator-only code and preserves the existing invitation transport", async () => {
  const controller = await boot(),
    provider = await boot();
  const operator = await client(controller),
    owner = await client(provider);
  const events: any[] = [];
  operator.ws.on("message", (bytes, binary) => {
    if (!binary) {
      const e = JSON.parse(String(bytes));
      if (e.event === "machine.pairing") events.push(e);
    }
  });
  const pending = await owner.request("machine.request_delegation", {
    url: controller.origin,
    label: "Code exchange PC",
  });
  expect(pending).toMatchObject({ id: expect.any(String), expiresAt: expect.any(Number) });
  expect(JSON.stringify(pending)).not.toContain("code");
  expect((await operator.request("machine.list")).machines).toEqual([]);
  const requests = (await operator.request("machine.pairing_requests")).requests;
  expect(requests).toHaveLength(1);
  const code = requests[0].code;
  await vi.waitFor(() => expect(events[0]?.data.message).toContain(code));
  const wrong = code === "00000000" ? "11111111" : "00000000";
  await expect(
    owner.request("machine.confirm_delegation", { id: pending.id, code: wrong }),
  ).rejects.toThrow();
  expect((await operator.request("machine.list")).machines).toEqual([]);
  const started = await owner.request("machine.confirm_delegation", { id: pending.id, code });
  await vi.waitFor(
    async () =>
      expect((await operator.request("machine.list")).machines).toContainEqual(
        expect.objectContaining({ id: started.id, state: "online" }),
      ),
    { timeout: 10_000 },
  );
  await expect(
    owner.request("machine.confirm_delegation", { id: pending.id, code }),
  ).rejects.toThrow();
  await vi.waitFor(async () =>
    expect((await operator.request("machine.pairing_requests")).requests).toEqual([]),
  );
  await vi.waitFor(() => expect(events.some((e) => e.data.closed)).toBe(true));
  const remote = await client(controller, started.id);
  expect(remote.hello.snapshot.panes[0].id).toBe(owner.hello.snapshot.panes[0].id);
  await owner.request("machine.stop_delegation", { id: started.id });
});

it("rejects a code used on another request, closes after five guesses, and lets the operator refuse a request", async () => {
  const controller = await boot(),
    provider = await boot();
  const operator = await client(controller),
    owner = await client(provider);
  const first = await owner.request("machine.request_delegation", {
    url: controller.origin,
    label: "First PC",
  });
  const second = await owner.request("machine.request_delegation", {
    url: controller.origin,
    label: "Second PC",
  });
  const requests = (await operator.request("machine.pairing_requests")).requests;
  const firstCode = requests.find((r: any) => r.label === "First PC").code;
  const secondCode = requests.find((r: any) => r.label === "Second PC").code;
  expect(secondCode).not.toBe(firstCode);
  const wrong = secondCode === "00000000" ? "11111111" : "00000000";
  await expect(
    owner.request("machine.confirm_delegation", { id: second.id, code: firstCode }),
  ).rejects.toThrow();
  const attempts = 4;
  for (let n = 0; n < attempts; n++)
    await expect(
      owner.request("machine.confirm_delegation", { id: second.id, code: wrong }),
    ).rejects.toThrow();
  await expect(
    owner.request("machine.confirm_delegation", { id: second.id, code: secondCode }),
  ).rejects.toThrow();
  await operator.request("machine.reject_pairing", {
    id: requests.find((r: any) => r.label === "First PC").id,
  });
  await expect(
    owner.request("machine.confirm_delegation", { id: first.id, code: firstCode }),
  ).rejects.toThrow();
  expect((await operator.request("machine.list")).machines).toEqual([]);
});

it("registers SSH connections through authenticated RPC and persists their settings", async () => {
  const host = await boot(),
    control = await client(host);
  const added = await control.request("machine.add", {
    label: "Local test SSH",
    target: "ssh://127.0.0.1:1",
    session: "work",
  });
  expect((await control.request("machine.connections")).connections).toContainEqual(
    expect.objectContaining({
      id: added.id,
      label: "Local test SSH",
      transport: "ssh",
      enabled: true,
    }),
  );
  await expect(
    control.request("machine.add", { label: "Bad", target: "-oProxyCommand=bad" }),
  ).rejects.toMatchObject({ code: "invalid_params" });
  await expect(
    control.request("machine.add", { label: "Local test SSH", target: "host" }),
  ).rejects.toMatchObject({ code: "invalid_params" });
  expect((await control.request("machine.connections")).connections).toHaveLength(1);
  const persisted = await loadCatalog(host.dir);
  expect(persisted.kind).toBe("ok");
  if (persisted.kind === "ok")
    expect(persisted.data.machines[0]).toMatchObject({
      id: added.id,
      target: "ssh://127.0.0.1:1",
      session: "work",
    });
});
