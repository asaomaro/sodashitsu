import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {FileTransfer} from "../work/FileTransfer.js";
import { DesktopFiles } from "./DesktopFiles.js";
const clean: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "soda-desktop-files-"));
  clean.push(() => rm(root, { recursive: true, force: true }));
  let allowed = true;
  const files = await DesktopFiles.open(root, () => allowed);
  clean.push(() => files.close());
  const run = (request: unknown) => files.run({ type: "desktop_file", id: randomUUID(), request });
  return {
    root,
    run,
    files,
    revoke: () => {
      allowed = false;
    },
  };
}
it("requires explicit file grant, lists only regular entries and denies traversal/symlinks", async () => {
  const f = await setup();
  await writeFile(join(f.root, "a.txt"), "a");
  await mkdir(join(f.root, "dir"));
  await symlink(tmpdir(), join(f.root, "outside"));
  expect((await f.run({ action: "list", path: "" })).ok).toBe(false);
  expect((await f.run({ action: "grant", enabled: true })).ok).toBe(true);
  expect((await f.run({ action: "list", path: "" })).result?.entries?.map((e) => e.name)).toEqual([
    "dir",
    "a.txt",
  ]);
  for (const path of ["../a.txt", "outside", "/tmp"]) {
    expect((await f.run({ action: "list", path })).ok).toBe(false);
    expect((await f.run({ action: "read_start", path })).ok).toBe(false);
  }
});
it("uploads with pause/status/resume, SHA256 and no overwrite", async () => {
  const f = await setup();
  await f.run({ action: "grant", enabled: true });
  const data = Buffer.from("generated😀 file");
  const start = await f.run({ action: "write_start", path: "a.txt", bytes: data.length }),
    id = start.result?.id;
  expect(id).toBeTruthy();
  await f.run({ action: "write", id, offset: 0, data: data.subarray(0, 3).toString("base64") });
  expect((await f.run({ action: "status", id })).result).toEqual({ offset: 3, bytes: data.length });
  await f.run({ action: "write", id, offset: 3, data: data.subarray(3).toString("base64") });
  const result = await f.run({
    action: "finish",
    id,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
  expect(result.ok).toBe(true);
  expect(await readFile(join(f.root, "a.txt"))).toEqual(data);
  expect((await f.run({ action: "write_start", path: "a.txt", bytes: 1 })).ok).toBe(false);
});
it("downloads binary bytes and verifies the final hash", async () => {
  const f = await setup(),
    data = Buffer.alloc(70000, 0xab);
  await writeFile(join(f.root, "a.bin"), data);
  await f.run({ action: "grant", enabled: true });
  const id = (await f.run({ action: "read_start", path: "a.bin" })).result?.id;
  const first = (await f.run({ action: "read", id, offset: 0 })).result!;
  expect(first.offset).toBe(65536);
  expect((await f.run({ action: "status", id })).result?.offset).toBe(65536);
  const last = (await f.run({ action: "read", id, offset: 65536 })).result!;
  expect(
    Buffer.concat([Buffer.from(first.data!, "base64"), Buffer.from(last.data!, "base64")]),
  ).toEqual(data);
  expect(last.sha256).toBe(createHash("sha256").update(data).digest("hex"));
});
it("cancel and grant revocation remove partial files and never publish them", async () => {
  const f = await setup();
  await f.run({ action: "grant", enabled: true });
  const id = (await f.run({ action: "write_start", path: "a.bin", bytes: 4 })).result?.id;
  await f.run({ action: "write", id, offset: 0, data: "YQ==" });
  await f.run({ action: "abort", id });
  expect(await readdir(f.root)).toEqual([]);
  const next = (await f.run({ action: "write_start", path: "a.bin", bytes: 4 })).result?.id;
  await f.run({ action: "grant", enabled: false });
  expect((await f.run({ action: "write", id: next, offset: 0, data: "YQ==" })).ok).toBe(false);
  expect(await readdir(f.root)).toEqual([]);
});
it("local permission revocation and changes to the source reject further bytes", async () => {
  const f = await setup();
  await writeFile(join(f.root, "a.txt"), "source");
  await f.run({ action: "grant", enabled: true });
  const id = (await f.run({ action: "read_start", path: "a.txt" })).result?.id;
  await writeFile(join(f.root, "a.txt"), "changed");
  expect((await f.run({ action: "read", id, offset: 0 })).ok).toBe(false);
  f.revoke();
  expect((await f.run({ action: "grant", enabled: true })).ok).toBe(false);
});

it("an abort received during final hash verification prevents publication", async () => {
  const f = await setup(),
    data = Buffer.alloc(70000, 0xcc);
  await f.run({ action: "grant", enabled: true });
  const id = (await f.run({ action: "write_start", path: "cancel.bin", bytes: data.length }))
    .result!.id!;
  await f.run({ action: "write", id, offset: 0, data: data.subarray(0, 65536).toString("base64") });
  await f.run({
    action: "write",
    id,
    offset: 65536,
    data: data.subarray(65536).toString("base64"),
  });
  const store = (f.files as unknown as {transfer:FileTransfer}).transfer,
    original = store.run.bind(store);
  let abort: Promise<unknown> | undefined,
    checks = 0;
  vi.spyOn(store, "run").mockImplementation(
    (
      owner: string,
      root: string,
      request: any,
      guard?: () => Promise<void>,
      local?: boolean,
      fence?: () => void,
    ) =>
      original(
        owner,
        root,
        request,
        request.action === "finish"
          ? async () => {
              if (++checks === 4) abort = f.run({ action: "abort", id });
              await guard!();
            }
          : guard,
        local,
        fence,
      ),
  );
  const result = await f.run({
    action: "finish",
    id,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
  expect(checks).toBe(4);
  expect(result.ok).toBe(false);
  await abort;
  expect(await readdir(f.root)).toEqual([]);
});

it("an abort during the final fd stat is fenced before the OS publish call", async () => {
  const f = await setup(),
    data = Buffer.from("generated final fence");
  await f.run({ action: "grant", enabled: true });
  const id = (await f.run({ action: "write_start", path: "cancel.bin", bytes: data.length }))
    .result!.id!;
  await f.run({ action: "write", id, offset: 0, data: data.toString("base64") });
  const fd = (f.files as any).transfer.entries.get(id).fd,
    original = fd.stat.bind(fd);
  let abort: Promise<unknown> | undefined,
    stats = 0;
  vi.spyOn(fd, "stat").mockImplementation(async () => {
    const result = await original();
    if (++stats === 2) abort = f.run({ action: "abort", id });
    return result;
  });
  const result = await f.run({
    action: "finish",
    id,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
  expect(stats).toBe(2);
  expect(result.ok).toBe(false);
  await abort;
  expect(await readdir(f.root)).toEqual([]);
});

it("expires its viewer metadata together with abandoned file handles", async () => {
  vi.useFakeTimers();
  try {
    const f = await setup();
    await f.run({ action: "grant", enabled: true });
    await f.run({ action: "write_start", path: "expired.bin", bytes: 1 });
    expect((f.files as any).activeIds.size).toBe(1);
    await vi.advanceTimersByTimeAsync(60001);
    await (f.files as any).transfer.queue;
    await Promise.resolve();
    expect((f.files as any).activeIds.size).toBe(0);
    expect((f.files as any).expirations.size).toBe(0);
    expect(await readdir(f.root)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
