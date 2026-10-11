import { hasForbiddenChars, EXTENSION_ALLOW_VALUES, ExtensionViewsSchema, ExtensionTabViewSchema, type ExtensionViewDefinition } from "@sodashitsu/protocol";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep, relative } from "node:path";

/** Portable, inert bundle. Installing never executes code or package hooks. */
export interface PluginManifest {
  schemaVersion: 1; id: string; version: string; name: string; description: string;
  entry: string; files: string[]; allow: ("script-html" | "agent-start")[]; tabView?: { title: string; display: string; mobileDisplay?:string|undefined; requiresProject?: boolean | undefined }; views?: ExtensionViewDefinition[];
}
export interface PluginBundle { format: "sodashitsu-plugin"; version: 1; manifest: PluginManifest; files: { path: string; sha256: string; data: string }[] }
interface Installed { id: string; version: string; digest: string; path: string; command: string; manifest: PluginManifest }
const MAX_BUNDLE = 32 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const hash = (x: string | Buffer): string => createHash("sha256").update(x).digest("hex");
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const safePath = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_./-]{1,200}$/.test(x) && x.split("/").every((s) => s !== "" && s !== "." && s !== "..");
function manifestOf(value: unknown): PluginManifest {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id)
    || typeof value.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.version)
    || typeof value.name !== "string" || value.name.length > 80 || typeof value.description !== "string" || value.description.length > 200
    || hasForbiddenChars(value.description + value.name)
    || !safePath(value.entry) || !value.entry.endsWith(".mjs") || !Array.isArray(value.files) || value.files.length < 1 || value.files.length > 128
    || !value.files.every(safePath) || new Set(value.files).size !== value.files.length || !value.files.includes(value.entry)
    || !Array.isArray(value.allow) || value.allow.some((x) => !EXTENSION_ALLOW_VALUES.includes(x as typeof EXTENSION_ALLOW_VALUES[number])) || new Set(value.allow).size !== value.allow.length) throw new Error("invalid plugin manifest");
  const tabView = value.tabView === undefined ? undefined : ExtensionTabViewSchema.parse(value.tabView);
  const views = value.views === undefined ? undefined : ExtensionViewsSchema.parse(value.views);
  return { ...(tabView ? { tabView } : {}), ...(views ? { views } : {}), schemaVersion: 1, id: value.id, version: value.version, name: value.name, description: value.description, entry: value.entry, files: value.files as string[], allow: value.allow as ("script-html" | "agent-start")[] };
}
async function boundedFile(path: string, max: number): Promise<Buffer> {
  const s = await lstat(path);
  if (!s.isFile() || s.size > max) throw new Error("plugin file must be a bounded regular file (no symlinks)");
  const handle = await open(path, "r");
  try { const bytes = await handle.readFile(); if (bytes.length > max) throw new Error("plugin file too large"); return bytes; } finally { await handle.close(); }
}
export function validateBundle(value: unknown): PluginBundle {
  if (!object(value) || value.format !== "sodashitsu-plugin" || value.version !== 1 || !Array.isArray(value.files)) throw new Error("invalid plugin bundle");
  const manifest = manifestOf(value.manifest);
  if (value.files.length !== manifest.files.length) throw new Error("bundle file list mismatch");
  const paths = new Set<string>();
  const files = value.files.map((file: unknown) => {
    if (!object(file) || !safePath(file.path) || !manifest.files.includes(file.path) || paths.has(file.path)
      || typeof file.data !== "string" || file.data.length > MAX_FILE * 1.4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)
      || typeof file.sha256 !== "string") throw new Error("invalid bundle file");
    paths.add(file.path);
    const bytes = Buffer.from(file.data, "base64");
    if (bytes.length > MAX_FILE || hash(bytes) !== file.sha256) throw new Error("plugin integrity mismatch");
    return { path: file.path, data: file.data, sha256: file.sha256 };
  });
  const result: PluginBundle = { format: "sodashitsu-plugin", version: 1, manifest, files: manifest.files.map((path) => files.find((f) => f.path === path)!) };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BUNDLE) throw new Error("plugin bundle too large");
  return result;
}
export async function packPlugin(source: string, output: string): Promise<PluginBundle> {
  const root = await realpath(source);
  const manifest = manifestOf(JSON.parse((await boundedFile(join(root, "soda-plugin.json"), 16 * 1024)).toString("utf8")));
  const files: PluginBundle["files"] = [];
  for (const path of manifest.files) {
    let current = root;
    for (const segment of path.split("/")) {
      current = join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) throw new Error("plugin symlinks are not distributable");
    }
    if (!(await realpath(current)).startsWith(root + sep)) throw new Error("plugin file escapes package");
    const bytes = await boundedFile(current, MAX_FILE);
    files.push({ path, sha256: hash(bytes), data: bytes.toString("base64") });
  }
  const bundle = validateBundle({ format: "sodashitsu-plugin", version: 1, manifest, files });
  await writeFile(output, JSON.stringify(bundle), { flag: "wx", mode: 0o600 });
  return bundle;
}
async function jsonOr<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse((await boundedFile(path, MAX_BUNDLE)).toString("utf8")) as T; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw e; }
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await rename(tmp, path);
}
function quote(x: string): string {
  if (hasForbiddenChars(x)) throw new Error("unsupported characters in installation path");
  if (process.platform === "win32") { if (/[%!^&|<>"]/.test(x)) throw new Error("unsupported Windows installation path"); return `"${x}"`; }
  return "'" + x.replace(/'/g, "'\\''") + "'";
}
async function context(base: string) {
  await mkdir(base, { recursive: true, mode: 0o700 });
  const root = await realpath(base);
  const registryPath = join(root, "plugins.json");
  const configPath = join(root, "extensions.json");
  const config = await jsonOr<{ extensions: Record<string, unknown>[] }>(configPath, { extensions: [] });
  const registry = await jsonOr<Installed[]>(registryPath, []);
  if (!object(config) || Object.keys(config).some((k) => k !== "extensions") || !Array.isArray(config.extensions)
    || config.extensions.some((x) => !object(x) || typeof x.id !== "string") || !Array.isArray(registry)) throw new Error("invalid existing plugin or extension configuration");
  return { root, registryPath, configPath, config, registry };
}
export async function listPlugins(base: string) {
  const c = await context(resolve(base));
  return c.registry.map((p) => ({ id: p.id, version: p.version, name: p.manifest.name, path: resolve(c.root,p.path), allow: p.manifest.allow, registered: c.config.extensions.some((e) => e.id === p.id && e.command === p.command), enabled: c.config.extensions.some((e) => e.id === p.id && e.command === p.command && e.enabled !== false) }));
}
export async function changePlugin(base: string, action: "install" | "remove" | "enable" | "disable", source: string, project = false) {
  const c = await context(resolve(base));
  const lock = await open(join(c.root, ".plugins.lock"), "wx", 0o600);
  try {
    // Re-read under the lock to avoid overwriting another installer.
    const latest = await context(c.root);
    if (action !== "install") {
      const old = latest.registry.find((p) => p.id === source);
      if (!old) throw new Error("plugin not installed");
      if (latest.config.extensions.some((e) => e.id === old.id && e.command !== old.command)) throw new Error("extension was edited; refusing to remove it");
      if (action !== "remove") {
        const entry = latest.config.extensions.find((e) => e.id === old.id);
        if (!entry) throw new Error("plugin registration is missing");
        if (action === "enable") {
          const installedPath=resolve(c.root,old.path);
          if (!installedPath.startsWith(join(c.root, "plugins") + sep) || (await lstat(installedPath)).isSymbolicLink()) throw new Error("invalid installed plugin path");
          const files: PluginBundle["files"] = [];
          for (const path of old.manifest.files) { const bytes = await boundedFile(join(installedPath, path), MAX_FILE); files.push({ path, sha256: hash(bytes), data: bytes.toString("base64") }); }
          if (hash(JSON.stringify(validateBundle({ format: "sodashitsu-plugin", version: 1, manifest: old.manifest, files }))) !== old.digest) throw new Error("installed plugin integrity mismatch");
        }
        entry.enabled = action === "enable";
        await atomicJson(c.configPath, latest.config);
        return { id: old.id, enabled: entry.enabled, reloadRequired: true, ...(project ? { approvalRequired: action === "enable" } : {}) };
      }
      latest.config.extensions = latest.config.extensions.filter((e) => e.id !== old.id);
      await atomicJson(c.configPath, latest.config);
      await atomicJson(c.registryPath, latest.registry.filter((p) => p.id !== old.id));
      return { removed: old.id, filesRetained: true, reloadRequired: true };
    }
    const bundle = validateBundle(JSON.parse((await boundedFile(source, MAX_BUNDLE)).toString("utf8")));
    const m = bundle.manifest;
    const digest = hash(JSON.stringify(bundle));
    const old = latest.registry.find((p) => p.id === m.id);
    if (latest.config.extensions.some((e) => e.id === m.id && (!old || e.command !== old.command))) throw new Error("extension id already in use or edited");
    if (!old && latest.config.extensions.length >= 16) throw new Error("extension file limit reached");
    const target = join(c.root, "plugins", `${m.id}-${m.version}-${digest.slice(0, 16)}`);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    if ((await lstat(dirname(target))).isSymbolicLink() || !(await realpath(dirname(target))).startsWith(c.root + sep)) throw new Error("plugin installation directory escapes state directory");
    // No existing directories are overwritten: verify a previous identical install.
    try {
      await mkdir(target, { mode: 0o700 });
      for (const f of bundle.files) { const path = join(target, f.path); await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, Buffer.from(f.data, "base64"), { flag: "wx", mode: 0o600 }); }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if ((await lstat(target)).isSymbolicLink()) throw new Error("existing installation is a symlink");
      for (const f of bundle.files) if (hash(await boundedFile(join(target, f.path), MAX_FILE)) !== f.sha256) throw new Error("existing installation integrity mismatch");
    }
    const command = project ? `node ${quote(relative(dirname(c.root), join(target, m.entry)))}` : `${quote(process.execPath)} ${quote(join(target, m.entry))}`;
    if (command.length > 1024) throw new Error("installation command too long");
    const installed: Installed = { id: m.id, version: m.version, digest, path: project ? relative(c.root,target) : target, command, manifest: m };
    const entry = { id: m.id, command, description: m.description, enabled: false, allow: m.allow, ...(m.tabView ? { tabView: m.tabView } : {}), ...(m.views ? { views: m.views } : {}) };
    const next = [...latest.registry.filter((p) => p.id !== m.id), installed];
    // Registry first: a partial install never enables execution. It can be retried.
    await atomicJson(c.registryPath, next);
    try { await atomicJson(c.configPath, { extensions: [...latest.config.extensions.filter((e) => e.id !== m.id), entry] }); }
    catch (e) { await atomicJson(c.registryPath, latest.registry); throw e; }
    return { id: m.id, version: m.version, path: target, enabled: false, allow: m.allow, reloadRequired: true };
  } finally { await lock.close(); const { unlink } = await import("node:fs/promises"); await unlink(join(c.root, ".plugins.lock")); }
}
