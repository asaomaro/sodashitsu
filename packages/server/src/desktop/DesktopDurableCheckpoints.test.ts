import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  writeFile,
  readdir,
  appendFile,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DesktopTransferStore } from "./DesktopTransferStore.js";
import { DesktopFileCheckpoints } from "./DesktopFileCheckpoints.js";
import { DesktopFiles } from "./DesktopFiles.js";
import { DesktopProvider } from "./DesktopProvider.js";
import { FileTransferInterrupted } from "../work/FileTransfer.js";
const clean: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f();
  vi.restoreAllMocks();
});
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "soda-durable-checkpoint-")),
    root = join(dir, "files"),
    state = join(dir, "state");
  await mkdir(root, { mode: 0o700 });
  await mkdir(state, { mode: 0o700 });
  clean.push(() => rm(dir, { recursive: true, force: true }));
  const options = {
    directory: join(state, "transfers"),
    binding: "a".repeat(64),
    ...(process.platform === "win32"
      ? {
          protector: {
            mode: "dpapi-user" as const,
            protect: async (v: Uint8Array) => new Uint8Array(v),
            unprotect: async (v: Uint8Array) => new Uint8Array(v),
          },
          checkWindowsPath: async () => {},
        }
      : {}),
  };
  const registry = () => {
    const store = new DesktopTransferStore({ ...options }),
      registry = new DesktopFileCheckpoints(store);
    clean.push(async () => {
      await registry.suspend();
    });
    return { store, registry };
  };
  const open = async (registry: DesktopFileCheckpoints) => {
    let live = true;
    const files = await DesktopFiles.open(root, () => live, registry);
    clean.push(() => files.close());
    return {
      run: (request: unknown) => files.run({ type: "desktop_file", id: randomUUID(), request }),
      close: async () => {
        live = false;
        await files.close();
      },
    };
  };
  return { root, dir, registry, open };
}
it("restores an upload after registry replacement only after a new explicit grant", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry);
  await one.run({ action: "grant", enabled: true });
  const start = await one.run({
    action: "checkpoint_upload",
    path: "saved",
    bytes: 6,
    sha256: sha("abcdef"),
  });
  expect(start.ok).toBe(true);
  const checkpoint = start.result!.checkpoint!;
  await one.run({
    action: "checkpoint_write",
    checkpoint,
    offset: 0,
    data: Buffer.from("abc").toString("base64"),
  });
  await one.close();
  await a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  expect((await two.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
  await two.run({ action: "grant", enabled: true });
  expect(
    (await two.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).result!.offset,
  ).toBe(3);
  expect(
    (
      await two.run({
        action: "checkpoint_write",
        checkpoint,
        offset: 3,
        data: Buffer.from("def").toString("base64"),
      })
    ).ok,
  ).toBe(true);
  expect((await two.run({ action: "checkpoint_finish", checkpoint })).ok).toBe(true);
  expect(await readFile(join(f.root, "saved"), "utf8")).toBe("abcdef");
});
it("reopens downloads at the browser durable offset and rejects a changed source", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry),
    data = Buffer.alloc(70000, 7);
  await writeFile(join(f.root, "source"), data);
  await one.run({ action: "grant", enabled: true });
  const start = await one.run({ action: "checkpoint_download", path: "source" }),
    checkpoint = start.result!.checkpoint!;
  await one.run({ action: "checkpoint_read", checkpoint, offset: 0 });
  await one.close();
  await a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  await two.run({ action: "grant", enabled: true });
  expect(
    (await two.run({ action: "checkpoint_attach", checkpoint, offset: 65536 })).result!.offset,
  ).toBe(65536);
  expect(
    (await two.run({ action: "checkpoint_read", checkpoint, offset: 65536 })).result,
  ).toMatchObject({ done: true, sha256: sha(data) });
  await two.close();
  await b.registry.suspend();
  await writeFile(join(f.root, "source"), Buffer.alloc(70000, 8));
  const c = f.registry(),
    three = await f.open(c.registry);
  await three.run({ action: "grant", enabled: true });
  expect((await three.run({ action: "checkpoint_attach", checkpoint, offset: 65536 })).ok).toBe(
    false,
  );
});
it("reconciles publication after a lost durable receipt without republishing or overwriting", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry);
  await one.run({ action: "grant", enabled: true });
  const start = await one.run({
      action: "checkpoint_upload",
      path: "saved",
      bytes: 3,
      sha256: sha("abc"),
    }),
    checkpoint = start.result!.checkpoint!;
  await one.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "YWJj" });
  const original = (a.registry as any).persist.bind(a.registry);
  vi.spyOn(a.registry as any, "persist").mockImplementation(async (job: any) => {
    if (job.receipt) throw new FileTransferInterrupted("generated crash after unlink");
    return original(job);
  });
  expect((await one.run({ action: "checkpoint_finish", checkpoint })).ok).toBe(false);
  await one.close();
  await a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  await two.run({ action: "grant", enabled: true });
  expect(
    (await two.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).result,
  ).toMatchObject({ done: true, destination: join(f.root, "saved"), sha256: sha("abc") });
  expect(await readFile(join(f.root, "saved"), "utf8")).toBe("abc");
});
it("durably cancels a detached cold record without granting file access", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry);
  await one.run({ action: "grant", enabled: true });
  const start = await one.run({
      action: "checkpoint_upload",
      path: "saved",
      bytes: 3,
      sha256: sha("abc"),
    }),
    checkpoint = start.result!.checkpoint!;
  await one.close();
  await a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  expect((await two.run({ action: "checkpoint_abort", checkpoint })).ok).toBe(true);
  await b.registry.suspend();
  const c = f.registry(),
    three = await f.open(c.registry);
  await three.run({ action: "grant", enabled: true });
  expect((await three.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
  expect(await readdir(f.root)).toEqual([]);
});
it("closes admission across the loaded-ensure microtask before taking the handoff drain snapshot", async () => {
  const f = await fixture(),
    a = f.registry(),
    ctx = {
      owner: "first",
      root: f.root,
      connected: () => true,
      valid: () => true,
      guard: async () => {},
      fence: () => {},
    };
  const old = await a.registry.run(ctx, {
    action: "checkpoint_upload",
    path: "old",
    bytes: 0,
    sha256: sha(""),
  });
  await a.registry.confirmCancel(f.root, ctx.owner, old.checkpoint!, ctx.valid);
  expect((a.registry as any).loaded).toBe(true);
  const pending = a.registry.run(ctx, {
    action: "checkpoint_upload",
    path: "late",
    bytes: 3,
    sha256: sha("abc"),
  });
  void pending.catch(() => {});
  const suspended = a.registry.suspend();
  await Promise.resolve();
  expect((a.registry as any).jobs.size).toBe(0);
  await expect(pending).rejects.toThrow("引き継ぎ");
  await suspended;
  expect((a.registry as any).jobs.size).toBe(0);
  expect(await readdir(f.root)).toEqual([]);
  expect(await a.store.list()).toEqual([]);
});

