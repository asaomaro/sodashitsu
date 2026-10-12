import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PluginDiscovery } from "./PluginDiscovery.js";
import { changePlugin, packPlugin } from "@sodashitsu/client-core/node/pluginPackage";
import type { ExtensionHost } from "./ExtensionHost.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "soda-discovery-"));
  dirs.push(root);
  const home = join(root, "home"),
    pj = join(root, "pj"),
    startup = join(root, "startup"),
    state = join(root, "state");
  for (const p of [home, pj, startup]) await mkdir(p);
  return { root, home, pj, startup, state };
}
async function source(root: string, id: string) {
  const path = join(root, "plugins", id);
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "soda-plugin.json"),
    JSON.stringify({
      schemaVersion: 1,
      id,
      version: "1.0.0",
      name: id,
      description: "review me",
      entry: "main.mjs",
      files: ["main.mjs"],
      allow: [],
    }),
  );
  await writeFile(join(path, "main.mjs"), "throw new Error('must not run during discover');");
  return path;
}
const fake = (scope = "user", root = "") =>
  ({
    reload: vi.fn(async () => {}),
    list: () => ({
      extensions: [
        {
          id: "demo",
          key: "user:demo",
          scope,
          root,
          allow: [],
          approval: { command: "", digest: "x" },
        },
      ],
    }),
    approve: vi.fn(async () => {}),
    setEnabled: vi.fn(async () => {}),
  }) as unknown as ExtensionHost;
it("discovers home, explicit project and startup packages without registration or execution", async () => {
  const f = await fixture();
  await source(f.home, "user");
  await source(f.pj, "project");
  await source(f.startup, "startup");
  const d = new PluginDiscovery(f.state, f.home, f.startup, () => [f.pj], fake());
  const r = await d.discover();
  expect(r.candidates.map((c) => [c.id, c.scope])).toEqual([
    ["user", "user"],
    ["project", "project"],
    ["startup", "user"],
  ]);
  await expect(access(f.state)).rejects.toThrow();
});
it("rejects a changed package snapshot before writing any registration", async () => {
  const f = await fixture(),
    s = await source(f.home, "demo"),
    d = new PluginDiscovery(f.state, f.home, f.startup, () => [], fake());
  const c = (await d.discover()).candidates[0]!;
  await writeFile(join(s, "main.mjs"), "changed");
  await expect(d.register("screen", c.key, c.digest)).rejects.toThrow("再確認");
  await expect(access(f.state)).rejects.toThrow();
});
it("registers only the reviewed package and removes its original source from pending candidates", async () => {
  const f = await fixture();
  await source(f.home, "demo");
  const host = fake(),
    d = new PluginDiscovery(f.state, f.home, f.startup, () => [], host),
    c = (await d.discover()).candidates[0]!;
  await d.register("screen", c.key, c.digest);
  const cfg = JSON.parse(await readFile(join(f.state, "extensions.json"), "utf8"));
  expect(cfg.extensions[0]).toMatchObject({ id: "demo", enabled: true });
  expect(host.setEnabled).toHaveBeenCalledWith("screen", "user:demo", true);
  expect((await d.discover()).candidates).toEqual([]);
});
it("holds the package lock through activation and host approval, rejecting a competing CLI replacement", async () => {
  const f = await fixture();
  const s = await source(f.home, "demo"),
    bundle = join(f.root, "demo.sodaplugin");
  await packPlugin(s, bundle);
  const host = fake();
  host.reload = vi.fn(async () => {
    await expect(changePlugin(f.state, "install", bundle)).rejects.toThrow();
    return host.list();
  });
  const d = new PluginDiscovery(f.state, f.home, f.startup, () => [], host),
    c = (await d.discover()).candidates[0]!;
  await d.register("screen", c.key, c.digest);
  expect(host.reload).toHaveBeenCalled();
});
it("does not follow an intermediate .soda symlink into another directory", async () => {
  const f = await fixture(),
    outside = join(f.root, "outside");
  await mkdir(outside);
  await source(outside, "demo");
  await symlink(outside, join(f.pj, ".soda"), "dir");
  const d = new PluginDiscovery(f.state, f.home, f.startup, () => [f.pj], fake());
  expect((await d.discover()).candidates).toEqual([]);
  await expect(access(join(outside, "extensions.json"))).rejects.toThrow();
});
