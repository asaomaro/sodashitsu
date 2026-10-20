import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Pane, WorkBinding } from "@sodashitsu/protocol";
import { WorkContext } from "./WorkContext.js";
import { folderIdentity } from "./files.js";
import { rm } from "node:fs/promises";

let dir: string, folder: string, state: string, home: string, pane: Pane, work: WorkContext;
const workspaceId = randomUUID(), paneId = randomUUID();
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "soda-work-")); folder = join(dir, "project"); state = join(dir, "state"); home = join(dir, "home");
  await Promise.all([folder, state, home].map(p => mkdir(p)));
  pane = { id: paneId, agentSession: null } as Pane;
  work = new WorkContext(state, id => id === paneId ? pane : undefined, id => id === workspaceId ? folder : undefined, { home, env: {} });
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const scope = () => ({ workspaceId, expectedFolder: folder, agentKind: "codex" as const });
it("automatically discovers project, user, system and plugin skills; reads only the selected skill and its confined references", async () => {
  const paths = [join(folder, ".agents/skills/test"), join(home, ".agents/skills/test"), join(home, ".codex/skills/.system/system"), join(home, ".codex/plugins/cache/p/1/skills/sample")];
  for (const path of paths) { await mkdir(path, { recursive: true }); await writeFile(join(path, "SKILL.md"), "---\nname: test\ndescription: >\n  日本語の説明\n  continued\n---\nbody\n"); }
  await mkdir(join(paths[0]!, "references")); await writeFile(join(paths[0]!, "references/doc.md"), "remote reference");
  await writeFile(join(folder, "AGENTS.md"), "remote instructions");
  const result = await work.inspect(scope());
  expect(result.skills).toHaveLength(4);
  expect(new Set(result.skills.map(s => s.scope))).toEqual(new Set(["project", "user", "system", "plugin"]));
  expect(result.instructions).toEqual([{ path: "AGENTS.md", text: "remote instructions" }]);
  const skill = result.skills.find(s => s.scope === "project")!;
  expect(skill.description).toBe("日本語の説明 continued");
  expect(await work.skill({ ...scope(), id: skill.id, path: "references/doc.md" })).toMatchObject({ text: "remote reference" });
  await expect(work.skill({ ...scope(), id: skill.id, path: "../../AGENTS.md" })).rejects.toThrow();
  await expect(work.skill({ ...scope(), id: "0".repeat(64), path: "SKILL.md" })).rejects.toThrow();
});
it("keeps binding across service restart, scoped to pane and session; never silently reuses a new session", async () => {
  const binding: WorkBinding = { machineId: "a".repeat(32), workspaceId, folder, root: folder, identity: await folderIdentity(folder), agentKind: "codex", sourceSession: null };
  await work.binding({ action: "set", paneId, binding });
  const restarted = new WorkContext(state, id => id === paneId ? pane : undefined, () => folder);
  expect(await restarted.binding({ action: "get", paneId })).toEqual({ binding });
  await expect(restarted.binding({ action: "get", paneId: randomUUID() })).rejects.toThrow();
  pane.agentSession = { kind: "codex", sessionId: randomUUID(), reportedAt: Date.now() };
  await expect(restarted.binding({ action: "get", paneId })).rejects.toThrow(/会話/);
  expect(await restarted.binding({ action: "clear", paneId })).toEqual({ binding: null });
});
it("writes remote memory with optimistic version checks, without replacing project instructions", async () => {
  await writeFile(join(folder, "AGENTS.md"), "original");
  const p = { ...scope(), sourcePaneId: paneId, name: "MEMORY.md" };
  const first = await work.memory({ ...p, action: "write", content: "first" });
  expect(first.directory).toBe(join(folder, ".soda/agent-memory", paneId));
  await expect(work.memory({ ...p, action: "write", content: "lost update" })).rejects.toThrow(/version/);
  await work.memory({ ...p, action: "write", content: "updated", version: first.version! });
  expect(await work.memory({ ...p, action: "read" })).toMatchObject({ text: "updated" });
  expect(await readFile(join(folder, "AGENTS.md"), "utf8")).toBe("original");
  await expect(work.memory({ ...p, expectedFolder: "wrong", action: "write", content: "bad" })).rejects.toThrow(/PJ/);
});
it("rejects a memory directory symlink before writing outside the project", async () => {
  await mkdir(join(folder, ".soda"));
  await symlink(home, join(folder, ".soda/agent-memory"), process.platform === "win32" ? "junction" : "dir");
  await expect(work.memory({ ...scope(), sourcePaneId: paneId, action: "write", name: "MEMORY.md", content: "bad" })).rejects.toThrow(/リンク/);
});
it("rejects a final memory file link even on hosts where O_NOFOLLOW is unavailable", async () => {
  const memory = await work.memory({ ...scope(), sourcePaneId: paneId, action: "list", name: "MEMORY.md" });
  await writeFile(join(home, "outside.md"), "outside");
  await symlink(join(home, "outside.md"), join(memory.directory, "MEMORY.md"));
  await expect(work.memory({ ...scope(), sourcePaneId: paneId, action: "read", name: "MEMORY.md" })).rejects.toThrow(/リンク/);
});
it("rejects a skill or memory parent directory link rather than reading unrelated files", async () => {
  const { textFile } = await import("./files.js");
  await writeFile(join(home, "secret.md"), "outside");
  await symlink(home, join(folder, "linked"), process.platform === "win32" ? "junction" : "dir");
  await expect(textFile(join(folder, "linked/secret.md"))).rejects.toThrow(/実体/);
});
it("refuses a replaced project identity even if the configured folder string stays the same", async () => {
  const original = await work.inspect(scope());
  await expect(work.scope({ ...scope(), expectedRoot: home, expectedIdentity: original.identity })).rejects.toThrow(/実体/);
  await expect(work.scope({ ...scope(), expectedRoot: original.root, expectedIdentity: "0".repeat(64) })).rejects.toThrow(/実体/);
});
it("detects a project change during asynchronous scope validation", async () => {
  let calls = 0;
  const changing = new WorkContext(state, () => pane, () => ++calls === 1 ? folder : home);
  await expect(changing.scope(scope())).rejects.toThrow(/検証中/);
});
it("checks the target again before creating a new memory file", async () => {
  const original = work.scope.bind(work); let calls = 0;
  vi.spyOn(work, "scope").mockImplementation(async p => { if (++calls === 2) throw new Error("PJ changed before write"); return original(p); });
  await expect(work.memory({ ...scope(), sourcePaneId: paneId, action: "write", name: "MEMORY.md", content: "bad" })).rejects.toThrow(/PJ changed/);
  await expect(readFile(join(folder, ".soda/agent-memory", paneId, "MEMORY.md"))).rejects.toThrow();
});
