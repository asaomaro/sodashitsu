import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, truncate, rm, symlink, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPluginSource, readPluginRegistry, changePlugin, packPlugin } from "./pluginPackage.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "soda-safe-package-"));
  dirs.push(dir);
  return dir;
}
it("rejects an oversized source during collection, before reading later manifest files", async () => {
  const dir = await fixture(),
    files = ["a.mjs", "b", "c", "unreadable-later"];
  for (const name of files.slice(0, 3)) {
    await writeFile(join(dir, name), "");
    await truncate(join(dir, name), 8 * 1024 * 1024);
  }
  await writeFile(
    join(dir, "soda-plugin.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "demo",
      version: "1.0.0",
      name: "demo",
      description: "",
      entry: "a.mjs",
      files,
      allow: [],
    }),
  );
  await expect(readPluginSource(dir)).rejects.toThrow("bundle too large");
});
it.skipIf(process.platform === "win32")(
  "rejects a FIFO registry without waiting for a writer",
  async () => {
    const dir = await fixture(),
      path = join(dir, "plugins.json");
    execFileSync("mkfifo", [path]);
    await expect(readPluginRegistry(path)).rejects.toThrow("regular file");
  },
  1000,
);
it("rejects an installed nested directory symlink on enable and identical reinstall", async () => {
  const dir = await fixture(),
    source = join(dir, "src"),
    state = join(dir, "state"),
    bundle = join(dir, "demo.sodaplugin");
  await mkdir(join(source, "nested"), { recursive: true });
  await writeFile(join(source, "nested", "main.mjs"), "console.log(1)");
  await writeFile(
    join(source, "soda-plugin.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "demo",
      version: "1.0.0",
      name: "demo",
      description: "",
      entry: "nested/main.mjs",
      files: ["nested/main.mjs"],
      allow: [],
    }),
  );
  await packPlugin(source, bundle);
  const result = (await changePlugin(state, "install", bundle)) as { path: string };
  await rm(join(result.path, "nested"), { recursive: true });
  await symlink(join(source, "nested"), join(result.path, "nested"), "dir");
  await expect(changePlugin(state, "enable", "demo")).rejects.toThrow("symlink");
  await expect(changePlugin(state, "install", bundle)).rejects.toThrow("symlink");
});
