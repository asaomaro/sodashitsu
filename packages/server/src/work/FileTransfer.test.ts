import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { WorkAgentTool, type WorkFileRequest } from "@sodashitsu/protocol";
import { FileTransfer, copyWorkFile } from "./FileTransfer.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "work-file-transfer-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const transfer = new FileTransfer(); cleanups.push(() => transfer.close());
  return { root, transfer, run: (p: WorkFileRequest) => transfer.run("owner", root, p) };
}
it.each([0, 170001])("copies %i binary bytes in both directions with verified results", async size => {
  const a = await setup(), b = await setup();
  const data = randomBytes(size);
  await writeFile(join(a.root, "input.xlsx"), data);
  const result = await copyWorkFile(a.run, b.run, "input.xlsx", "remote.xlsx");
  expect(result).toEqual({ destination: join(b.root, "remote.xlsx"), bytes: size, sha256: createHash("sha256").update(data).digest("hex") });
  await copyWorkFile(b.run, a.run, "remote.xlsx", "download.xlsx");
  expect(await readFile(join(a.root, "download.xlsx"))).toEqual(data);
  expect(await readdir(b.root)).toEqual(["remote.xlsx"]);
});
it("never overwrites existing or concurrently created destinations", async () => {
  const a = await setup();
  await writeFile(join(a.root, "existing.xlsx"), "original");
  await expect(a.run({ action: "write_start", path: "existing.xlsx", bytes: 0 })).rejects.toThrow("既に存在");
  const { id } = await a.run({ action: "write_start", path: "race.xlsx", bytes: 0 });
  await writeFile(join(a.root, "race.xlsx"), "concurrent");
  await expect(a.run({ action: "finish", id: id!, sha256: createHash("sha256").digest("hex") })).rejects.toThrow();
  expect(await readFile(join(a.root, "race.xlsx"), "utf8")).toBe("concurrent");
  expect((await readdir(a.root)).sort()).toEqual(["existing.xlsx", "race.xlsx"]);
});
it("rejects corrupt/incomplete streams and removes staging files", async () => {
  const a = await setup();
  for (const bytes of [0, 1]) {
    const { id } = await a.run({ action: "write_start", path: "bad.xlsx", bytes });
    await expect(a.run({ action: "finish", id: id!, sha256: "0".repeat(64) })).rejects.toThrow("一致");
  }
  expect(await readdir(a.root)).toEqual([]);
});
it("binds streams to their owner, rejects invalid offsets and changed source files", async () => {
  const a = await setup(); await writeFile(join(a.root, "file"), "test");
  const { id } = await a.run({ action: "read_start", path: "file" });
  await expect(a.transfer.run("other", a.root, { action: "read", id: id!, offset: 0 })).rejects.toThrow("接続");
  await writeFile(join(a.root, "file"), "changed");
  await expect(a.run({ action: "read", id: id!, offset: 0 })).rejects.toThrow("変更");
  const upload = await a.run({ action: "write_start", path: "target", bytes: 1 });
  await expect(a.run({ action: "write", id: upload.id!, offset: 1, data: "YQ==" })).rejects.toThrow("位置");
  expect(await readdir(a.root)).toEqual(["file"]);
});
it("rejects remote escapes, symlink parents, and symlink source files", async () => {
  const a = await setup(), b = await setup(); await writeFile(join(b.root, "secret"), "private");
  await symlink(b.root, join(a.root, "outside"), "dir");
  await symlink(join(b.root, "secret"), join(a.root, "alias"));
  for (const path of ["../secret", join(b.root, "secret"), "outside/secret", "alias"])
    await expect(a.run({ action: "read_start", path })).rejects.toThrow();
  await expect(a.run({ action: "write_start", path: "outside/new", bytes: 0 })).rejects.toThrow();
});
it("supports explicit absolute operator paths while keeping remote paths relative", async () => {
  const a = await setup(), b = await setup(); await mkdir(join(b.root, "docs"));
  await writeFile(join(b.root, "docs", "material.pdf"), Buffer.from([0, 255, 128]));
  const local = (p: WorkFileRequest) => a.transfer.run("operator", a.root, p, async () => {}, true);
  await copyWorkFile(local, a.run, join(b.root, "docs", "material.pdf"), "material.pdf");
  expect(await readFile(join(a.root, "material.pdf"))).toEqual(Buffer.from([0, 255, 128]));
  expect(WorkAgentTool.parse({ operation: "transfer", action: "upload", sourcePath: "a.xlsx", destinationPath: "b.xlsx" })).toMatchObject({ operation: "transfer" });
  expect(WorkAgentTool.safeParse({ operation: "transfer", action: "upload", sourcePath: "a", destinationPath: "b", machineId: "override" }).success).toBe(false);
});
it.each(["modify", "replace"])("detects a staging-file %s before publishing", async mode => {
  const a = await setup(), data = Buffer.from("original");
  const { id } = await a.run({ action: "write_start", path: "output.xlsx", bytes: data.length });
  await a.run({ action: "write", id: id!, offset: 0, data: data.toString("base64") });
  const stage = join(a.root, `.soda-transfer-${id}`);
  if (mode === "replace") await rm(stage);
  await writeFile(stage, "tampered");
  await expect(a.run({ action: "finish", id: id!, sha256: createHash("sha256").update(data).digest("hex") })).rejects.toThrow();
  if(mode==="replace"){expect(await readFile(stage,"utf8")).toBe("tampered");expect(await readdir(a.root)).toEqual([`.soda-transfer-${id}`]);}
  else expect(await readdir(a.root)).toEqual([]);
});
