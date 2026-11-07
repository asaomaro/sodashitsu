import { createServer } from "node:http";
import { mkdtemp, mkdir, chmod, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { codexObservedState, readCodexControlStatus, type CodexControlTarget } from "./CodexControlStatus.js";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
it.each([
  [{ type: "active", activeFlags: [] }, "working"], [{ type: "idle" }, "idle"],
  [{ type: "active", activeFlags: ["waitingOnApproval"] }, "unknown"],
  [{ type: "active", activeFlags: ["waitingOnUserInput"] }, "unknown"],
  [{ type: "active", activeFlags: ["newFlag"] }, "unknown"],
  [{ type: "active" }, "unknown"], [{ type: "notLoaded" }, "unknown"], [{ type: "systemError" }, "unknown"], [null, "unknown"],
])("uses only a definite runtime state: %j", (input, state) => expect(codexObservedState(input)).toBe(state));
async function fixture(options: {
  loaded?: (ids: string[]) => unknown;
  status?: unknown;
  read?: (ws: WebSocket, id: number) => void | Promise<void>;
  init?: unknown;
} = {}) {
  const home = await mkdtemp(join(tmpdir(), "soda-control-status-"));
  const control = join(home, "app-server-control"), daemon = join(home, "app-server-daemon");
  await mkdir(control, { mode: 0o700 }); await mkdir(daemon, { mode: 0o700 });
  const pidPath = join(daemon, "daemon.pid"); await writeFile(pidPath, JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  const parentId = randomUUID(), childIds = [randomUUID(), randomUUID()], socket = join(control, "app-server-control.sock");
  const http = createServer(), server = new WebSocketServer({ server: http });
  await new Promise<void>(resolve => http.listen(socket, resolve)); await chmod(socket, 0o600);
  const requests: string[] = []; let connections = 0;
  server.on("connection", ws => {
    connections++;
    ws.on("message", async bytes => {
      const row = JSON.parse(bytes.toString()); requests.push(row.method);
      if (row.id === undefined) return;
      if (row.method === "thread/read" && options.read) { await options.read(ws, row.id); return; }
      const result = row.method === "initialize" ? options.init ?? { userAgent: "generated-fixture" } : row.method === "thread/loaded/list" ? { data: options.loaded ? options.loaded([parentId, ...childIds]) : [parentId, ...childIds] } : { thread: { id: row.params.threadId, status: options.status ?? { type: "active", activeFlags: [] } } };
      ws.send(JSON.stringify({ id: row.id, result }));
    });
  });
  cleanups.push(async () => { for (const ws of server.clients) ws.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); await new Promise<void>(resolve => http.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  const controller = new AbortController();
  const target: CodexControlTarget = { home, parentId, childIds, signal: controller.signal, current: () => true };
  return { target, controller, requests, socket, pidPath, connections: () => connections };
}
const linux = it.runIf(process.platform === "linux");
linux("reads existing owned Unix WebSocket metadata and sends only the readonly methods", async () => {
  const f = await fixture(), result = await readCodexControlStatus(f.target);
  expect([...result.values()]).toEqual(["working", "working"]);
  expect(f.requests).toEqual(["initialize", "initialized", "thread/loaded/list", "thread/read", "thread/read"]);
});
linux("does not revive a child absent from loaded threads", async () => {
  const f = await fixture({ loaded: ids => ids.slice(0, 2) });
  expect([...await readCodexControlStatus(f.target)].map(row => row[1])).toEqual(["working", "unknown"]);
  expect(f.requests.filter(m => m === "thread/read")).toHaveLength(1);
});
linux("requires the loaded parent", async () => {
  const f = await fixture({ loaded: ids => ids.slice(1) });
  expect([...await readCodexControlStatus(f.target)].every(row => row[1] === "unknown")).toBe(true);
  expect(f.requests).not.toContain("thread/read");
});
linux.each([{ type: "idle" }, { type: "notLoaded" }, { type: "active", activeFlags: ["waitingOnApproval"] }, { type: "active", activeFlags: ["waitingOnUserInput"] }])("preserves runtime status meaning: %j", async status => {
  const f = await fixture({ status });
  expect([...await readCodexControlStatus(f.target)].map(row => row[1])).toEqual([codexObservedState(status), codexObservedState(status)]);
});
linux("rejects malformed read identity and bounded loaded list", async () => {
  const f = await fixture({ read: (ws, id) => { ws.send(JSON.stringify({ id, result: { thread: { id: randomUUID(), status: { type: "idle" } } } })); } });
  expect([...await readCodexControlStatus(f.target)].every(row => row[1] === "unknown")).toBe(true);
  const huge = await fixture({ loaded: () => Array.from({ length: 10001 }, () => randomUUID()) });
  expect([...await readCodexControlStatus(huge.target)].every(row => row[1] === "unknown")).toBe(true);
});
linux("rejects changed daemon generation after a successful read", async () => {
  const f = await fixture({ read: async (ws, id) => { await writeFile(f.pidPath, JSON.stringify({ pid: process.pid, replaced: true })); ws.send(JSON.stringify({ id, result: { thread: { id: f.target.childIds[0], status: { type: "idle" } } } })); } });
  f.target.childIds = f.target.childIds.slice(0, 1);
  expect([...await readCodexControlStatus(f.target)].map(row => row[1])).toEqual(["unknown"]);
});
linux("rejects changed socket permissions, stale scope and abort", async () => {
  const f = await fixture(); await chmod(f.socket, 0o666);
  expect([...await readCodexControlStatus(f.target)].every(row => row[1] === "unknown")).toBe(true); expect(f.connections()).toBe(0);
  const stale = await fixture(); stale.target.current = () => false;
  expect([...await readCodexControlStatus(stale.target)].every(row => row[1] === "unknown")).toBe(true); expect(stale.connections()).toBe(0);
  const aborted = await fixture({ read: () => { aborted.controller.abort(); } });
  expect([...await readCodexControlStatus(aborted.target)].every(row => row[1] === "unknown")).toBe(true);
});
linux("bounds a withheld request and blocks duplicate parent/concurrent connections", async () => {
  const f = await fixture({ read: () => {} });
  const first = readCodexControlStatus(f.target); await new Promise(resolve => setTimeout(resolve, 30));
  const duplicate = await readCodexControlStatus(f.target);
  expect([...duplicate.values()]).toEqual(["unknown", "unknown"]); expect(f.connections()).toBe(1);
  f.controller.abort(); await first;
});
linux("does not exceed child input limits or accept invalid initialize", async () => {
  const f = await fixture(); f.target.childIds = Array.from({ length: 65 }, () => randomUUID());
  expect([...await readCodexControlStatus(f.target)].every(row => row[1] === "unknown")).toBe(true); expect(f.connections()).toBe(0);
  const invalid = await fixture({ init: { userAgent: null } });
  expect([...await readCodexControlStatus(invalid.target)].every(row => row[1] === "unknown")).toBe(true); expect(invalid.requests).not.toContain("thread/loaded/list");
});

linux("bounds request timeout without publishing a partial successful batch", async () => {
  const f = await fixture({ read: () => {} }), started = performance.now();
  expect([...await readCodexControlStatus(f.target)].map(row => row[1])).toEqual(["unknown", "unknown"]);
  expect(performance.now() - started).toBeLessThan(2500);
});
linux("keeps the global two-socket quota and rejects oversize or invalid envelopes", async () => {
  const a = await fixture({ read: () => {} }), b = await fixture({ read: () => {} }), c = await fixture();
  const first = readCodexControlStatus(a.target), second = readCodexControlStatus(b.target);
  await new Promise(resolve => setTimeout(resolve, 40));
  expect([...await readCodexControlStatus(c.target)].every(row => row[1] === "unknown")).toBe(true); expect(c.connections()).toBe(0);
  a.controller.abort(); b.controller.abort(); await Promise.all([first, second]);
  await new Promise(resolve => setTimeout(resolve, 20));
  const malformed = await fixture({ read: (ws) => { ws.send("not-json"); } });
  expect([...await readCodexControlStatus(malformed.target)].every(row => row[1] === "unknown")).toBe(true);
  const binary = await fixture({ read: (ws, id) => { ws.send(Buffer.from(JSON.stringify({ id, result: {} }))); } });
  expect([...await readCodexControlStatus(binary.target)].every(row => row[1] === "unknown")).toBe(true);
  const huge = await fixture({ read: (ws) => { ws.send("x".repeat(1024 * 1024 + 1)); } });
  expect([...await readCodexControlStatus(huge.target)].every(row => row[1] === "unknown")).toBe(true);
});
