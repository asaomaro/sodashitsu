import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { runWork } from "./commands/work.js";
import { FsSessionStore } from "./session.js";
import { withSession } from "./withSession.js";
import type { Command } from "./cliArgs.js";

it("binds the agent-free delegated PC once, then routes skills, search, edits, commands and memory there; never falls back to A", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-work-it-")), servers: ComposedServer[] = [];
  const exitCode = process.exitCode; let output: ReturnType<typeof vi.spyOn> | undefined;
  try {
    const local = join(dir, "local"), remote = join(dir, "remote"), other = join(dir, "other");
    await Promise.all([local, remote, other].map(d => mkdir(d)));
    await writeFile(join(local, "README.md"), "local untouched"); await writeFile(join(remote, "README.md"), "remote original");
    await mkdir(join(remote, ".agents/skills/remote-only"), { recursive: true });
    await writeFile(join(remote, ".agents/skills/remote-only/SKILL.md"), "---\nname: remote-only\ndescription: remote test\n---\nrun the remote tests\n");
    const a = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: join(dir, "a"), origin: [] }); servers.push(a);
    const b = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: join(dir, "b"), origin: [] }); servers.push(b);
    const ao = { url: `http://127.0.0.1:${a.options.port}`, token: a.freshToken!, urlExplicit: true }, bo = { url: `http://127.0.0.1:${b.options.port}`, token: b.freshToken!, urlExplicit: true };
    const store = new FsSessionStore(join(dir, "session.json"));
    const own = await withSession(ao, store, c => c.request("workspace.create", { cwd: local }));
    const target = await withSession(bo, store, c => c.request("workspace.create", { cwd: remote }));
    await withSession(bo, store, c => c.request("workspace.set_project_folder", { workspaceId: target.workspace.id, path: remote }));
    const invite = await withSession(ao, store, c => c.request("machine.invite", { label: "target" }));
    await withSession(bo, store, c => c.request("machine.delegate", { url: ao.url, machineId: invite.machineId, token: invite.token }));
    await withSession(ao, store, async c => { await expect.poll(async () => (await c.request("machine.list", {})).machines.find(m => m.id === invite.machineId)?.state).toBe("online"); });
    const text: string[] = [];
    output = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => { text.push(String(chunk)); return true; });
    const opts = { ...ao, caller: { paneId: own.pane.id, serverUrl: ao.url } };
    const run = async (action: Extract<Command, { kind: "work" }>["action"], args: string[] = [], values: Record<string, string> = {}, input = "") => {
      text.length = 0; await runWork({ kind: "work", action, args, values, opts }, store, async () => input); return JSON.parse(text.join(""));
    };
    const bound = await run("bind", ["target", target.workspace.id.slice(0, 8)], { "--kind": "codex" });
    expect(bound.binding.machineId).toBe(invite.machineId); expect(bound.binding.folder).toBe(remote);
    const skill = bound.skills.find((s: { name: string; scope: string }) => s.name === "remote-only" && s.scope === "project");
    expect((await run("skill", [skill.id])).text).toContain("run the remote tests");
    expect((await run("file", ["search"], { "--query": "remote original" })).matches).toEqual(expect.arrayContaining([expect.objectContaining({ path: "README.md" })]));
    const file = await run("file", ["read"], { "--path": "README.md" });
    await run("file", ["write"], { "--path": "README.md", "--version": file.version }, "remote changed");
    expect(await readFile(join(remote, "README.md"), "utf8")).toBe("remote changed");
    expect(await readFile(join(local, "README.md"), "utf8")).toBe("local untouched");
    const script = `eval(Buffer.from('${Buffer.from('require("fs").writeFileSync("executed.txt",process.cwd());process.stdout.write("target-ok")').toString("base64")}','base64').toString('utf8'))`;
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    const command = process.platform === "win32" ? `"${process.execPath}" -e "${script}"` : `${quote(process.execPath)} -e "${script}"`;
    expect(await run("exec", [command])).toMatchObject({ stdout: "target-ok", exitCode: 0 });
    expect(await readFile(join(remote, "executed.txt"), "utf8")).toBe(remote);
    await expect(readFile(join(local, "executed.txt"))).rejects.toThrow();
    const memory = await run("memory", ["write", "MEMORY.md"], {}, "remember remote tasks");
    expect(memory.directory).toBe(join(remote, ".soda/agent-memory", own.pane.id));
    expect((await run("memory", ["read", "MEMORY.md"])).text).toBe("remember remote tasks");
    await withSession(bo, store, c => c.request("workspace.set_project_folder", { workspaceId: target.workspace.id, path: other }));
    await expect(run("exec", [command])).rejects.toThrow(/PJ/);
    await expect(run("file", ["read"], { "--path": "README.md" })).rejects.toThrow(/PJ/);
    // A second local pane has no binding and cannot borrow the first pane's target.
    await expect(runWork({ kind: "work", action: "skills", args: [], values: { "--pane": target.pane.id }, opts }, store)).rejects.toThrow();
    await b.close(); servers.pop();
    await expect(run("exec", [command])).rejects.toThrow();
    expect(await readFile(join(local, "README.md"), "utf8")).toBe("local untouched");
  } finally {
    output?.mockRestore(); process.exitCode = exitCode;
    for (const server of servers.reverse()) await server.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);
