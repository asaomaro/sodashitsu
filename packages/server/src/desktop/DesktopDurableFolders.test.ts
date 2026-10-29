import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { DesktopTransferStore } from "./DesktopTransferStore.js";
import { DesktopFolderCheckpoints } from "./DesktopFolderCheckpoints.js";
import { DesktopFiles } from "./DesktopFiles.js";
const clean: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f();
  vi.restoreAllMocks();
});
const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "soda-durable-folder-")),
    root = join(base, "root"),
    directory = join(base, "records");
  await mkdir(root, { mode: 0o700 });
  clean.push(() => rm(base, { recursive: true, force: true }));
  const options = {
    directory,
    binding: "a".repeat(64),
    folderRecords: true,
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
      registry = new DesktopFolderCheckpoints(store);
    clean.push(() => registry.suspend());
    return { store, registry };
  };
  const open = async (registry: DesktopFolderCheckpoints) => {
    let live = true;
    const files = await DesktopFiles.open(
      root,
      () => live,
      undefined,
      () => true,
      true,
      registry,
    );
    const close = async () => {
      live = false;
      await files.close();
    };
    clean.push(close);
    return {
      files,
      run: (request: unknown) => files.run({ type: "desktop_file", id: randomUUID(), request }),
      close,
    };
  };
  return { base, root, directory, registry, open };
}
const run = (checkpoint: string, request: unknown) => ({
  action: "folder_resume_run",
  checkpoint,
  request,
});
async function upload() {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry),
    id = randomUUID();
  await one.run({ action: "grant", enabled: true });
  const result = await one.run({
    action: "folder_resume_start",
    request: {
      action: "folder_upload_start",
      id,
      parent: "",
      name: "saved",
      entries: [
        { path: "empty", directory: true },
        { path: "a", directory: false, bytes: 6 },
      ],
    },
  });
  expect(result.ok, result.message).toBe(true);
  const checkpoint = result.result!.checkpoint!;
  expect(
    (
      await one.run(
        run(checkpoint, { action: "folder_write", id, path: "a", offset: 0, data: "YWJj" }),
      )
    ).ok,
  ).toBe(true);
  return { ...f, a, one, id, checkpoint };
}
it("restores a server-process upload and final receipt only after fresh grant and attach", async () => {
  const f = await upload();
  await f.one.close();
  await f.a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  expect(
    (await two.run({ action: "folder_resume_attach", checkpoint: f.checkpoint, offset: 0 })).ok,
  ).toBe(false);
  await two.run({ action: "grant", enabled: true });
  const attached = await two.run({
    action: "folder_resume_attach",
    checkpoint: f.checkpoint,
    offset: 0,
  });
  expect(attached.ok, attached.message).toBe(true);
  expect(attached.result).toMatchObject({
    offset: 3,
    folderFiles: [{ path: "a", offset: 3, done: false }],
  });
  expect(
    (
      await two.run(
        run(f.checkpoint, { action: "folder_write", id: f.id, path: "a", offset: 3, data: "ZGVm" }),
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await two.run(
        run(f.checkpoint, {
          action: "folder_file_finish",
          id: f.id,
          path: "a",
          sha256: sha("abcdef"),
        }),
      )
    ).ok,
  ).toBe(true);
  expect((await two.run(run(f.checkpoint, { action: "folder_finish", id: f.id }))).ok).toBe(true);
  await two.close();
  await b.registry.suspend();
  const c = f.registry(),
    three = await f.open(c.registry);
  await three.run({ action: "grant", enabled: true });
  expect(
    (await three.run({ action: "folder_resume_attach", checkpoint: f.checkpoint, offset: 0 }))
      .result,
  ).toMatchObject({ done: true, entriesDone: 1 });
  expect(await readFile(join(f.root, "saved", "a"), "utf8")).toBe("abcdef");
  expect(await readdir(join(f.root, "saved", "empty"))).toEqual([]);
});
it("restores a private ZIP download after a new server registry and grant", async () => {
  const f = await fixture(),
    a = f.registry(),
    one = await f.open(a.registry),
    id = randomUUID(),
    data = Buffer.alloc(70000, 7);
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source", "data"), data);
  await one.run({ action: "grant", enabled: true });
  const started = await one.run({
    action: "folder_resume_start",
    request: { action: "folder_download_start", id, path: "source" },
  });
  expect(started.ok, started.message).toBe(true);
  const checkpoint = started.result!.checkpoint!,
    first = await one.run(run(checkpoint, { action: "folder_read", id, offset: 0 }));
  expect(first.ok).toBe(true);
  await one.close();
  await a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  await two.run({ action: "grant", enabled: true });
  expect((await two.run({ action: "folder_resume_attach", checkpoint, offset: 65536 })).ok).toBe(
    true,
  );
  const last = await two.run(run(checkpoint, { action: "folder_read", id, offset: 65536 }));
  expect(last.ok, last.message).toBe(true);
  const zip = Buffer.concat([
    Buffer.from(first.result!.data!, "base64"),
    Buffer.from(last.result!.data!, "base64"),
  ]);
  expect(sha(zip)).toBe(last.result!.sha256);
  expect(Buffer.from(unzipSync(zip)["source/data"]!)).toEqual(data);
});
it("cold cancellation without a grant durably removes only the owned partial tree", async () => {
  const f = await upload();
  await f.one.close();
  await f.a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  expect((await two.run({ action: "folder_resume_abort", checkpoint: f.checkpoint })).ok).toBe(
    true,
  );
  expect(await readdir(f.root)).toEqual([]);
  expect(await b.store.list()).toEqual([]);
  await b.registry.suspend();
  const c = f.registry(),
    three = await f.open(c.registry);
  await three.run({ action: "grant", enabled: true });
  expect(
    (await three.run({ action: "folder_resume_attach", checkpoint: f.checkpoint, offset: 0 })).ok,
  ).toBe(false);
});
it("invalidates persisted folder records before rebinding and never revives OFF then ON", async () => {
  const f = await upload(),
    sealed = await readFile(join(f.directory, f.checkpoint + ".json"));
  await f.one.close();
  await f.a.registry.invalidate();
  await f.a.registry.bind("b".repeat(64));
  await f.a.registry.bind("a".repeat(64));
  await writeFile(join(f.directory, f.checkpoint + ".json"), sealed);
  await f.a.registry.suspend();
  const b = f.registry(),
    two = await f.open(b.registry);
  await two.run({ action: "grant", enabled: true });
  expect(
    (await two.run({ action: "folder_resume_attach", checkpoint: f.checkpoint, offset: 0 })).ok,
  ).toBe(false);
});
it("preserves a replacement partial file when restoration rejects it", async () => {
  const f = await upload(),
    saved = (await f.a.store.list())[0]!.value as any,
    temp = join(f.root, "saved", saved.snapshot.files[0].temporary.temporary);
  await f.one.close();
  await f.a.registry.suspend();
  await rename(temp, temp + ".old");
  await writeFile(temp, "replacement");
  const b = f.registry(),
    two = await f.open(b.registry);
  await two.run({ action: "grant", enabled: true });
  expect(
    (await two.run({ action: "folder_resume_attach", checkpoint: f.checkpoint, offset: 0 })).ok,
  ).toBe(false);
  await b.registry.settled();
  expect(await readFile(temp, "utf8")).toBe("replacement");
});
it("freezes queued writes and rolls back through a cold reload with a new grant", async () => {
  const f = await upload(),
    job = (f.a.registry as any).jobs.get(f.checkpoint);
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    waiting = new Promise<void>((r) => (entered = r)),
    original = job.folders.run.bind(job.folders);
  vi.spyOn(job.folders, "run").mockImplementation(async (...args: any[]) => {
    entered();
    await held;
    return original(...args);
  });
  const pending = f.one.run(
    run(f.checkpoint, { action: "folder_write", id: f.id, path: "a", offset: 3, data: "ZGVm" }),
  );
  await waiting;
  try {
    f.a.registry.freeze();
    release();
    expect((await pending).ok).toBe(false);
  } finally {
    release();
    await pending;
  }
  f.a.registry.resume();
  await f.one.close();
  const two = await f.open(f.a.registry);
  await two.run({ action: "grant", enabled: true });
  const attached = await two.run({
    action: "folder_resume_attach",
    checkpoint: f.checkpoint,
    offset: 0,
  });
  expect(attached.ok, attached.message).toBe(true);
  expect(attached.result!.offset).toBe(3);
});

it("keeps the completed folder and its empty directories when releasing the saved receipt", async () => {
  const f = await upload();
  await f.one.run(
    run(f.checkpoint, { action: "folder_write", id: f.id, path: "a", offset: 3, data: "ZGVm" }),
  );
  await f.one.run(
    run(f.checkpoint, { action: "folder_file_finish", id: f.id, path: "a", sha256: sha("abcdef") }),
  );
  expect((await f.one.run(run(f.checkpoint, { action: "folder_finish", id: f.id }))).ok).toBe(true);
  expect((await f.one.run({ action: "folder_resume_abort", checkpoint: f.checkpoint })).ok).toBe(
    true,
  );
  await expect(readdir(join(f.root, "saved", "empty"))).resolves.toEqual([]);
  expect(await readFile(join(f.root, "saved", "a"), "utf8")).toBe("abcdef");
  expect(await f.a.store.list()).toEqual([]);
});
it("closes start admission across a loaded-ensure microtask before handoff drain", async () => {
  const f = await upload(),
    ctx = {
      root: f.root,
      owner: "generated-owner",
      valid: () => true,
      connected: () => true,
      guard: async () => {},
      fence: () => {},
    },
    pending = f.a.registry.run(ctx, {
      action: "folder_resume_start",
      request: {
        action: "folder_upload_start",
        id: randomUUID(),
        parent: "",
        name: "late",
        entries: [],
      },
    });
  pending.catch(() => {});
  f.a.registry.freeze();
  await f.a.registry.suspend();
  await expect(pending).rejects.toThrow();
  expect((f.a.registry as any).jobs.size).toBe(0);
});
