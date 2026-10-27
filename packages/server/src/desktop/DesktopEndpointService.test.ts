import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DesktopOptions } from "@sodashitsu/protocol";
import {
  DesktopEndpointIdentity,
  DesktopEndpointHandshake,
} from "@sodashitsu/client-core/desktop/DesktopE2e";
import { DesktopProvider } from "./DesktopProvider.js";
import { DesktopEndpointStore } from "./DesktopEndpointStore.js";
import { desktopSecretProtector, type DesktopSecretProtector } from "./DesktopEndpointProtector.js";
import { DesktopEndpointService } from "./DesktopEndpointService.js";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture(options: { activate?: boolean; protector?: DesktopSecretProtector } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "soda-endpoint-owner-"));
  const storeOptions = {
    stateDir: directory,
    ...(process.platform === "win32"
      ? {
          platform: "win32" as const,
          protector: { ...desktopSecretProtector("linux"), mode: "dpapi-user" as const },
          checkWindowsPath: async () => {},
          commitWindowsVault: rename,
        }
      : {}),
    ...(options.protector ? { protector: options.protector } : {}),
  };
  if (process.platform === "win32" && storeOptions.protector?.mode === "owner-file")
    storeOptions.protector = { ...storeOptions.protector, mode: "dpapi-user" };
  const provider = new DesktopProvider({
      command: [process.execPath, "--version"],
      allowInput: true,
      origins: () => [],
    }),
    store = new DesktopEndpointStore(storeOptions),
    service = new DesktopEndpointService({
      stateDir: directory,
      provider,
      store,
      origins: () => ["https://allowed.example"],
    });
  cleanup.push(async () => {
    await service.close();
    provider.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  if (options.activate !== false) await service.activate();
  return { directory, provider, store, service, storeOptions };
}
it("does not read or create keys before the state-directory owner activates it", async () => {
  const f = await fixture({ activate: false });
  expect(await readdir(f.directory)).toEqual([]);
  await expect(f.service.status()).rejects.toThrow();
  await f.service.activate();
  expect(await f.service.status()).toEqual({
    available: true,
    initialized: false,
    required: false,
    peers: [],
  });
  expect(await readdir(f.directory)).toEqual([]);
});
it("persists required across owner replacement and never revives suspended ownership", async () => {
  const f = await fixture(),
    first = await f.service.initialize();
  await f.service.setRequired(true);
  expect(f.provider.capabilities().endpointRequired).toBe(true);
  f.service.suspend();
  await expect(f.service.status()).rejects.toThrow();
  await f.service.prepareHandoff();
  f.service.resume();
  expect((await f.service.status()).fingerprint).toBe(first.fingerprint);
  await f.service.close();
  const provider = new DesktopProvider(undefined),
    next = new DesktopEndpointService({
      stateDir: f.directory,
      provider,
      store: new DesktopEndpointStore(f.storeOptions),
      origins: () => [],
    });
  try {
    await next.activate();
    expect(await next.status()).toMatchObject({
      initialized: true,
      required: true,
      fingerprint: first.fingerprint,
    });
    expect(provider.capabilities().endpointRequired).toBe(true);
  } finally {
    await next.close();
    provider.dispose();
  }
});
it("fails closed when a previously initialized directory survives missing vault and marker", async () => {
  const f = await fixture();
  await f.service.initialize();
  await f.service.setRequired(true);
  await f.service.close();
  await rm(join(f.store.directory, "identity.json"));
  await rm(join(f.directory, "desktop-endpoint-required.json"));
  const provider = new DesktopProvider({
      command: [process.execPath, "--version"],
      allowInput: true,
      origins: () => [],
    }),
    next = new DesktopEndpointService({
      stateDir: f.directory,
      provider,
      store: new DesktopEndpointStore(f.storeOptions),
      origins: () => [],
    });
  try {
    await next.activate();
    expect(await next.status()).toMatchObject({
      available: false,
      initialized: false,
      required: true,
    });
    await expect(
      provider.start("legacy", {
        url: "ws://127.0.0.1:9/desktop-share",
        ticket: "a".repeat(43),
        options: DesktopOptions.parse({}),
      }),
    ).rejects.toThrow("Authenticated");
  } finally {
    await next.close();
    provider.dispose();
  }
});
it("does not let a concurrent status read reopen plaintext before policy persistence starts", async () => {
  const f = await fixture();
  await f.service.initialize();
  const begun = deferred(),
    release = deferred(),
    original = f.store.setRequired.bind(f.store),
    spy = vi.spyOn(f.store, "setRequired").mockImplementation(async (required) => {
      begun.resolve();
      await release.promise;
      return original(required);
    });
  const saving = f.service.setRequired(true);
  try {
    await begun.promise;
    expect(await f.service.status()).toMatchObject({ required: true });
    expect(f.provider.capabilities().endpointRequired).toBe(true);
  } finally {
    release.resolve();
    await saving;
    spy.mockRestore();
  }
  expect(await f.service.status()).toMatchObject({ required: true });
});
it("keeps the runtime guard after a failed policy save until an explicit successful change", async () => {
  const f = await fixture();
  await f.service.initialize();
  const save = vi
    .spyOn(f.store, "setRequired")
    .mockRejectedValue(Error("generated storage failure"));
  await expect(f.service.setRequired(true)).rejects.toThrow();
  save.mockRestore();
  expect(await f.service.status()).toMatchObject({ required: true });
  expect(f.provider.capabilities().endpointRequired).toBe(true);
  await f.service.setRequired(false);
  expect(await f.service.status()).toMatchObject({ required: false });
});
it("waits for an authorized key write before closing the old owner", async () => {
  const begun = deferred(),
    release = deferred(),
    plain = desktopSecretProtector("linux"),
    f = await fixture({
      protector: {
        ...plain,
        protect: async (bytes) => {
          begun.resolve();
          await release.promise;
          return new Uint8Array(bytes);
        },
      },
    });
  const initializing = f.service.initialize().catch((error) => error);
  await begun.promise;
  let done = false;
  const closing = f.service.close().then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  release.resolve();
  await closing;
  expect(done).toBe(true);
  expect(await initializing).toBeInstanceOf(Error);
  expect(await readFile(join(f.store.directory, "identity.json"), "utf8")).toContain('"version":1');
  await expect(f.service.status()).rejects.toThrow();
});
it("drains a pending policy save during handoff and resumes only the durable result", async () => {
  const begun = deferred(),
    release = deferred(),
    plain = desktopSecretProtector("linux");
  let armed = false;
  const f = await fixture({
    protector: {
      ...plain,
      protect: async (bytes) => {
        if (armed) {
          begun.resolve();
          await release.promise;
        }
        return new Uint8Array(bytes);
      },
    },
  });
  await f.service.initialize();
  await f.service.setRequired(true);
  armed = true;
  const saving = f.service.setRequired(false).catch((error) => error);
  await begun.promise;
  f.service.suspend();
  let finished = false;
  const prepared = f.service.prepareHandoff().then(() => {
    finished = true;
  });
  try {
    await Promise.resolve();
    expect(finished).toBe(false);
  } finally {
    release.resolve();
    await saving;
    await prepared;
  }
  f.service.resume();
  expect(await f.service.status()).toMatchObject({ required: false });
});
it("does not admit a delayed initialization after suspend and rollback changed the owner epoch", async () => {
  const f = await fixture(),
    begun = deferred(),
    release = deferred(),
    initialize = vi.spyOn(f.store, "initialize"),
    snapshot = { available: true, initialized: false, required: false, peers: [] };
  const refresh = vi.spyOn(f.service as any, "refresh").mockImplementation(async () => {
    begun.resolve();
    await release.promise;
    return snapshot;
  });
  const starting = f.service.initialize();
  await begun.promise;
  f.service.suspend();
  f.service.resume();
  release.resolve();
  await expect(starting).rejects.toThrow();
  expect(initialize).not.toHaveBeenCalled();
  refresh.mockRestore();
  expect(await readdir(f.directory)).toEqual([]);
});

it("rejects agent roles and untrusted viewer identities before connecting any relay", async () => {
  const f = await fixture();
  await f.service.initialize();
  await f.service.setRequired(true);
  const identity = await DesktopEndpointIdentity.create(crypto),
    handshake = await DesktopEndpointHandshake.create(crypto, identity, {
      session: randomUUID(),
      role: "agent",
      peerRole: "provider",
      expectedFingerprint: "aa".repeat(32),
      generation: 1,
    });
  const params = {
    url: "wss://allowed.example/desktop-e2e",
    ticket: "a".repeat(43),
    machineId: "b".repeat(32),
    session: handshake.hello.session,
    hello: handshake.hello,
  };
  await expect(f.service.start("bridge", params)).rejects.toThrow();
  await expect(
    f.service.start("bridge", { ...params, hello: { ...params.hello, role: "viewer" } }),
  ).rejects.toThrow();
  handshake.close();
});

it("invalidates an old status snapshot that finishes after durable policy enable", async () => {
  const f = await fixture();
  await f.service.initialize();
  const begun = deferred(),
    releaseSave = deferred(),
    readBegun = deferred(),
    releaseRead = deferred(),
    durable = deferred(),
    originalSave = f.store.setRequired.bind(f.store),
    originalStatus = f.store.status.bind(f.store);
  const savingSpy = vi.spyOn(f.store, "setRequired").mockImplementation(async (required) => {
    begun.resolve();
    await releaseSave.promise;
    await originalSave(required);
    durable.resolve();
  });
  const saving = f.service.setRequired(true);
  await begun.promise;
  const readingSpy = vi.spyOn(f.store, "status").mockImplementationOnce(async () => {
    const old = await originalStatus();
    readBegun.resolve();
    await releaseRead.promise;
    return old;
  });
  const reading = f.service.status(),
    guard = vi.spyOn(f.provider, "requireEndpoint");
  try {
    await readBegun.promise;
    releaseSave.resolve();
    await durable.promise;
    // setRequired continuation must run before the captured status returns.
    await new Promise<void>((done) => setImmediate(done));
    releaseRead.resolve();
    await reading;
    await saving;
    expect(guard.mock.calls.some(([required]) => required === false)).toBe(false);
    expect(f.provider.capabilities().endpointRequired).toBe(true);
  } finally {
    releaseSave.resolve();
    releaseRead.resolve();
    await Promise.allSettled([saving, reading]);
    savingSpy.mockRestore();
    readingSpy.mockRestore();
  }
});
