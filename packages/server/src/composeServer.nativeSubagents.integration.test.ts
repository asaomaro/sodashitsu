import { chmod, mkdir, mkdtemp, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import { assertPaneResolvesFake } from "./testing/fakeAgentGuard.js";
import { NativeSubagentReader } from "./agent/NativeSubagentReader.js";

// Actual production new/start/read/publish/close path; only the terminal's CLI is a guarded fake.
it.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("publishes real native lifecycle file fixtures through composeServer snapshot and events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-native-subagent-it-"));
  const saved = { HOME: process.env.HOME, PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME, ENV: process.env.ENV };
  let server: Awaited<ReturnType<typeof composeServerOnFreePort>> | undefined, ws: WebSocket | undefined;
  const closedReader = vi.spyOn(NativeSubagentReader.prototype, "close");
  try {
    const bin = join(dir, "bin"), codexHome = join(dir, ".codex");
    await mkdir(bin);
    const script = join(dir, "fake-agent.mjs");
    await writeFile(script, 'process.stdin.setRawMode(true);process.stdout.write("OpenAI Codex fixture ready\\r\\n");process.stdin.on("data",d=>{if(String(d).includes("q"))process.exit(0)});');
    await writeFile(join(bin, "codex"), `#!/bin/bash\nexec -a codex ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);
    await chmod(join(bin, "codex"), 0o755);
    process.env.HOME = dir; process.env.CODEX_HOME = codexHome; process.env.PATH = `${bin}:${saved.PATH}`; delete process.env.ENV;
    server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: join(dir, "state"), origin: [], shell: "/bin/bash" });
    const live = server, paneId = live.session.snapshot().panes[0]!.id;
    const fixture = (await readFile(new URL("./agent/fixtures/native-subagents/codex.jsonl", import.meta.url), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const id = fixture[0].payload.thread_id, records = join(codexHome, "sessions", "2026", "11", "07");
    await mkdir(records, { recursive: true });
    const file = join(records, `rollout-fixture-${id}.jsonl`);
    await writeFile(file, JSON.stringify({ type: "session_meta", payload: { id, cwd: live.session.getPane(paneId)!.cwd, originator: "codex_cli_rs", source: "cli", timestamp: new Date().toISOString() } }) + "\n" + JSON.stringify(fixture[0]) + "\n");
    const port = live.options.port, origin = `http://127.0.0.1:${port}`;
    const login = await fetch(`${origin}/api/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token: live.freshToken }) });
    expect(login.status).toBe(204);
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin, cookie: login.headers.get("set-cookie")!.split(";")[0]! } });
    await new Promise<void>((resolve, reject) => { ws!.once("open", resolve); ws!.once("error", reject); });
    const socket = ws, events: any[] = [], pending = new Map<string, (value: any) => void>(); let sequence = 0;
    socket.on("message", (raw, binary) => {
      if (binary) return;
      const message = JSON.parse(raw.toString());
      if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
      else if (message.event === "pane.agent_status_changed") events.push(message.data);
    });
    const hello = () => new Promise<any>(resolve => { const requestId = `hello-${++sequence}`; pending.set(requestId, resolve); socket.send(JSON.stringify({ id: requestId, method: "client.hello", params: { protocol: 1, kind: "desktop" } })); });
    await hello();
    await assertPaneResolvesFake({ write: input => live.terminals.get(paneId)!.write(input), name: "codex", fakeDir: bin, scratchDir: dir });
    live.terminals.get(paneId)!.write(`codex resume ${id}\r`);
    await vi.waitFor(() => expect(live.session.getPane(paneId)?.agentSession).toMatchObject({ kind: "codex", sessionId: id }), { timeout: 12000, interval: 50 });
    await vi.waitFor(() => expect(events.some(event => event.paneId === paneId && event.agent?.subagents?.count === 1)).toBe(true), { timeout: 8000, interval: 50 });
    const snapshot = (await hello()).result.snapshot;
    expect(snapshot.panes.find((pane: any) => pane.id === paneId).agent.subagents).toMatchObject({ count: 1, items: [{ id: fixture[0].payload.item.agent_thread_id, description: "probe_child" }] });
    await appendFile(file, fixture.slice(1).map(row => JSON.stringify(row) + "\n").join(""));
    await vi.waitFor(() => expect(events.some(event => event.paneId === paneId && event.agent?.subagents?.count === 0)).toBe(true), { timeout: 8000, interval: 50 });
    expect(live.session.getPane(paneId)?.agent?.subagents).toEqual({ count: 0, items: [] });
  } finally {
    ws?.close(); await server?.close();
    const didClose = closedReader.mock.calls.length > 0;
    closedReader.mockRestore();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    if (server) expect(didClose).toBe(true);
  }
}, 35000);
