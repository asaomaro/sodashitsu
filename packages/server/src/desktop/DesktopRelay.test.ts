import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import WebSocket from "ws";
import type { AuthService } from "../auth/AuthService.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { LinkChannel, MachineLink } from "../machine/MachineLink.js";
import { DesktopRelay } from "./DesktopRelay.js";
import { DesktopProvider, desktopConfigFromEnv } from "./DesktopProvider.js";
import { decodeDesktopFrame } from "@sodashitsu/protocol";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
const helper = fileURLToPath(
  new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
);
async function fixture(allowInput = true, legacy = false, configured = true, secure = false, unlockAllowed = true) {
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-test-")),
    record = join(dir, "inputs.jsonl");
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const web = createServer();
  await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(web.address() as AddressInfo).port}`,
    endpoint = origin.replace("http", "ws") + "/desktop-share";
  const provider = new DesktopProvider(configured ? {
    command: [process.execPath, helper, "--allow-input", "--record", record, ...(secure ? ["--secure"] : [])],
    allowInput,
    allowUnlock: unlockAllowed,
    origins: () => [origin],
  } : undefined);
  let revoke: (id: string) => void = () => undefined;
  const auth = {
    authorizeUpgrade: async (req: { headers: Record<string, string> }) =>
      req.headers.cookie === "test=ok" ? { ok: true, sessionId: "ok" } : { ok: false },
    verifySession: (id: string) => id === "ok",
    onSessionRevoked: (f: typeof revoke) => {
      revoke = f;
      return { dispose() {} };
    },
  } as unknown as AuthService;
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const origins = new OriginRejectionLog(logger, {
    isAllowed: (o, h) => o === origin && h === new URL(origin).host,
    isHostAllowed: () => true,
    allowedHostPorts: () => [new URL(origin).host],
  });
  let closed = 0,
    starts = 0, providerStartCalls = 0;
  const link = {
    openChannel() {
      const owner = `channel-${starts++}`;
      let onText: (s: string) => void = () => undefined,
        onClose: () => void = () => undefined,
        ended = false;
      const channel = {
        onText(f: typeof onText) {
          onText = f;
        },
        onBinary() {},
        onClose(f: typeof onClose) {
          onClose = f;
        },
        sendText(text: string) {
          const m = JSON.parse(text);
          void (async () => {
            try {
              const result =
                m.method === "client.hello"
                  ? {}
                  : m.method === "desktop.capabilities"
                    ? legacy
                      ? { available: true, allowInput }
                      : provider.capabilities()
                    : (providerStartCalls++, await provider.start(owner, m.params));
              onText(JSON.stringify({ id: m.id, result }));
            } catch {
              onText(JSON.stringify({ id: m.id, error: { message: "denied" } }));
            }
          })();
        },
        close() {
          if (ended) return;
          ended = true;
          closed++;
          provider.clientGone(owner);
          onClose();
        },
      };
      return channel as unknown as LinkChannel;
    },
  } as unknown as MachineLink;
  const relay = new DesktopRelay(auth, origins, {
    route: (id) => (id === "remote" ? { kind: "ok", link } : { kind: "unknown" }),
  });
  web.on("upgrade", (req, socket, head) => {
    void relay.upgrade(req, socket, head);
  });
  cleanup.push(async () => {
    relay.dispose();
    provider.dispose();
    await new Promise<void>((r) => web.close(() => r()));
  });
  async function viewer() {
    const ws = new WebSocket(endpoint, { headers: { cookie: "test=ok", origin } });
    const messages: Record<string, unknown>[] = [],
      frames: Uint8Array[] = [];
    ws.on("error", () => undefined);
    ws.on("message", (bytes, binary) => {
      if (binary) frames.push(new Uint8Array(bytes as Buffer));
      else messages.push(JSON.parse(bytes.toString()));
    });
    await new Promise<void>((r, reject) => {
      ws.once("open", r);
      ws.once("error", reject);
    });
    return {
      ws,
      messages,
      frames,
      send(value: unknown) {
        ws.send(JSON.stringify(value));
      },
    };
  }
  return {
    viewer,
    provider,
    endpoint,
    origin,
    record,
    revoke: () => revoke("ok"),
    closed: () => closed,
    providerStartCalls: () => providerStartCalls,
  };
}
const start = { type: "start", machineId: "remote", options: { width: 320, fps: 10, quality: 65 } };
it("explains missing provider setup before trying to start a helper", async () => {
  const f = await fixture(true, false, false), viewer = await f.viewer();
  viewer.send(start);
  await expect.poll(() => viewer.messages.find(m => m.type === "error")?.message).toContain("soda serve --desktop");
  expect(viewer.messages.find(m => m.type === "error")?.message).toContain("接続先PC");
  expect(viewer.frames).toHaveLength(0);
  expect(f.providerStartCalls()).toBe(0);
  await expect.poll(() => viewer.ws.readyState).toBe(WebSocket.CLOSED);
});
it("automatically connects B to A, isolates viewers and enforces both input permissions", async () => {
  const f = await fixture(),
    a = await f.viewer(),
    other = await f.viewer();
  a.send(start);
  await expect.poll(() => a.frames.length).toBe(1);
  expect(a.messages).toContainEqual(
    expect.objectContaining({ type: "ready", backend: "synthetic" }),
  );
  expect(a.messages.find((m) => m.type === "ready")).not.toHaveProperty("image");
  expect(other.frames).toHaveLength(0);
  expect(other.messages).toHaveLength(0);
  const frame = decodeDesktopFrame(a.frames[0]!).info;
  const text = {
    type: "input",
    seq: 1,
    frameSeq: frame.seq,
    input: { kind: "text", text: "日本語" },
  };
  a.send(text);
  a.send({ type: "control", enabled: true });
  await expect.poll(() => a.messages.some((m) => m.type === "control" && m.enabled)).toBe(true);
  other.send({ ...text, seq: 2 });
  a.send({ ...text, seq: 3 });
  await expect.poll(() => a.messages.some((m) => m.type === "input_ack" && m.seq === 3)).toBe(true);
  expect((await readFile(f.record, "utf8")).trim()).toBe(JSON.stringify(text.input));
  a.send({ type: "ack", seq: frame.seq });
  await expect.poll(() => a.frames.length).toBeGreaterThan(1);
  expect(a.messages).toContainEqual(expect.objectContaining({ type: "stats" }));
  f.revoke();
  await expect.poll(() => a.ws.readyState).toBe(WebSocket.CLOSED);
  expect(f.closed()).toBe(1);
  other.ws.close();
});
it("refuses control when B is readonly and closes an unacknowledged share", async () => {
  const f = await fixture(false),
    a = await f.viewer();
  a.send(start);
  await expect.poll(() => a.frames.length).toBe(1);
  a.send({ type: "control", enabled: true });
  await expect
    .poll(() => a.messages.some((m) => m.type === "control" && m.enabled === false))
    .toBe(true);
  a.send({ type: "input", seq: 1, frameSeq: 1, input: { kind: "text", text: "DENIED" } });
  a.send({ type: "heartbeat" });
  await expect.poll(() => a.ws.readyState, { timeout: 8000 }).toBe(WebSocket.CLOSED);
  await expect(readFile(f.record, "utf8")).rejects.toThrow();
}, 12000);
it("rejects unauthenticated viewers, wrong Origins, unused tickets and unexpected ACKs", async () => {
  const f = await fixture();
  for (const headers of [
    { origin: f.origin },
    { origin: "https://evil.test", cookie: "test=ok" },
  ]) {
    const ws = new WebSocket(f.endpoint, { headers });
    await expect(
      new Promise((r, reject) => {
        ws.once("open", r);
        ws.once("error", reject);
      }),
    ).rejects.toThrow();
  }
  const provider = new WebSocket(f.endpoint);
  provider.on("error", () => undefined);
  await new Promise<void>((r) => provider.once("open", r));
  provider.send(JSON.stringify({ type: "provider", ticket: "x".repeat(43) }));
  await expect.poll(() => provider.readyState).toBe(WebSocket.CLOSED);
  const a = await f.viewer();
  a.send(start);
  await expect.poll(() => a.frames.length).toBe(1);
  a.send({ type: "ack", seq: 999 });
  await expect.poll(() => a.ws.readyState).toBe(WebSocket.CLOSED);
});
it("keeps command/origin policy local and refuses arbitrary relay addresses before spawning", async () => {
  const cfg = desktopConfigFromEnv(
    {
      SODA_DESKTOP_COMMAND: JSON.stringify([process.execPath, helper]),
      SODA_DESKTOP_ORIGINS: "https://allowed.test",
    },
    () => [],
  );
  expect(cfg?.allowInput).toBe(false);
  const p = new DesktopProvider(cfg);
  cleanup.push(async () => p.dispose());
  for (const url of [
    "ws://192.168.1.2/desktop-share",
    "wss://untrusted.test/desktop-share",
    "wss://allowed.test/other",
    "wss://user:pass@allowed.test/desktop-share",
    "wss://allowed.test/desktop-share?q=secret",
  ])
    await expect(
      p.start("owner", { url, ticket: "x".repeat(43), options: start.options }),
    ).rejects.toThrow();
  expect(desktopConfigFromEnv({ SODA_DESKTOP_COMMAND: '["sh",null]' }, () => [])).toBeUndefined();
});

it("negotiates defaults with an old B and refuses unsupported reduced colors", async () => {
  const defaults = await fixture(true, true),
    a = await defaults.viewer();
  a.send({
    ...start,
    options: { ...start.options, deltas: true, image: { colorMode: "full", showCursor: true } },
  });
  await expect.poll(() => a.frames.length).toBe(1);
  expect(a.messages).toContainEqual(expect.objectContaining({ type: "ready" }));
  a.ws.close();
  const reduced = await fixture(true, true),
    b = await reduced.viewer();
  b.send({
    ...start,
    options: { ...start.options, image: { colorMode: "rgb332", showCursor: true } },
  });
  await expect.poll(() => b.ws.readyState).toBe(WebSocket.CLOSED);
  expect(b.frames).toHaveLength(0);
  expect(b.messages).toContainEqual(expect.objectContaining({ type: "error" }));
});

it("allows a fresh share after handoff cleanup is rolled back", async () => {
  const f = await fixture(),
    first = await f.viewer();
  first.send(start);
  await expect.poll(() => first.frames.length, { timeout: 5000 }).toBe(1);
  f.provider.dispose(); // composeServer.closeClients uses this before a handoff attempt.
  await expect.poll(() => first.ws.readyState, { timeout: 5000 }).toBe(WebSocket.CLOSED);
  const resumed = await f.viewer(); // composeServer.reopenClients reuses the original instance.
  resumed.send(start);
  await expect
    .poll(() => resumed.frames.length > 0 || resumed.ws.readyState === WebSocket.CLOSED, {
      timeout: 5000,
    })
    .toBe(true);
  expect(resumed.frames).toHaveLength(1);
  expect(resumed.messages).toContainEqual(expect.objectContaining({ type: "ready" }));
  resumed.ws.close();
}, 10000);

it("stops an active synthetic share immediately when local permissions are revoked", async () => {
  const f = await fixture(), viewer = await f.viewer();
  viewer.send(start);
  await expect.poll(() => viewer.frames.length).toBe(1);
  f.provider.configure(undefined);
  await expect.poll(() => viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(f.provider.capabilities().available).toBe(false);
});


it("never grants agent access on a lock screen and closes the old generation when unlocked", async () => {
  const f=await fixture(true,false,true,true), viewer=await f.viewer();
  viewer.send({...start,options:{...start.options,features:true}});
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  expect(viewer.messages.find(m=>m.type==="ready")).toMatchObject({secureDesktop:true,allowClipboard:false,allowMedia:false});
  viewer.send({type:"agent_grant",enabled:true});
  viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").at(-1)?.enabled).toBe(true);
  expect(viewer.messages.some(m=>m.type==="agent_ticket")).toBe(false);
  viewer.send({type:"sas"});
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.some(m=>m.type==="session_unlocked")).toBe(true);
});
it("rejects a source which advertises a lock screen without the local unlock ceiling", async () => {
  const f=await fixture(true,false,true,true,false), viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.frames).toHaveLength(0);
  expect(viewer.messages.some(m=>m.type==="ready")).toBe(false);
});
