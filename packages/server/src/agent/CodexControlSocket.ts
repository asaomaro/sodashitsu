import { lstat, realpath, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { openVerified } from "./safeFile.js";
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
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


/** Provider-owned existing daemon. No discovery CLI, daemon/model launch or arbitrary endpoint. */
async function ownedSocket(homeInput: string, check: () => void) {
    if (process.platform !== "linux" || !process.getuid) throw Error("Control transport unavailable");
    check();
    const home = await realpath(homeInput), homeStat = await lstat(home), control = join(home, "app-server-control"), daemon = join(home, "app-server-daemon");
    if (homeStat.uid !== process.getuid() || (homeStat.mode & 0o022)) throw Error("Control ownership unavailable");
    for (const directory of [control, daemon]) {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o022) || await realpath(directory) !== directory) throw Error("Control ownership unavailable");
    }
    const link = join(control, "app-server-control.sock"), linkStat = await lstat(link), socket = await realpath(link);
    if (linkStat.uid !== process.getuid()) throw Error("Control ownership unavailable");
    const parentStat = await lstat(dirname(socket)), socketStat = await lstat(socket);
    if (!parentStat.isDirectory() || parentStat.uid !== process.getuid() || (parentStat.mode & 0o077) || !socketStat.isSocket() || socketStat.uid !== process.getuid() || (socketStat.mode & 0o077)) throw Error("Control ownership unavailable");
    const pidPath = join(daemon, "daemon.pid"), pidText = await smallFile(pidPath), pid = object(JSON.parse(pidText))?.pid;
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1) throw Error("Control ownership unavailable");
    const processPath = `/proc/${pid}`, processStat = await lstat(processPath);
    if (processStat.uid !== process.getuid()) throw Error("Control ownership unavailable");
    const identity = async () => {
      const text = await readFile(join(processPath, "stat"), "utf8"), fields = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (!/^\d+$/.test(fields[19] ?? "")) throw Error("Daemon identity unavailable");
      return fields[19];
    };
    const generation = await identity(); check();

    return { home, socket, unchanged: async () => { try { check();
    const afterSocket = await lstat(socket);
    return await realpath(link) === socket && afterSocket.dev === socketStat.dev && afterSocket.ino === socketStat.ino && afterSocket.uid === socketStat.uid && !(afterSocket.mode & 0o077) && await smallFile(pidPath) === pidText && await identity() === generation;
    } catch { return false; } } };
}
export interface CodexChannelTarget {
  home: string;
  key: string;
  signal: AbortSignal;
  expires: number;
  check(): void;
  requestMs: number;
  maxRequests: number;
  owned?: Set<Promise<void>>;
}
export interface CodexControlChannel<M extends string> {
  request(method: M, params: object): Promise<unknown>;
  initialized(): void;
  unchanged(): Promise<boolean>;
  close(): Promise<boolean>;
}
const active = new Set<WebSocket>();
const keys = new Set<string>();
/** Each caller supplies a typed AND runtime method allowlist. Status readers do not
 * inherit Audio's turn/start capability, or model-catalog methods. */
export async function openCodexControl<M extends string>(target: CodexChannelTarget, allowed: readonly M[]): Promise<CodexControlChannel<M>> {
  const live = () => { target.signal.throwIfAborted(); target.check(); if (performance.now() >= target.expires) throw Error("Control deadline"); };
  live();
  const lease = await ownedSocket(target.home, live); live();
  const key = JSON.stringify([lease.home, target.key]);
  if (active.size >= 2 || keys.has(key)) throw Error("Control connection quota");
  const ws = new WebSocket(`ws+unix://${lease.socket}:/`, { handshakeTimeout: Math.min(1000, target.expires - performance.now()), maxPayload: 1024 * 1024, followRedirects: false, perMessageDeflate: false });
  active.add(ws); keys.add(key);
  const pending = new Map<number, {resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>}>();
  let next = 0, total = 0, closed = false, failure: Error | undefined, initialized = false;
  let finishClose!: () => void; const physicalClose = new Promise<void>(resolve => { finishClose = resolve; });
  target.owned?.add(physicalClose);
  const fail = (error = Error("Control connection unavailable; do not retry uncertain delivery")) => {
    failure ??= error;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(failure); } pending.clear();
  };
  const abort = () => { fail(Error("Control cancelled; do not retry uncertain delivery")); ws.terminate(); };
  const deadline = setTimeout(() => { fail(Error("Control deadline; do not retry uncertain delivery")); ws.terminate(); }, Math.max(1, target.expires - performance.now()));
  const closedHandler = () => { closed = true; clearTimeout(deadline); target.signal.removeEventListener("abort", abort); active.delete(ws); keys.delete(key); target.owned?.delete(physicalClose); fail(); finishClose(); };
  ws.once("close", closedHandler); ws.on("error", () => fail());
  target.signal.addEventListener("abort", abort, { once: true });
  ws.on("message", (bytes, binary) => {
    try {
      if (binary) throw Error("Control requires text frames");
      const buffer = Buffer.isBuffer(bytes) ? bytes : bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.concat(bytes);
      total += buffer.length; if (total > 4 * 1024 * 1024) throw Error("Control output limit");
      const row = object(JSON.parse(buffer.toString())); if (!row) throw Error("Control envelope invalid");
      if (row.id === undefined) return; // Never retain/forward notification content.
      if (typeof row.id !== "number") throw Error("Control response identity invalid");
      const p = pending.get(row.id); if (!p) throw Error("Unexpected control response");
      pending.delete(row.id); clearTimeout(p.timer);
      if (row.error !== undefined || !Object.hasOwn(row, "result")) p.reject(Error("Control request rejected; do not retry uncertain delivery"));
      else p.resolve(row.result);
    } catch { fail(); ws.terminate(); }
  });
  const close = async () => {
    fail(); if (!closed) ws.terminate();
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([physicalClose, new Promise<void>(resolve => { timer = setTimeout(resolve, 1250); })]);
    if (timer) clearTimeout(timer); return closed; // Quota releases ONLY in the physical close event.
  };
  try {
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); ws.once("close", () => reject(Error("Control closed"))); }); live();
  } catch (error) { await close(); throw error; }
  return {
    request: (method, params) => {
      live(); if (failure) throw failure;
      if (!allowed.includes(method) || next >= target.maxRequests || closed || ws.readyState !== WebSocket.OPEN) throw Error("Control method/budget unavailable");
      const id = ++next;
      return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); const error = Error("Control request deadline; do not retry uncertain delivery"); fail(error); ws.terminate(); reject(error); }, Math.max(1, Math.min(target.requestMs, target.expires - performance.now()))); pending.set(id, {resolve, reject, timer}); ws.send(JSON.stringify({id, method, params})); });
    },
    initialized: () => { live(); if (failure || initialized || closed || ws.readyState !== WebSocket.OPEN) throw Error("Control initialization unavailable"); initialized = true; ws.send(JSON.stringify({method:"initialized",params:{}})); },
    unchanged: async () => { try { live(); const same = await lease.unchanged(); live(); return same; } catch { return false; } },
    close,
  };
}