it("does not delete a replacement temporary file when a later durable snapshot fails", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry);
  await one.run({ action: "grant", enabled: true });
  const start = await one.run({
      action: "checkpoint_upload",
      path: "saved",
      bytes: 6,
      sha256: sha("abcdef"),
    }),
    checkpoint = start.result!.checkpoint!;
  await one.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "YWJj" });
  const record = (await a.store.list())[0]!.value as any,
    temp = join(f.root, record.snapshot.temporary);
  await rename(temp, temp + ".original");
  await writeFile(temp, "do not delete");
  expect(
    (await one.run({ action: "checkpoint_write", checkpoint, offset: 3, data: "ZGVm" })).ok,
  ).toBe(false);
  await a.registry.settled();
  await expect(readFile(temp, "utf8")).resolves.toBe("do not delete");
});

it.each(["key", "generation"])(
  "refuses a missing %s in an existing namespace without recreating metadata or deleting retained data",
  async (name) => {
    const f = await fixture(),
      a = f.registry(),
      one = await f.open(a.registry);
    await one.run({ action: "grant", enabled: true });
    const start = await one.run({
        action: "checkpoint_upload",
        path: "saved",
        bytes: 6,
        sha256: sha("abcdef"),
      }),
      checkpoint = start.result!.checkpoint!;
    await one.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "YWJj" });
    const record = (await a.store.list())[0]!.value as any,
      temp = join(f.root, record.snapshot.temporary),
      cipher = await readFile(join(a.store.directory, checkpoint + ".json"));
    await one.close();
    await a.registry.suspend();
    await rm(join(a.store.directory, name + ".json"));
    const b = f.registry(),
      two = await f.open(b.registry);
    await two.run({ action: "grant", enabled: true });
    expect((await two.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
    expect(await readFile(temp, "utf8")).toBe("abc");
    expect(await readFile(join(a.store.directory, checkpoint + ".json"))).toEqual(cipher);
    await expect(readFile(join(a.store.directory, name + ".json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);

it("rejects a same-content replacement download inode after server replacement", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry),
    data = Buffer.alloc(70000, 7);
  await writeFile(join(f.root, "source"), data);
  await one.run({ action: "grant", enabled: true });
  const start = await one.run({ action: "checkpoint_download", path: "source" }),
    checkpoint = start.result!.checkpoint!;
  await one.run({ action: "checkpoint_read", checkpoint, offset: 0 });
  await one.close();
  await a.registry.suspend();
  await rename(join(f.root, "source"), join(f.root, "original"));
  await writeFile(join(f.root, "source"), data);
  const b = f.registry(),
    two = await f.open(b.registry);
  await two.run({ action: "grant", enabled: true });
  const resumed = await two.run({ action: "checkpoint_attach", checkpoint, offset: 65536 });
  expect(resumed.ok).toBe(false);
  expect(resumed.message).toContain("実体");
  expect(await readFile(join(f.root, "source"))).toEqual(data);
});

it.skipIf(process.platform === "win32").each(["handoff", "rollback"])(
  "freezes before source epoch loss and preserves pending IO, keepalive and expiry across %s",
  async (mode) => {
    const f = await fixture(),
      provider = new DesktopProvider(undefined),
      directory = join(f.dir, "state", "handoff");
    provider.enableSavedTransfers(directory, "a".repeat(64));
    const registry = (provider as any).fileCheckpoints as DesktopFileCheckpoints;
    clean.push(() => registry.suspend());
    let timeout: any, pulse: any;
    const realTimeout = setTimeout,
      realInterval = setInterval;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: any, ms: any, ...args: any[]) => {
      if (ms === 60000) timeout = fn;
      return (realTimeout as any)(fn, ms, ...args);
    }) as any);
    vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: any, ms: any, ...args: any[]) => {
      if (ms === 20000) pulse = fn;
      return (realInterval as any)(fn, ms, ...args);
    }) as any);
    const epoch = provider.epoch,
      files = await DesktopFiles.open(
        f.root,
        () => true,
        registry,
        () => provider.epoch === epoch,
      );
    clean.push(() => files.close());
    const run = (request: any) => files.run({ type: "desktop_file", id: randomUUID(), request });
    await run({ action: "grant", enabled: true });
    const start = await run({
        action: "checkpoint_upload",
        path: "saved",
        bytes: 6,
        sha256: sha("abcdef"),
      }),
      checkpoint = start.result!.checkpoint!;
    await run({ action: "checkpoint_write", checkpoint, offset: 0, data: "YWJj" });
    const job = (registry as any).jobs.get(checkpoint),
      temp = join(f.root, job.snapshot.temporary),
      expiry = timeout,
      keepalive = pulse;
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>((r) => (entered = r)),
      gate = new Promise<void>((r) => (release = r)),
      original = job.transfer.run.bind(job.transfer);
    vi.spyOn(job.transfer, "run").mockImplementation(async (...args: any[]) => {
      if (args[2].action === "write" && args[2].offset === 3) {
        entered();
        await gate;
      }
      return original(...args);
    });
    const pending = run({ action: "checkpoint_write", checkpoint, offset: 3, data: "ZGVm" });
    await waiting;
    try {
      provider.dispose(true);
      expect((registry as any).frozen).toBe(true);
      keepalive();
      expiry();
      release();
      expect((await pending).ok).toBe(false);
      await job.queue;
      expect(await readFile(temp, "utf8")).toBe("abc");
    } finally {
      release();
      await pending.catch(() => {});
    }
    let next = registry;
    if (mode === "rollback") provider.resumeUnlockLease();
    else {
      await provider.suspendSavedTransfers();
      const replacement = new DesktopProvider(undefined);
      replacement.enableSavedTransfers(directory, "a".repeat(64));
      next = (replacement as any).fileCheckpoints;
      clean.push(() => next.suspend());
    }
    const fresh = await DesktopFiles.open(f.root, () => true, next);
    clean.push(() => fresh.close());
    const again = (request: any) => fresh.run({ type: "desktop_file", id: randomUUID(), request });
    expect((await again({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
    await again({ action: "grant", enabled: true });
    expect(
      (await again({ action: "checkpoint_attach", checkpoint, offset: 0 })).result!.offset,
    ).toBe(3);
    expect(await readFile(temp, "utf8")).toBe("abc");
  },
);

it.each(["generation", "record"])(
  "rejects an existing zero-byte %s without generating or deleting continuation state",
  async (kind) => {
    const f = await fixture(),
      a = f.registry(),
      one = await f.open(a.registry);
    await one.run({ action: "grant", enabled: true });
    const start = await one.run({
        action: "checkpoint_upload",
        path: "saved",
        bytes: 6,
        sha256: sha("abcdef"),
      }),
      checkpoint = start.result!.checkpoint!;
    await one.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "YWJj" });
    const saved = (await a.store.list())[0]!.value as any,
      temp = join(f.root, saved.snapshot.temporary),
      name = kind === "generation" ? "generation.json" : checkpoint + ".json",
      other = kind === "generation" ? checkpoint + ".json" : "generation.json",
      before = await readFile(join(a.store.directory, other));
    await one.close();
    await a.registry.suspend();
    await writeFile(join(a.store.directory, name), "");
    const b = f.registry(),
      two = await f.open(b.registry);
    await two.run({ action: "grant", enabled: true });
    expect((await two.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
    expect(await readFile(join(a.store.directory, name), "utf8")).toBe("");
    await expect(readFile(temp, "utf8")).resolves.toBe("abc");
    expect(await readFile(join(a.store.directory, other))).toEqual(before);
  },
);

it("drains saved transfer descriptors even when the policy barrier rejects", async () => {
  const f = await fixture();
  const provider = new DesktopProvider(undefined);
  provider.enableSavedTransfers(join(f.dir, "shutdown-state"), "a".repeat(64));
  const registry = (provider as any).fileCheckpoints as DesktopFileCheckpoints;
  clean.push(() => registry.suspend());
  const one = await f.open(registry);
  await one.run({ action: "grant", enabled: true });
  const started = await one.run({
    action: "checkpoint_upload",
    path: "saved",
    bytes: 6,
    sha256: sha("abcdef"),
  });
  expect(started.ok).toBe(true);
  const checkpoint = started.result!.checkpoint!;
  expect(
    (await one.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "YWJj" })).ok,
  ).toBe(true);
  const job = (registry as any).jobs.get(checkpoint);
  const transfer = job.transfer;
  expect(transfer.entries.size).toBe(1);
  const rejected = Promise.reject(new Error("generated metadata failure"));
  rejected.catch(() => {});
  (provider as any).transferBarrier = rejected;
  await expect(provider.suspendSavedTransfers()).rejects.toThrow("generated metadata failure");
  expect((registry as any).frozen).toBe(true);
  expect((registry as any).jobs.size).toBe(0);
  expect(transfer.entries.size).toBe(0);
  expect((await readdir(f.root)).filter((name) => name.startsWith(".soda-transfer-"))).toHaveLength(
    1,
  );
});

it("waits for every saved job after one descriptor close fails", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry);
  await one.run({ action: "grant", enabled: true });
  const tokens: string[] = [];
  for (const path of ["one", "two"]) {
    const started = await one.run({
      action: "checkpoint_upload",
      path,
      bytes: 6,
      sha256: sha("abcdef"),
    });
    expect(started.ok).toBe(true);
    tokens.push(started.result!.checkpoint!);
  }
  const jobs = tokens.map((token) => (a.registry as any).jobs.get(token));
  const entry = [...jobs[0].transfer.entries.values()][0] as any;
  const original = entry.fd.close.bind(entry.fd);
  vi.spyOn(entry.fd, "close").mockImplementation(async () => {
    await original();
    throw Error("generated close failure");
  });
  let release!: () => void;
  jobs[1].queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  let done = false;
  const stopping = a.registry.suspend();
  stopping.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(done).toBe(false);
  } finally {
    release();
  }
  await expect(stopping).rejects.toThrow("Saved transfer shutdown failed");
  expect((a.registry as any).jobs.size).toBe(0);
  for (const job of jobs) expect(job.transfer.entries.size).toBe(0);
});
