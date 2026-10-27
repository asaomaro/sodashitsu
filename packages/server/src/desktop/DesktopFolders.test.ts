import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { FileTransfer } from "../work/FileTransfer.js";
import { DesktopFiles } from "./DesktopFiles.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function setup(enabled = true) {
  const root = await mkdtemp(join(tmpdir(), "soda-folder-test-"));
  let allowed = true;
  const files = await DesktopFiles.open(
    root,
    () => allowed,
    undefined,
    () => true,
    enabled,
  );
  cleanup.push(async () => {
    await files.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    files,
    run: (request: unknown) => files.run({ type: "desktop_file", id: randomUUID(), request }),
    revoke: () => {
      allowed = false;
    },
  };
}
const entries = [
  { path: "empty", directory: true },
  { path: "nested", directory: true },
  { path: "nested/資料.txt", directory: false, bytes: 4 },
  { path: "zero.bin", directory: false, bytes: 0 },
];
it("requires file grant and feature, creates hierarchy/empty dirs and publishes only checked files", async () => {
  const f = await setup(),
    id = randomUUID();
  expect(
    (await f.run({ action: "folder_upload_start", id, parent: "", name: "folder", entries })).ok,
  ).toBe(false);
  await f.run({ action: "grant", enabled: true });
  expect(
    (await f.run({ action: "folder_upload_start", id, parent: "", name: "folder", entries })).ok,
  ).toBe(true);
  expect((await f.run({ action: "folder_finish", id })).ok).toBe(false); // incomplete group is cleaned
  expect(await readdir(f.root)).toEqual([]);
  const next = randomUUID();
  await f.run({ action: "folder_upload_start", id: next, parent: "", name: "folder", entries });
  await f.run({
    action: "folder_write",
    id: next,
    path: "nested/資料.txt",
    offset: 0,
    data: "dGVzdA==",
  });
  expect(
    (
      await f.run({
        action: "folder_file_finish",
        id: next,
        path: "nested/資料.txt",
        sha256: hash(Buffer.from("test")),
      })
    ).ok,
  ).toBe(true);
  await f.run({
    action: "folder_file_finish",
    id: next,
    path: "zero.bin",
    sha256: hash(Buffer.alloc(0)),
  });
  expect((await f.run({ action: "folder_finish", id: next })).result).toMatchObject({
    done: true,
    bytes: 4,
    offset: 4,
    entriesDone: 2,
  });
  expect(await readFile(join(f.root, "folder/nested/資料.txt"), "utf8")).toBe("test");
  expect((await lstat(join(f.root, "folder/empty"))).isDirectory()).toBe(true);
  const old = await setup(false);
  await old.run({ action: "grant", enabled: true });
  expect(
    (
      await old.run({
        action: "folder_upload_start",
        id: randomUUID(),
        parent: "",
        name: "nope",
        entries: [],
      })
    ).ok,
  ).toBe(false);
});
it("refuses an existing destination folder and never removes or overwrites its contents", async () => {
  const f = await setup();
  await mkdir(join(f.root, "existing"));
  await writeFile(join(f.root, "existing/keep"), "original");
  await f.run({ action: "grant", enabled: true });
  expect(
    (
      await f.run({
        action: "folder_upload_start",
        id: randomUUID(),
        parent: "",
        name: "existing",
        entries,
      })
    ).ok,
  ).toBe(false);
  expect(await readFile(join(f.root, "existing/keep"), "utf8")).toBe("original");
});
it.each(["cancel", "permission", "disconnect"])(
  "cleans partial data and empty dirs, retaining completed/user files on %s",
  async (reason) => {
    const f = await setup(),
      id = randomUUID();
    await f.run({ action: "grant", enabled: true });
    await f.run({ action: "folder_upload_start", id, parent: "", name: "folder", entries });
    await f.run({ action: "folder_write", id, path: "nested/資料.txt", offset: 0, data: "dGU=" });
    await f.run({
      action: "folder_file_finish",
      id,
      path: "zero.bin",
      sha256: hash(Buffer.alloc(0)),
    });
    await writeFile(join(f.root, "folder/keep-added"), "user-added");
    if (reason === "cancel") await f.run({ action: "folder_abort", id });
    else if (reason === "permission") await f.run({ action: "grant", enabled: false });
    else await f.files.close();
    await expect
      .poll(async () => await readdir(join(f.root, "folder")))
      .toEqual(["keep-added", "zero.bin"]);
    expect(await readFile(join(f.root, "folder/keep-added"), "utf8")).toBe("user-added");
  },
);
it("cancels a pending start before directories exist, and never reuses group ids", async () => {
  const f = await setup(),
    id = randomUUID();
  await f.run({ action: "grant", enabled: true });
  const oldCheck = (f.files as any).check;
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => (entered = r));
  let calls = 0;
  (f.files as any).check = async () => {
    if (++calls === 1) {
      entered();
      await new Promise<void>((r) => (release = r));
    }
    await oldCheck();
  };
  const starting = f.run({
    action: "folder_upload_start",
    id,
    parent: "",
    name: "late",
    entries: [],
  });
  await ready;
  const cancel = f.run({ action: "folder_abort", id });
  release();
  expect((await starting).ok).toBe(false);
  expect((await cancel).ok).toBe(true);
  expect(
    (await f.run({ action: "folder_upload_start", id, parent: "", name: "late", entries: [] })).ok,
  ).toBe(false);
  expect(await readdir(f.root)).toEqual([]);
});
it("takes a late cancellation before atomic file publication", async () => {
  const f = await setup(),
    id = randomUUID();
  await f.run({ action: "grant", enabled: true });
  await f.run({
    action: "folder_upload_start",
    id,
    parent: "",
    name: "folder",
    entries: [{ path: "file", directory: false, bytes: 4 }],
  });
  await f.run({ action: "folder_write", id, path: "file", offset: 0, data: "dGVzdA==" });
  const oldCheck = (f.files as any).check;
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => (entered = r));
  let calls = 0;
  (f.files as any).check = async () => {
    if (++calls === 5) {
      entered();
      await new Promise<void>((r) => (release = r));
    }
    await oldCheck();
  };
  const finishing = f.run({
    action: "folder_file_finish",
    id,
    path: "file",
    sha256: hash(Buffer.from("test")),
  });
  await ready;
  const cancel = f.run({ action: "folder_abort", id });
  release();
  expect((await finishing).ok).toBe(false);
  await cancel;
  await expect.poll(() => readdir(f.root)).toEqual([]);
});
it("exports nested files and empty directories as a bounded ZIP with a complete hash", async () => {
  const f = await setup(),
    id = randomUUID();
  await mkdir(join(f.root, "source/empty"), { recursive: true });
  await mkdir(join(f.root, "source/nested"));
  const data = Buffer.alloc(70000, 0xab);
  await writeFile(join(f.root, "source/nested/資料.bin"), data);
  await f.run({ action: "grant", enabled: true });
  const start = await f.run({ action: "folder_download_start", id, path: "source" });
  expect(start.ok).toBe(true);
  const chunks: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const r = await f.run({ action: "folder_read", id, offset });
    expect(r.ok).toBe(true);
    chunks.push(Buffer.from(r.result!.data!, "base64"));
    offset = r.result!.offset!;
    if (r.result!.done) break;
  }
  const archive = Buffer.concat(chunks);
  expect(hash(archive)).toBe(start.result!.sha256);
  const unzipped = unzipSync(archive);
  expect(Object.keys(unzipped).sort()).toEqual(
    ["source/", "source/empty/", "source/nested/", "source/nested/資料.bin"].sort(),
  );
  expect(Buffer.from(unzipped["source/nested/資料.bin"]!)).toEqual(data);
  expect((await f.run({ action: "folder_read", id, offset })).ok).toBe(false);
});
it("rejects source links and traversal without writing outside the approved root", async () => {
  const f = await setup();
  await mkdir(join(f.root, "source"));
  await symlink(
    tmpdir(),
    join(f.root, "source/link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await f.run({ action: "grant", enabled: true });
  expect(
    (await f.run({ action: "folder_download_start", id: randomUUID(), path: "source" })).ok,
  ).toBe(false);
  await expect(
    f.run({
      action: "folder_upload_start",
      id: randomUUID(),
      parent: "../",
      name: "escape",
      entries: [],
    }),
  ).resolves.toMatchObject({ ok: false });
});

it.each(["file", "directory"])("rejects a %s changed after it was already packed", async (kind) => {
  const f = await setup();
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source/a.txt"), "original");
  await f.run({ action: "grant", enabled: true });
  const original = FileTransfer.prototype.run;
  let changed = false;
  vi.spyOn(FileTransfer.prototype, "run").mockImplementation(async function (
    this: FileTransfer,
    ...args: Parameters<FileTransfer["run"]>
  ) {
    const result = await original.apply(this, args);
    if (args[2].action === "read" && result.done && !changed) {
      changed = true;
      if (kind === "file") await writeFile(join(f.root, "source/a.txt"), "modified");
      else await writeFile(join(f.root, "source/new.txt"), "new");
    }
    return result;
  });
  const result = await f.run({ action: "folder_download_start", id: randomUUID(), path: "source" });
  expect(changed).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.message).toContain("変更");
  expect((f.files as any).folders.jobs.size).toBe(0);
});
it("does not replace a file created concurrently in the new destination", async () => {
  const f = await setup(),
    id = randomUUID();
  await f.run({ action: "grant", enabled: true });
  await f.run({
    action: "folder_upload_start",
    id,
    parent: "",
    name: "folder",
    entries: [{ path: "file", directory: false, bytes: 4 }],
  });
  await f.run({ action: "folder_write", id, path: "file", offset: 0, data: "dGVzdA==" });
  await writeFile(join(f.root, "folder/file"), "user-created");
  expect(
    (
      await f.run({
        action: "folder_file_finish",
        id,
        path: "file",
        sha256: hash(Buffer.from("test")),
      })
    ).ok,
  ).toBe(false);
  expect(await readFile(join(f.root, "folder/file"), "utf8")).toBe("user-created");
  expect(await readdir(join(f.root, "folder"))).toEqual(["file"]);
});
