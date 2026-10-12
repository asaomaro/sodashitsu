import { createHash } from "node:crypto";
import { lstat, opendir, mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  readPluginSource,
  readPluginBundle,
  readPluginRegistry,
  changePlugin,
  type PluginBundle,
} from "@sodashitsu/client-core/node/pluginPackage";
import { RpcError, type PluginCandidate } from "@sodashitsu/protocol";
import type { ExtensionHost } from "./ExtensionHost.js";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
interface Root {
  root: string;
  scope: "user" | "project";
  base: string;
}
/** 既知のフォルダのみを浅く走査。発見時には設定を書かず、コードも実行しない。 */
export class PluginDiscovery {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private stateDir: string,
    private homeDir: string,
    private startupDir: string,
    private projects: () => string[],
    private extensions: ExtensionHost,
  ) {}
  private async roots() {
    const roots: Root[] = [];
    const add = async (path: string, scope: Root["scope"]) => {
      try {
        const root = await realpath(path);
        if (!roots.some((r) => r.root === root))
          roots.push({ root, scope, base: scope === "user" ? this.stateDir : join(root, ".soda") });
      } catch {}
    };
    await add(this.homeDir, "user");
    for (const p of this.projects()) await add(p, "project");
    await add(this.startupDir, "user");
    return roots;
  }
  private async bundle(path: string) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error("package symlinks are not allowed");
    return stat.isDirectory() ? readPluginSource(path) : readPluginBundle(path);
  }
  private async contained(root: string, path: string) {
    const rel = relative(root, path);
    if (rel.startsWith("..") || rel.startsWith(sep)) throw new Error("path outside root");
    let current = root;
    for (const part of rel.split(sep).filter(Boolean)) {
      current = join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error("symlink in package path");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
    }
  }
  private async sources(root: Root) {
    const found = new Set<string>();
    const scan = async (dir: string) => {
      try {
        await this.contained(root.root, dir);
        if ((await lstat(dir)).isSymbolicLink()) return;
        const entries = await opendir(dir);
        let count = 0;
        for await (const e of entries) {
          if (count++ >= 256) break;
          const path = join(dir, e.name);
          if (e.isFile() && e.name.endsWith(".sodaplugin")) found.add(path);
          if (e.isDirectory()) {
            try {
              if ((await lstat(join(path, "soda-plugin.json"))).isFile()) found.add(path);
            } catch {}
          }
        }
        if ((await lstat(join(dir, "soda-plugin.json"))).isFile()) found.add(dir);
      } catch {}
    };
    for (const dir of [
      root.root,
      join(root.root, "plugins"),
      join(root.root, ".soda", "plugins"),
      join(root.root, ".soda", "packages"),
    ])
      await scan(dir);
    return [...found];
  }
  async discover() {
    const candidates: PluginCandidate[] = [];
    for (const root of await this.roots()) {
      let installed: { id: string; digest: string }[] = [];
      try {
        if (root.scope === "project") await this.contained(root.root, root.base);
        installed = await readPluginRegistry(join(root.base, "plugins.json"));
      } catch {}
      for (const path of await this.sources(root)) {
        if (candidates.length >= 64) return { candidates };
        try {
          const bundle = await this.bundle(path),
            digest = hash(JSON.stringify(bundle));
          if (installed.some((i) => i.id === bundle.manifest.id && i.digest === digest)) continue;
          const m = bundle.manifest;
          candidates.push({
            key: hash(root.scope + "\0" + root.root + "\0" + path),
            digest,
            path,
            scope: root.scope,
            root: root.root,
            id: m.id,
            version: m.version,
            name: m.name,
            description: m.description,
            allow: m.allow,
            files: bundle.files.length,
          });
        } catch {}
      }
    }
    return { candidates };
  }
  register(clientId: string, key: string, digest: string) {
    const task = this.queue.then(() => this.install(clientId, key, digest));
    this.queue = task.catch(() => {});
    return task;
  }
  private async install(clientId: string, key: string, digest: string) {
    const candidate = (await this.discover()).candidates.find((c) => c.key === key);
    if (!candidate || candidate.digest !== digest)
      throw new RpcError("extension_stale", "パッケージが変更されたため再確認してください");
    const roots = await this.roots(),
      root = roots.find((r) => r.root === candidate.root && r.scope === candidate.scope);
    if (!root) throw new RpcError("extension_stale", "対象フォルダが変更されました");
    const bundle = await this.bundle(candidate.path);
    if (hash(JSON.stringify(bundle)) !== digest)
      throw new RpcError("extension_stale", "パッケージが変更されたため再確認してください");
    const temp = await mkdtemp(join(tmpdir(), "soda-package-approval-"));
    try {
      const file = join(temp, "verified.sodaplugin");
      await writeFile(file, JSON.stringify(bundle), { mode: 0o600 });
      if (root.scope === "project") await this.contained(root.root, root.base);
      await changePlugin(
        root.base,
        "install",
        file,
        root.scope === "project",
        async (installed, activate) => {
          await activate();
          await this.extensions.reload();
          const entry = this.extensions
            .list()
            .extensions.find(
              (e) =>
                e.id === candidate.id &&
                e.scope === root.scope &&
                (root.scope === "user" || e.root === root.root),
            );
          if (!entry)
            throw new RpcError(
              "invalid_params",
              "登録済みですが拡張を検出できません。PJフォルダ設定を確認してください",
            );
          if (root.scope === "project") {
            if (
              entry.approval?.command !== installed.command ||
              JSON.stringify([...entry.allow].sort()) !==
                JSON.stringify([...candidate.allow].sort())
            )
              throw new RpcError("extension_stale", "登録内容が変更されました");
            await this.extensions.approve(clientId, entry.key, entry.approval.digest);
          }
          await this.extensions.setEnabled(clientId, entry.key, true);
        },
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
}
