import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, rename, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DesktopTransferStore } from "./DesktopTransferStore.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function fixture() {
  const state = await mkdtemp(join(tmpdir(), "soda-durable-store-"));
  cleanup.push(() => rm(state, { recursive: true, force: true }));
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
  return { state, options, create: () => new DesktopTransferStore({ ...options }) };
}
it("persists encrypted continuation records across process instances without storing grants", async () => {
  const f = await fixture(),
    a = f.create(),
    token = randomBytes(32).toString("hex"),
    generation = await a.generation();
  await a.put(token, generation, { path: "private-report", offset: 65536 }, () => true);
  const raw = await readFile(join(f.options.directory, token + ".json"), "utf8");
  expect(raw).not.toContain("private-report");
  const b = f.create();
  expect(await b.generation()).toBe(generation);
  expect(await b.list()).toEqual([
    { token, generation, value: { path: "private-report", offset: 65536 } },
  ]);
});
it("durably invalidates old records before rebinding committed settings and prevents stale queued saves", async () => {
  const f = await fixture(),
    a = f.create(),
    token = "b".repeat(64),
    generation = await a.generation();
  await a.put(token, generation, { offset: 1 }, () => true);
  await a.invalidate();
  await a.bind("c".repeat(64));
  await expect(a.put(token, generation, { offset: 2 }, () => true)).rejects.toThrow();
  const b = new DesktopTransferStore({ ...f.options, binding: "c".repeat(64) });
  expect(await b.generation()).not.toBe(generation);
  expect(await b.list()).toEqual([]);
});
it("invalidates offline settings changes instead of adopting a previous policy generation", async () => {
  const f = await fixture(),
    a = f.create(),
    generation = await a.generation();
  await a.put("b".repeat(64), generation, { offset: 1 }, () => true);
  const b = new DesktopTransferStore({ ...f.options, binding: "c".repeat(64) });
  expect(await b.generation()).not.toBe(generation);
  expect(await b.list()).toEqual([]);
});
it("authenticates record filename and ciphertext and refuses corrupted metadata", async () => {
  const f = await fixture(),
    a = f.create(),
    token = "b".repeat(64),
    generation = await a.generation();
  await a.put(token, generation, { offset: 1 }, () => true);
  const raw = await readFile(join(f.options.directory, token + ".json"));
  await writeFile(join(f.options.directory, "c".repeat(64) + ".json"), raw, { mode: 0o600 });
  await expect(f.create().list()).rejects.toThrow();
});
it("never commits a record after its synchronous authority fence is revoked", async () => {
  const f = await fixture(),
    a = f.create(),
    generation = await a.generation();
  let active = true,
    calls = 0;
  await expect(
    a.put("b".repeat(64), generation, { offset: 1 }, () => {
      if (++calls === 3) active = false;
      return active;
    }),
  ).rejects.toThrow();
  expect(await a.list()).toEqual([]);
});
it.skipIf(process.platform === "win32")(
  "rejects permissive files, symlink storage and a replaced directory without repairing or modifying them",
  async () => {
    const f = await fixture(),
      a = f.create();
    await a.generation();
    const key = join(f.options.directory, "key.json");
    await chmod(key, 0o644);
    await expect(f.create().generation()).rejects.toThrow();
    await expect(
      (await import("node:fs/promises")).stat(key).then((s) => s.mode & 0o777),
    ).resolves.toBe(0o644);
    await chmod(key, 0o600);
    await rename(f.options.directory, f.options.directory + ".old");
    await symlink(f.options.directory + ".old", f.options.directory, "dir");
    await expect(a.list()).rejects.toThrow();
    await expect(f.create().generation()).rejects.toThrow();
  },
);
it.each(["key","generation","record"])("explicitly rejects a zero-byte %s in an established namespace",async name=>{const f=await fixture(),a=f.create(),generation=await a.generation(),token="b".repeat(64);await a.put(token,generation,{offset:1},()=>true);await writeFile(join(f.options.directory,name==="record"?token+".json":name+".json"),"");await expect(f.create().list()).rejects.toThrow();});
