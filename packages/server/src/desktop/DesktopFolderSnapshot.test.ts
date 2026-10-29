import * as fileOps from "../work/files.js";
import * as safeFileOps from "../agent/safeFile.js";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { DesktopFolders } from "./DesktopFolders.js";
import type { DesktopFolderSnapshot } from "./DesktopFolderSnapshot.js";
const clean: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  try {
    for (const f of clean.splice(0).reverse()) await f();
  } finally {
    vi.restoreAllMocks();
  }
});
const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "soda-folder-snapshot-")),
    root = join(base, "root"),
    scratch = join(base, "scratch");
  await mkdir(root, { mode: 0o700 });
  await mkdir(scratch, { mode: 0o700 });
  clean.push(() => rm(base, { recursive: true, force: true }));
  const create = (before?: (s: DesktopFolderSnapshot) => Promise<void>) => {
    const folders = new DesktopFolders(root, true, scratch, before ?? (async () => {}));
    clean.push(() => folders.suspend());
    return folders;
  };
  const run = (folders: DesktopFolders, p: any) =>
    folders.run(
      p,
      async () => {},
      () => {},
    );
  return { root, scratch, create, run };
}
async function upload() {
  const f = await fixture(),
    intents: DesktopFolderSnapshot[] = [],
    one = f.create(async (s) => {
      intents.push(s);
    }),
    id = randomUUID();
  await f.run(one, {
    action: "folder_upload_start",
    id,
    parent: "",
    name: "saved",
    entries: [
      { path: "empty", directory: true },
      { path: "a", directory: false, bytes: 6 },
      { path: "zero", directory: false, bytes: 0 },
    ],
  });
  await f.run(one, { action: "folder_write", id, path: "a", offset: 0, data: "YWJj" });
  return { ...f, one, id, intents };
}
it("restores exact partial files, completed files, empty directories and the folder receipt", async () => {
  const f = await upload(),
    saved = await f.one.checkpoint(f.id);
  await f.one.suspend();
  const two = f.create();
  expect(
    await two.restore(
      saved,
      async () => {},
      () => {},
    ),
  ).toMatchObject({
    offset: 3,
    folderFiles: [
      { path: "a", offset: 3, done: false },
      { path: "zero", offset: 0, done: false },
    ],
  });
  await f.run(two, { action: "folder_write", id: f.id, path: "a", offset: 3, data: "ZGVm" });
  await f.run(two, { action: "folder_file_finish", id: f.id, path: "a", sha256: sha("abcdef") });
  await f.run(two, { action: "folder_file_finish", id: f.id, path: "zero", sha256: sha("") });
  const complete = await two.checkpoint(f.id);
  expect(complete.files.every((f) => f.done)).toBe(true);
  await two.suspend();
  const three = f.create();
  await three.restore(
    complete,
    async () => {},
    () => {},
  );
  expect(await f.run(three, { action: "folder_finish", id: f.id })).toMatchObject({
    done: true,
    entriesDone: 2,
  });
  const receipt = await three.checkpoint(f.id);
  await three.suspend();
  const four = f.create();
  expect(
    await four.restore(
      receipt,
      async () => {},
      () => {},
    ),
  ).toMatchObject({ done: true, entriesDone: 2 });
  expect(await readFile(join(f.root, "saved", "a"), "utf8")).toBe("abcdef");
  expect(await readdir(join(f.root, "saved", "empty"))).toEqual([]);
});
it("records the complete original temporary identity before publishing each file", async () => {
  const f = await upload();
  await f.run(f.one, { action: "folder_write", id: f.id, path: "a", offset: 3, data: "ZGVm" });
  await f.run(f.one, { action: "folder_file_finish", id: f.id, path: "a", sha256: sha("abcdef") });
  expect(f.intents).toHaveLength(1);
  expect(f.intents[0]!.files[0]).toMatchObject({
    committing: true,
    done: false,
    offset: 6,
    sha256: sha("abcdef"),
    temporary: { offset: 6, prefixSha256: sha("abcdef") },
  });
  const intent = f.intents[0]!;
  await f.one.suspend();
  const two = f.create();
  expect(
    await two.restore(
      intent,
      async () => {},
      () => {},
    ),
  ).toMatchObject({
    entriesDone: 1,
    folderFiles: [
      { path: "a", done: true },
      { path: "zero", done: false },
    ],
  });
});
it.each(["prefix", "temporary", "directory", "completed"])(
  "rejects changed %s identity/content and preserves unknown data",
  async (mode) => {
    const f = await upload();
    if (mode === "completed") {
      await f.run(f.one, { action: "folder_write", id: f.id, path: "a", offset: 3, data: "ZGVm" });
      await f.run(f.one, {
        action: "folder_file_finish",
        id: f.id,
        path: "a",
        sha256: sha("abcdef"),
      });
    }
    const saved = await f.one.checkpoint(f.id);
    await f.one.suspend();
    const temp = saved.files[0]!.temporary!,
      path = join(
        f.root,
        "saved",
        mode === "completed" ? "a" : mode === "directory" ? "empty" : temp.temporary,
      );
    if (mode === "prefix") await writeFile(path, "xyz");
    else {
      await rename(path, path + ".old");
      if (mode === "directory") await mkdir(path);
      else await writeFile(path, mode === "completed" ? "abcdef" : "abc");
    }
    const two = f.create();
    await expect(
      two.restore(
        saved,
        async () => {},
        () => {},
      ),
    ).rejects.toThrow();
    if (mode !== "directory")
      expect(await readFile(path, "utf8")).toBe(
        mode === "prefix" ? "xyz" : mode === "completed" ? "abcdef" : "abc",
      );
  },
);
it("restores a verified private ZIP and seeks to the browser-confirmed chunk", async () => {
  const f = await fixture(),
    one = f.create(),
    id = randomUUID(),
    data = Buffer.alloc(70000, 7);
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source", "data"), data);
  await f.run(one, { action: "folder_download_start", id, path: "source" });
  const first = await f.run(one, { action: "folder_read", id, offset: 0 }),
    saved = await one.checkpoint(id);
  await one.suspend();
  const two = f.create();
  await two.restore(
    saved,
    async () => {},
    () => {},
  );
  await two.seek(id, 65536);
  const last = await f.run(two, { action: "folder_read", id, offset: 65536 }),
    zip = Buffer.concat([Buffer.from(first.data!, "base64"), Buffer.from(last.data!, "base64")]);
  expect(last.done).toBe(true);
  expect(sha(zip)).toBe(last.sha256);
  expect(Buffer.from(unzipSync(zip)["source/data"]!)).toEqual(data);
});
it.each(["source", "archive"])(
  "refuses a same-content replacement %s for a retained ZIP",
  async (mode) => {
    const f = await fixture(),
      one = f.create(),
      id = randomUUID();
    await mkdir(join(f.root, "source"));
    await writeFile(join(f.root, "source", "data"), "same");
    await f.run(one, { action: "folder_download_start", id, path: "source" });
    const saved = await one.checkpoint(id);
    await one.suspend();
    const path =
        mode === "source"
          ? join(f.root, "source", "data")
          : join(f.scratch, saved.download!.scratch, "folder.zip"),
      data = await readFile(path);
    await rename(path, path + ".old");
    await writeFile(path, data);
    await expect(
      f.create().restore(
        saved,
        async () => {},
        () => {},
      ),
    ).rejects.toThrow();
    expect(await readFile(path)).toEqual(data);
  },
);

