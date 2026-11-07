import { lstat, realpath, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { openVerified } from "./safeFile.js";

export type CodexObservedState = "working" | "idle" | "unknown";
export interface CodexControlTarget {
  home: string;
  parentId: string;
  childIds: readonly string[];
  signal: AbortSignal;
  current(): boolean;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const active = new Set<WebSocket>();
const parents = new Set<string>();
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Runtime status only. A flag is not inferred to mean work or idle. */
export function codexObservedState(value: unknown): CodexObservedState {
  const status = object(value);
  if (status?.type === "idle") return "idle";
  if (status?.type === "active" && Array.isArray(status.activeFlags) && status.activeFlags.length === 0) return "working";
  return "unknown";
}

async function smallFile(path: string): Promise<string> {
  const opened = await openVerified(path);
  if (!opened) throw Error("Control metadata unavailable");
  try {
    if (opened.st.uid !== process.getuid?.() || (opened.st.mode & 0o022) || opened.st.size > 16384) throw Error("Control metadata ownership unavailable");
    const bytes = Buffer.alloc(opened.st.size + 1), read = await opened.fd.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== opened.st.size || (await opened.fd.stat()).size !== opened.st.size) throw Error("Control metadata changed");
    return bytes.subarray(0, read.bytesRead).toString("utf8");
  } finally { await opened.fd.close(); }
}

/** Existing Linux daemon only. Other OS transports are deliberately unimplemented.
 * No CLI launch, daemon discovery command, model call, thread start/resume or write method. */
export async function readCodexControlStatus(target: CodexControlTarget): Promise<Map<string, CodexObservedState>> {
  const unknown = (): Map<string, CodexObservedState> => new Map(target.childIds.slice(0, 64).map(id => [id, "unknown" as const]));
  if (process.platform !== "linux" || !process.getuid || !UUID.test(target.parentId) || target.childIds.length > 64 || target.childIds.some(id => !UUID.test(id) || id === target.parentId) || new Set(target.childIds).size !== target.childIds.length) return unknown();
  const started = performance.now(), deadline = started + 1500;
  const live = () => { if (target.signal.aborted || !target.current() || performance.now() >= deadline) throw Error("Control scope expired"); };
  let ws: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, parentKey: string | undefined;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let next = 0, total = 0, closed = false;
  const fail = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("Control unavailable")); } pending.clear(); };
  const abort = () => { fail(); ws?.terminate(); };
  try {
    live();
    const home = await realpath(target.home), homeStat = await lstat(home), control = join(home, "app-server-control"), daemon = join(home, "app-server-daemon");
    if (homeStat.uid !== process.getuid() || (homeStat.mode & 0o022)) return unknown();
    for (const directory of [control, daemon]) {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o022) || await realpath(directory) !== directory) return unknown();
    }
    const link = join(control, "app-server-control.sock"), linkStat = await lstat(link), socket = await realpath(link);
    if (linkStat.uid !== process.getuid()) return unknown();
    const parentStat = await lstat(dirname(socket)), socketStat = await lstat(socket);
    if (!parentStat.isDirectory() || parentStat.uid !== process.getuid() || (parentStat.mode & 0o077) || !socketStat.isSocket() || socketStat.uid !== process.getuid() || (socketStat.mode & 0o077)) return unknown();
    const pidPath = join(daemon, "daemon.pid"), pidText = await smallFile(pidPath), pid = object(JSON.parse(pidText))?.pid;
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1) return unknown();
    const processPath = `/proc/${pid}`, processStat = await lstat(processPath);
    if (processStat.uid !== process.getuid()) return unknown();
    const identity = async () => {
      const text = await readFile(join(processPath, "stat"), "utf8"), fields = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (!/^\d+$/.test(fields[19] ?? "")) throw Error("Daemon identity unavailable");
      return fields[19];
    };
    const generation = await identity(); live();
    parentKey = JSON.stringify([home, target.parentId]);
    if (active.size >= 2 || parents.has(parentKey)) return unknown();
    ws = new WebSocket(`ws+unix://${socket}:/`, { handshakeTimeout: 1000, maxPayload: 1024 * 1024, followRedirects: false, perMessageDeflate: false });
    active.add(ws); parents.add(parentKey);
    const owned = ws, key = parentKey;
    ws.once("close", () => { closed = true; active.delete(owned); parents.delete(key); fail(); });
    ws.on("error", fail);
    target.signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, Math.max(1, deadline - performance.now()));
    await new Promise<void>((resolve, reject) => { ws!.once("open", resolve); ws!.once("error", reject); ws!.once("close", () => reject(Error("Control closed"))); }); live();
    ws.on("message", (bytes, binary) => {
      try {
        if (binary) throw Error("Control requires text frames");
        const buffer = Buffer.isBuffer(bytes) ? bytes : bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.concat(bytes);
        total += buffer.length;
        if (total > 4 * 1024 * 1024) throw Error("Control output limit");
        const row = object(JSON.parse(buffer.toString()));
        if (!row) throw Error("Control envelope invalid");
        // Notifications are intentionally discarded, never cached or forwarded.
        if (row.id === undefined) return;
        if (typeof row.id !== "number") throw Error("Control response identity invalid");
        const request = pending.get(row.id); if (!request) throw Error("Control response unexpected");
        pending.delete(row.id); clearTimeout(request.timer);
        if (row.error !== undefined || !Object.hasOwn(row, "result")) request.reject(Error("Control read rejected"));
        else request.resolve(row.result);
      } catch { fail(); ws?.terminate(); }
    });
    const request = (method: "initialize" | "thread/loaded/list" | "thread/read", params: object): Promise<unknown> => {
      live(); if (closed || ws?.readyState !== WebSocket.OPEN || next >= 66) throw Error("Control read budget exhausted");
      const id = ++next;
      return new Promise((resolve, reject) => { const requestTimer = setTimeout(() => { pending.delete(id); reject(Error("Control read deadline")); }, Math.min(1000, deadline - performance.now())); pending.set(id, { resolve, reject, timer: requestTimer }); ws!.send(JSON.stringify({ id, method, params })); });
    };
    const initialized = object(await request("initialize", { clientInfo: { name: "sodashitsu-subagent-status", version: "0.1.0" }, capabilities: { experimentalApi: true } })); live();
    if (typeof initialized?.userAgent !== "string" || initialized.userAgent.length > 1024) return unknown();
    ws.send(JSON.stringify({ method: "initialized", params: {} }));
    const loaded = object(await request("thread/loaded/list", {}))?.data;
    if (!Array.isArray(loaded) || loaded.length > 10000 || loaded.some(id => typeof id !== "string" || !UUID.test(id)) || !loaded.includes(target.parentId)) return unknown();
    const states = unknown();
    for (const id of target.childIds) {
      live(); if (!loaded.includes(id)) continue;
      const thread = object(object(await request("thread/read", { threadId: id, includeTurns: false }))?.thread);
      if (thread?.id !== id) return unknown();
      states.set(id, codexObservedState(thread.status));
    }
    live();
    const afterSocket = await lstat(socket);
    if (await realpath(link) !== socket || afterSocket.dev !== socketStat.dev || afterSocket.ino !== socketStat.ino || afterSocket.uid !== socketStat.uid || (afterSocket.mode & 0o077) || await smallFile(pidPath) !== pidText || await identity() !== generation) return unknown();
    live(); return states;
  } catch { return unknown(); }
  finally {
    if (timer) clearTimeout(timer); target.signal.removeEventListener("abort", abort); fail();
    // Quota belongs to the physical socket, not just this request promise.
    if (ws && !closed) ws.terminate();
  }
}
