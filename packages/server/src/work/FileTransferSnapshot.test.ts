import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  rm,
  writeFile,
  readFile,
  appendFile,
  link,
  unlink,
  rename,
  symlink,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FileTransfer } from "./FileTransfer.js";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
const io = vi.hoisted(() => ({
  beforeOpen: undefined as undefined | ((path: string, flags: number) => Promise<void>),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    open: async (path: any, flags: any, mode?: any) => {
      await io.beforeOpen?.(String(path), Number(flags));
      return real.open(path, flags, mode);
    },
  };
});
const clean: Array<() => Promise<void>> = [];
afterEach(async () => {
  io.beforeOpen = undefined;
  for (const f of clean.splice(0).reverse()) await f();
});
const sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex"),
  guard = async () => {},
  fence = () => {};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "soda-stream-snapshot-"));
  clean.push(() => rm(root, { recursive: true, force: true }));
  const transfer = () => {
    const t = new FileTransfer(true);
    clean.push(() => t.close());
    return t;
  };
  const first = transfer(),
    r = await first.run("a", root, { action: "write_start", path: "saved", bytes: 6 });
  await first.run("a", root, {
    action: "write",
    id: r.id!,
    offset: 0,
    data: Buffer.from("abc").toString("base64"),
  });
  const snapshot = await first.checkpoint("a", root, r.id!);
  return { root, first, snapshot, transfer, temp: join(root, snapshot.temporary) };
}
it("restores a verified prefix at a positional append offset and discards only an unacknowledged tail", async () => {
  const f = await fixture();
  await f.first.suspend();
  await appendFile(f.temp, "xyz");
  const next = f.transfer();
  expect(await next.restore("b", f.root, f.snapshot, guard, fence)).toMatchObject({ offset: 3 });
  expect(await readFile(f.temp, "utf8")).toBe("abc");
  await next.run("b", f.root, {
    action: "write",
    id: f.snapshot.id,
    offset: 3,
    data: Buffer.from("def").toString("base64"),
  });
  await next.run("b", f.root, { action: "finish", id: f.snapshot.id, sha256: sha("abcdef") });
  expect(await readFile(join(f.root, "saved"), "utf8")).toBe("abcdef");
});
it.each(["prefix", "inode", "hardlink", "symlink", "parent", "root", "length"])(
  "rejects changed %s without overwriting or deleting files",
  async (mode) => {
    const f = await fixture();
    await f.first.suspend();
    let outside: string | undefined;
    if (mode === "prefix") await writeFile(f.temp, "zzz");
    if (mode === "inode") {
      await rename(f.temp, f.temp + ".old");
      await writeFile(f.temp, "abc");
    }
    if (mode === "hardlink") await link(f.temp, f.temp + ".alias");
    if (mode === "symlink") {
      outside = f.temp + ".outside";
      await rename(f.temp, outside);
      await symlink(outside, f.temp);
    }
    if (mode === "root" || mode === "parent") {
      await rename(f.root, f.root + ".old");
      clean.unshift(() => rm(f.root + ".old", { recursive: true, force: true }));
      await import("node:fs/promises").then((fs) => fs.mkdir(f.root));
      await writeFile(f.temp, "abc");
    }
    if (mode === "length") await appendFile(f.temp, "too long");
    const before = await readFile(f.temp);
    await expect(f.transfer().restore("b", f.root, f.snapshot, guard, fence)).rejects.toThrow();
    expect(await readFile(f.temp)).toEqual(before);
  },
);
it("checks authority before truncating the held temporary file", async () => {
  const f = await fixture();
  await f.first.suspend();
  await appendFile(f.temp, "xyz");
  await expect(
    f.transfer().restore("b", f.root, f.snapshot, guard, () => {
      throw Error("revoked");
    }),
  ).rejects.toThrow("revoked");
  expect(await readFile(f.temp, "utf8")).toBe("abcxyz");
});
it.each(["linked", "unlinked"])(
  "reconciles published %s finish intent using exact inode and full hash",
  async (mode) => {
    const f = await fixture();
    await f.first.run("a", f.root, {
      action: "write",
      id: f.snapshot.id,
      offset: 3,
      data: Buffer.from("def").toString("base64"),
    });
    const final = await f.first.checkpoint("a", f.root, f.snapshot.id);
    await f.first.suspend();
    expect(
      await FileTransfer.published(f.root, final, sha("abcdef"), guard, fence),
    ).toBeUndefined();
    await link(f.temp, join(f.root, "saved"));
    if (mode === "unlinked") await unlink(f.temp);
    expect(await FileTransfer.published(f.root, final, sha("abcdef"), guard, fence)).toMatchObject({
      destination: join(f.root, "saved"),
      sha256: sha("abcdef"),
    });
    expect((await lstat(join(f.root, "saved"))).nlink).toBe(1);
    const reader = f.transfer();
    expect(
      await reader.run("reader", f.root, { action: "read_start", path: "saved" }),
    ).toMatchObject({ bytes: 6 });
    await rename(join(f.root, "saved"), join(f.root, "original"));
    await writeFile(join(f.root, "saved"), "abcdef");
    await expect(
      FileTransfer.published(f.root, final, sha("abcdef"), guard, fence),
    ).rejects.toThrow("実体");
  },
);

it.skipIf(process.platform === "win32").each(["restore", "published"])(
  "rejects a post-lstat FIFO replacement through a bounded %s opener",
  async (mode) => {
    const f = await fixture();
    let snapshot = f.snapshot;
    if (mode === "published") {
      await f.first.run("a", f.root, { action: "write", id: snapshot.id, offset: 3, data: "ZGVm" });
      snapshot = await f.first.checkpoint("a", f.root, snapshot.id);
    }
    await f.first.suspend();
    const path = mode === "restore" ? f.temp : join(f.root, "saved");
    if (mode === "published") await link(f.temp, path);
    let bounded = true,
      swapped = false;
    io.beforeOpen = async (name, flags) => {
      if (name !== path || swapped) return;
      swapped = true;
      bounded = (flags & constants.O_NONBLOCK) !== 0;
      if (!bounded) throw Error("Generated unbounded FIFO opener rejected before blocking");
      await rename(path, path + ".original");
      execFileSync("mkfifo", [path]);
    };
    await expect(
      mode === "restore"
        ? f.transfer().restore("b", f.root, snapshot, guard, fence)
        : FileTransfer.published(f.root, snapshot, sha("abcdef"), guard, fence),
    ).rejects.toThrow();
    expect(swapped).toBe(true);
    expect(bounded).toBe(true);
  },
);