it("serializes restore with shutdown and cannot adopt descriptors after shutdown completes", async () => {
  const f = await upload(),
    saved = await f.one.checkpoint(f.id);
  await f.one.suspend();
  const two = f.create();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    waiting = new Promise<void>((r) => (entered = r));
  let first = true;
  const restoring = two.restore(
    saved,
    async () => {
      if (first) {
        first = false;
        entered();
        await held;
      }
    },
    () => {},
  );
  restoring.catch(() => {});
  await waiting;
  let done = false;
  const stopping = two.suspend();
  stopping.then(
    () => (done = true),
    () => (done = true),
  );
  try {
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
  } finally {
    release();
  }
  await expect(restoring).rejects.toThrow();
  await stopping;
  expect((two as any).jobs.size).toBe(0);
});
it("serializes simultaneous restores instead of replacing an adopted folder", async () => {
  const f = await upload(),
    saved = await f.one.checkpoint(f.id);
  await f.one.suspend();
  const two = f.create();
  const result = await Promise.allSettled([
    two.restore(
      saved,
      async () => {},
      () => {},
    ),
    two.restore(
      saved,
      async () => {},
      () => {},
    ),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((two as any).jobs.size).toBe(1);
});

it.each(["warm", "restored"])(
  "preserves an unknown ZIP replacement during %s cancellation",
  async (mode) => {
    const f = await fixture(),
      one = f.create(),
      id = randomUUID();
    await mkdir(join(f.root, "source"));
    await writeFile(join(f.root, "source", "data"), "original");
    await f.run(one, { action: "folder_download_start", id, path: "source" });
    const saved = await one.checkpoint(id);
    let current = one;
    if (mode === "restored") {
      await one.suspend();
      current = f.create();
      await current.restore(
        saved,
        async () => {},
        () => {},
      );
    }
    const path = join(f.scratch, saved.download!.scratch, "folder.zip");
    await rename(path, path + ".old");
    await writeFile(path, "unknown replacement");
    current.cancel(id);
    await current.clear();
    await expect(readFile(path, "utf8")).resolves.toBe("unknown replacement");
  },
);

it("closes the restored archive FD when the final scratch-directory guard fails", async () => {
  const f = await fixture(),
    one = f.create(),
    id = randomUUID();
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source", "data"), "original");
  await f.run(one, { action: "folder_download_start", id, path: "source" });
  const saved = await one.checkpoint(id);
  await one.suspend();
  const scratch = join(f.scratch, saved.download!.scratch),
    path = join(scratch, "folder.zip"),
    guard = fileOps.directoryGuard,
    open = safeFileOps.openVerified,
    handles: any[] = [];
  let calls = 0;
  vi.spyOn(fileOps, "directoryGuard").mockImplementation(async (dir) => {
    if (dir === scratch && ++calls === 2) throw Error("generated final scratch failure");
    return guard(dir);
  });
  vi.spyOn(safeFileOps, "openVerified").mockImplementation(async (file) => {
    const opened = await open(file);
    if (file === path && opened) handles.push(opened.fd);
    return opened;
  });
  try {
    await expect(
      f.create().restore(
        saved,
        async () => {},
        () => {},
      ),
    ).rejects.toThrow("generated final scratch failure");
    expect(handles).toHaveLength(1);
    await expect(handles[0].stat()).rejects.toThrow();
  } finally {
    for (const fd of handles) await fd.close().catch(() => {});
  }
});
it("rejects a retained ZIP rewritten in place even when its bytes are unchanged", async () => {
  const f = await fixture(),
    one = f.create(),
    id = randomUUID();
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source", "data"), "original");
  await f.run(one, { action: "folder_download_start", id, path: "source" });
  const saved = await one.checkpoint(id);
  await one.suspend();
  const path = join(f.scratch, saved.download!.scratch, "folder.zip"),
    data = await readFile(path);
  await new Promise((r) => setTimeout(r, 3));
  await writeFile(path, data);
  await expect(
    f.create().restore(
      saved,
      async () => {},
      () => {},
    ),
  ).rejects.toThrow();
});

it("waits for cancelled ZIP cleanup even after its job is removed from the map", async () => {
  const f = await fixture(),
    one = f.create(),
    id = randomUUID();
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source", "data"), "original");
  await f.run(one, { action: "folder_download_start", id, path: "source" });
  const job = (one as any).jobs.get(id),
    fd = job.fd,
    close = fd.close.bind(fd);
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    waiting = new Promise<void>((r) => (entered = r));
  vi.spyOn(fd, "close").mockImplementation(async () => {
    entered();
    await held;
    await close();
  });
  one.cancel(id);
  await waiting;
  let done = false;
  const clearing = one.clear();
  clearing.then(
    () => (done = true),
    () => (done = true),
  );
  try {
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
  } finally {
    release();
  }
  await clearing;
  await expect(fd.stat()).rejects.toThrow();
});

it("still closes the ZIP descriptor when closing its transfer fails", async () => {
  const f = await fixture(),
    one = f.create(),
    id = randomUUID();
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source", "data"), "original");
  await f.run(one, { action: "folder_download_start", id, path: "source" });
  const job = (one as any).jobs.get(id),
    fd = job.fd,
    close = fd.close.bind(fd),
    spy = vi.spyOn(fd, "close");
  vi.spyOn(job.transfer, "close").mockRejectedValue(Error("generated transfer close failure"));
  try {
    one.cancel(id);
    await expect(one.clear()).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(fd.stat()).rejects.toThrow();
  } finally {
    await close().catch(() => {});
  }
});
