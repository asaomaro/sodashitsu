import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { WorkKind, WorkSkill } from "@sodashitsu/protocol";
import { digest, textFile } from "./files.js";

/** Fixed roots only. Cataloguing reads metadata, never executes scripts or imports a plugin. */
export async function discoverSkills(folder: string, kind: WorkKind, home = homedir(), env = process.env): Promise<{ skills: WorkSkill[]; truncated: boolean }> {
  const roots: { path: string; scope: string; recursive?: boolean }[] = [];
  // Parent project scopes stop at the nearest repository/worktree boundary.
  let parent = resolve(folder);
  for (let depth = 0; depth < 32; depth++) {
    roots.push({ path: join(parent, ".agents", "skills"), scope: "project" });
    roots.push({ path: join(parent, kind === "claude" ? ".claude" : ".codex", "skills"), scope: "project" });
    if ((await readdir(parent).catch(() => [] as string[])).includes(".git") || dirname(parent) === parent) break;
    parent = dirname(parent);
  }
  const agentHome = kind === "claude" ? env.CLAUDE_CONFIG_DIR || join(home, ".claude") : env.CODEX_HOME || join(home, ".codex");
  roots.push({ path: join(home, ".agents", "skills"), scope: "user" }, { path: join(agentHome, "skills"), scope: "user" });
  roots.push({ path: join(agentHome, "plugins", "cache"), scope: "plugin", recursive: true });
  if (kind === "codex") roots.push({ path: join(agentHome, "skills", ".system"), scope: "system" });
  if (kind === "codex") roots.push({ path: "/etc/codex/skills", scope: "admin" });
  const skills: WorkSkill[] = [], seen = new Set<string>();
  let visited = 0, truncated = false;
  const add = async (directory: string, scope: string) => {
    if (skills.length >= 200) { truncated = true; return; }
    try {
      directory = await realpath(directory);
      if (seen.has(directory)) return;
      const text = await textFile(join(directory, "SKILL.md"), 131072);
      const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
      if (!front) return;
      const field = (key: string) => {
        const match = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(front);
        let value = match?.[1]?.trim() ?? "";
        if (/^[>|][-+]?\s*$/.test(value)) {
          const after = front.slice((match!.index) + match![0].length);
          value = /^\r?\n((?:[ \t]+[^\n]*(?:\n|$))+)/.exec(after)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
        }
        return value.replace(/^(["'])([\s\S]*)\1$/, "$2");
      };
      const name = field("name"), description = field("description");
      if (!name || !description) return;
      seen.add(directory);
      skills.push({ id: digest(directory), name: name.slice(0, 128), description: description.slice(0, 500), scope, directory });
    } catch { /* Missing/unreadable/oversized skill is not executable metadata. */ }
  };
  const walk = async (path: string, scope: string, depth: number): Promise<void> => {
    if (++visited > 2000 || depth > 8 || skills.length >= 200) { truncated = true; return; }
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    if (entries.some(e => e.name === "SKILL.md" && e.isFile())) { await add(path, scope); return; }
    const skillRoot = entries.find(e => e.name === "skills" && e.isDirectory());
    if (skillRoot) { await walk(join(path, "skills"), scope, depth + 1); return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() && !e.name.startsWith(".") && !["assets", "references", "scripts", "node_modules"].includes(e.name)) await walk(join(path, e.name), scope, depth + 1);
      if (visited > 2000 || skills.length >= 200) break;
    }
  };
  for (const root of roots) {
    if (root.recursive) await walk(root.path, root.scope, 0);
    else for (const e of (await readdir(root.path, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() || e.isSymbolicLink()) await add(join(root.path, e.name), root.scope);
      if (++visited > 2000 || skills.length >= 200) { truncated = true; break; }
    }
    if (visited > 2000 || skills.length >= 200) break;
  }
  return { skills, truncated };
}
