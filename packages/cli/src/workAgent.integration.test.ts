import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { FsSessionStore } from "./session.js";
import { withSession } from "./withSession.js";
import { WorkAgentClient } from "./workAgentIo.js";

it.skipIf(process.platform === "win32")("B requests; A starts its own CLI and routes tools/memory only to B, preserving resume args", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-work-agent-it-")); const servers: ComposedServer[] = [];
  let proxy: WorkAgentClient | undefined;
  try {
    const bin = join(dir, "bin"), local = join(dir, "local"), remote = join(dir, "remote"), other = join(dir, "other");
    await Promise.all([bin, local, remote, other].map(d => mkdir(d)));
    const marker = join(dir, "native-start.json");
    await writeFile(join(bin, "claude"), `#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),instructions:fs.readFileSync('AGENTS.md','utf8'),token:process.env.SODACTL_TOKEN??null}));setInterval(()=>{},1000);\n`);
    await chmod(join(bin, "claude"), 0o700);
    vi.stubEnv("PATH", bin + ":" + process.env.PATH);
    await writeFile(join(local, "README.md"), "local untouched"); await writeFile(join(remote, "README.md"), "remote original");
    await writeFile(join(remote, "AGENTS.md"), "Remote project rules");
    const a = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: join(dir, "a"), shell: "/bin/sh", origin: [] }); servers.push(a);
    const b = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: join(dir, "b"), shell: "/bin/sh", origin: [] }); servers.push(b);
    const ao = { url: `http://127.0.0.1:${a.options.port}`, token: a.freshToken!, urlExplicit: true }, bo = { url: `http://127.0.0.1:${b.options.port}`, token: b.freshToken!, urlExplicit: true };
    const store = new FsSessionStore(join(dir, "session.json"));
    const target = await withSession(bo, store, c => c.request("workspace.create", { cwd: remote }));
    await withSession(bo, store, c => c.request("workspace.set_project_folder", { workspaceId: target.workspace.id, path: remote }));
    const scope = { workspaceId: target.workspace.id, expectedFolder: remote, agentKind: "claude" as const };
    await withSession(bo, store, c => c.request("work.memory", { ...scope, sourcePaneId: target.pane.id, action: "write", name: "MEMORY.md", content: "remember B tasks" }));
    const invite = await withSession(ao, store, c => c.request("machine.invite", { label: "target" }));
    await withSession(bo, store, c => c.request("machine.delegate", { url: ao.url, machineId: invite.machineId, token: invite.token }));
    await withSession(ao, store, async c => { await expect.poll(async () => (await c.request("machine.list", {})).machines[0]?.state).toBe("online"); });
    const request = () => withSession(bo, store, c => c.request("work.agent_request", { paneId: target.pane.id, agentKind: "claude", args: ["--resume", "--model", "sonnet"] }));
    const r = await request();
    // A receives no process just because B created a request.
    await expect(readFile(marker)).rejects.toThrow();
    const launched = await withSession(ao, store, c => c.request("work.agent_launch", { machineId: invite.machineId, requestId: r.id }, { timeoutMs: 60000 }));
    expect(a.session.getPane(launched.paneId)).toBeDefined();
    expect(await readFile(join(dir, "a/work-agents/panes", launched.paneId), "utf8")).toContain("plain native resume is not allowed");
    await expect.poll(async () => JSON.parse(await readFile(marker, "utf8"))).toMatchObject({ args: expect.arrayContaining(["--resume", "--model", "sonnet"]), token: null });
    const native = JSON.parse(await readFile(marker, "utf8"));
    expect(native.instructions).toContain("Remote project rules"); expect(native.instructions).toContain("remember B tasks");
    expect(native.args.slice(-3)).toEqual(["--resume", "--model", "sonnet"]);
    expect(native.cwd).not.toBe(remote); expect(native.cwd).not.toBe(local);
    const launchDir = join(dir, "a/work-agents/launches", (await readdir(join(dir, "a/work-agents/launches")))[0]!);
    const capabilityFile = join(launchDir, "capability.json"), cap = JSON.parse(await readFile(capabilityFile, "utf8"));
    expect(Object.keys(cap).sort()).toEqual(["secret", "socketPath"]);
    proxy = await WorkAgentClient.open(capabilityFile);
    // Explicit binary exchange is the sole operation that touches operator files.
    const binary = randomBytes(170001), operatorSource = join(local, "material.xlsx"), operatorSaved = join(local, "result.xlsx");
    await writeFile(operatorSource, binary);
    const upload = await proxy.request("tool", { operation: "transfer", action: "upload", sourcePath: operatorSource, destinationPath: "material.xlsx" });
    expect(upload).toMatchObject({ status: "completed", destination: join(remote, "material.xlsx"), bytes: binary.length, sha256: createHash("sha256").update(binary).digest("hex") });
    expect(await readFile(join(remote, "material.xlsx"))).toEqual(binary);
    const download = await proxy.request("tool", { operation: "transfer", action: "download", sourcePath: "material.xlsx", destinationPath: operatorSaved });
    expect(download).toMatchObject({ status: "completed", destination: operatorSaved, bytes: binary.length });
    expect(await readFile(operatorSaved)).toEqual(binary);
    expect(await proxy.request("tool", { operation: "transfer", action: "download", sourcePath: "material.xlsx", destinationPath: operatorSaved })).toMatchObject({ status: "failed", destination: operatorSaved });
    expect(await proxy.request("tool", { operation: "transfer", action: "upload", sourcePath: operatorSource, destinationPath: "../outside.xlsx" })).toMatchObject({ status: "failed" });
    const escaped = "\u0001".repeat(300000);
    await writeFile(join(remote, "escaped.txt"), escaped);
    const large = await proxy.request<{ text: string }>("tool", { operation: "file", action: "read", path: "escaped.txt" });
    expect(JSON.stringify(large).length).toBeGreaterThan(1024 * 1024);
    // A valid large response must leave the capability connected for the next read/write.
    const file = await proxy.request<{ version: string; content: string }>("tool", { operation: "file", action: "read", path: "README.md" });
    await proxy.request("tool", { operation: "file", action: "write", path: "README.md", content: "remote changed", version: file.version });
    const executed = await proxy.request<{ stdout: string; exitCode: number }>("tool", { operation: "exec", command: "printf remote-run > executed.txt; pwd" });
    expect(executed.exitCode).toBe(0); expect(executed.stdout.trim()).toBe(remote);
    expect(await readFile(join(remote, "executed.txt"), "utf8")).toBe("remote-run");
    const cancelled = proxy.request<{ cancelled: boolean }>("tool", { operation: "exec", command: "printf started > cancel-started; sleep 30; touch should-not-run" });
    await expect.poll(async () => readFile(join(remote, "cancel-started"), "utf8")).toBe("started");
    await proxy.request("cancel");
    expect((await cancelled).cancelled).toBe(true);
    await expect(readFile(join(remote, "should-not-run"))).rejects.toThrow();
    // ExecService retains completed output until its owning channel closes (32 jobs max).
    for (let i = 0; i < 33; i++) {
      const result = await proxy.request<{ exitCode: number }>("tool", { operation: "exec", command: ":" });
      expect(result.exitCode).toBe(0);
    }
    const memo = await proxy.request<{ version: string }>("tool", { operation: "memory", action: "read", name: "MEMORY.md" });
    await proxy.request("tool", { operation: "memory", action: "write", content: "updated B tasks", version: memo.version });
    expect(await readFile(join(remote, ".soda/agent-memory", target.pane.id, "MEMORY.md"), "utf8")).toBe("updated B tasks");
    await expect(proxy.request("tool", { operation: "exec", command: "pwd", cwd: local })).rejects.toThrow();
    expect(await readFile(join(local, "README.md"), "utf8")).toBe("local untouched");
    // A denied duplicate must not release the original launch's reservation.
    for (let i = 0; i < 2; i++) {
      const duplicate = await request();
      await expect(withSession(ao, store, c => c.request("work.agent_launch", { machineId: invite.machineId, requestId: duplicate.id }))).rejects.toThrow(/起動済み/);
    }
    await withSession(bo, store, c => c.request("workspace.set_project_folder", { workspaceId: target.workspace.id, path: other }));
    expect(await proxy.request("tool", { operation: "transfer", action: "download", sourcePath: "material.xlsx", destinationPath: join(local, "changed-project.xlsx") })).toMatchObject({ status: "failed" });
    await expect(readFile(join(local, "changed-project.xlsx"))).rejects.toThrow();
    await expect(proxy.request("tool", { operation: "file", action: "read", path: "README.md" })).rejects.toThrow();
    await expect(proxy.request("tool", { operation: "exec", command: "touch should-not-exist" })).rejects.toThrow();
    await expect(readFile(join(local, "should-not-exist"))).rejects.toThrow();
    await b.close(); servers.pop();
    await expect(proxy.request("tool", { operation: "inspect" })).rejects.toThrow();
  } finally {
    proxy?.close(); for (const server of servers.reverse()) await server.close();
    vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true });
  }
}, 90000);
