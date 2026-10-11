// Windowsネイティブでのみ実行。利用者の状態・会話に触れず一時stateと偽Claudeを使う。
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { decodeFrame } from "@sodashitsu/protocol";
if (process.platform !== "win32") throw new Error("Run this check with native Windows Node.js");
const dir = await mkdtemp(join(tmpdir(), "soda-windows-check-")),
  bin = join(dir, "bin"),
  state = join(dir, "state");
await mkdir(bin);
await mkdir(state);
await writeFile(
  join(state, "prefs.json"),
  JSON.stringify({ schema: 1, rev: 1, prefs: { onboarding: false } }),
);
const fake = join(bin, "claude.js");
await writeFile(
  fake,
  `import {connect} from 'node:net';import {randomUUID} from 'node:crypto';import {writeFileSync} from 'node:fs';
const args=process.argv.slice(2),id=randomUUID();writeFileSync(process.env.TEST_RECORD+'-'+process.env.SODA_PANE_ID,JSON.stringify({pid:process.pid,args,cwd:process.cwd(),id}));
setTimeout(()=>{const s=connect(process.env.SODA_AGENT_REPORT_SOCKET);s.on('error',()=>{});s.on('connect',()=>s.end(JSON.stringify({paneId:process.env.SODA_PANE_ID,kind:'claude',sessionId:id,agentPid:process.pid})+'\\n'));},500);
process.stdin.setRawMode?.(true);process.stdin.resume();process.stdout.write('\\r\\n❯ ');process.stdin.on('data',()=>process.stdout.write('\\r\\n❯ '));setInterval(()=>{},1000);`,
);
await writeFile(join(bin, "package.json"), ' {"type":"module"}');
await writeFile(
  join(bin, "claude.cmd"),
  `@echo off\r\nset "_prog=${process.execPath}"\r\n"%_prog%" "%dp0%\\claude.js" %*\r\n`,
);
const port = await new Promise((r) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});
const app = join(dir, "app");
await mkdir(join(app, "packages/server"), { recursive: true });
await cp(resolve("packages/server/dist"), join(app, "packages/server/dist"), { recursive: true });
await writeFile(join(app, "package.json"), '{"type":"module"}');
await symlink(resolve("node_modules"), join(app, "node_modules"), "junction");
await cp(
  resolve("third_party/herdr/agent-detection"),
  join(app, "third_party/herdr/agent-detection"),
  { recursive: true },
);
const entry = join(app, "packages/server/dist/main.js"),
  cliEntry = join(app, "packages/server/dist/check-cli.js");
const original = await readFile(entry, "utf8");
await writeFile(cliEntry, original);
// 長いcloseを模して引き継ぎ情報を期限切れにする。親が候補起動前に期限を更新することを検証。
const stale = original.replace(
  "replaceWorker: nonce => {",
  "replaceWorker: nonce => { const path=join(server.options.stateDir,'handoff.json'); const value=JSON.parse(checkRead(path,'utf8')); value.createdAt=new Date(Date.now()-120000).toISOString(); checkWrite(path,JSON.stringify(value));",
);
assert.notEqual(stale, original, "test injection must match the compiled worker entry");
await writeFile(
  entry,
  "import {readFileSync as checkRead,writeFileSync as checkWrite} from 'node:fs';\n" +
    stale.replace(/^#![^\n]*\n/, ""),
);

const env = {
  ...process.env,
  PATH: bin + ";" + (process.env.PATH ?? process.env.Path ?? ""),
  TEST_RECORD: join(dir, "agent"),
};
const server = spawn(
  process.execPath,
  [
    entry,
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--state-dir",
    state,
    "--shell",
    process.env.SODA_WINDOWS_CHECK_SHELL ?? "powershell.exe",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let output = "";
server.stdout.on("data", (b) => (output += b));
server.stderr.on("data", (b) => (output += b));
let cookie;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const x = await fn();
      if (x) return x;
    } catch (e) {
      last = e;
    }
    await sleep(100);
  }
  throw new Error("Timeout: " + last + " Server output: " + output.slice(-8000));
}
const origin = `http://127.0.0.1:${port}`;
const sockets = [];
async function client() {
  const ws = new WebSocket(origin.replace("http", "ws") + "/ws", {
    headers: { Cookie: cookie, Origin: origin },
  });
  sockets.push(ws);
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  let n = 0;
  const waiting = new Map();
  ws.on("message", (raw, binary) => {
    if (binary) {
      const f = decodeFrame(raw);
      output += "\nPTY " + (f.text ?? Buffer.from(f.chunk ?? []).toString());
      return;
    }
    const m = JSON.parse(raw);
    const p = waiting.get(m.id);
    if (p) {
      waiting.delete(m.id);
      clearTimeout(p.timer);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  });
  ws.on("close", () => {
    for (const p of waiting.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("RPC connection closed"));
    }
    waiting.clear();
  });
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = String(++n);
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 15000);
      waiting.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const hello = await request("client.hello", { protocol: 1, kind: "external" });
  return { ws, request, hello };
}
const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cliEntry, ...args], { env, windowsHide: true });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (out += b));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out }));
  });
try {
  await until(async () => {
    const token = /#token=([a-zA-Z0-9_-]+)/.exec(output)?.[1];
    if (!token) return false;
    const response = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ token }),
    });
    if (response.status !== 204) return false;
    cookie = response.headers.get("set-cookie").split(";")[0];
    return true;
  });
  let c = await client();
  const snap = c.hello.snapshot ?? c.hello;
  const pane = snap.panes[0];
  assert(pane, "initial pane");
  await c.request("pane.subscribe", { paneId: pane.id, scrollbackLines: 4000 });
  // 自動起動。シェル初期化とプロセス走査が終わるまでbusyだけを再試行。
  await until(async () => {
    try {
      await c.request("agent.start", {
        paneId: pane.id,
        name: "windows-parent",
        kind: "claude",
        args: [
          "safe value",
          "literal&value",
          "literal%value",
          "with'quote",
          'with"quote',
          "",
          "%PATH%",
        ],
      });
      return true;
    } catch (e) {
      if (!/agent_pane_busy/.test(String(e))) throw e;
      return false;
    }
  }, 45000);
  const record = await until(async () =>
    JSON.parse(await readFile(join(dir, "agent-" + pane.id), "utf8")),
  );
  assert.deepEqual(record.args, [
    "safe value",
    "literal&value",
    "literal%value",
    "with'quote",
    'with"quote',
    "",
    "%PATH%",
  ]);
  await until(async () => {
    const x = (
      await c.request("client.hello", { protocol: 1, kind: "external" })
    ).snapshot.panes.find((p) => p.id === pane.id);
    return x.agent?.kind === "claude" && x.agentSession?.sessionId;
  }, 45000);
  console.log(
    `PASS: Windows ${process.env.SODA_WINDOWS_CHECK_SHELL ?? "powershell.exe"} agent auto-start, arguments and session detection`,
  );
  const preview = await c.request("agent.fork_preview", { paneId: pane.id });
  assert.equal(preview.available, true);
  const fork = await c.request("agent.fork", { paneId: pane.id, target: { kind: "same" } });
  const cloned = await until(
    async () => JSON.parse(await readFile(join(dir, "agent-" + fork.paneId), "utf8")),
    45000,
  );
  assert(cloned.args.includes("--fork-session"));
  assert(cloned.args.includes(record.id));
  assert.notEqual(cloned.id, record.id);
  console.log("PASS: Windows fork creates another process with a new conversation");
  const handoff = await run(["handoff", "--state-dir", state]);
  assert.equal(handoff.code, 0, handoff.out);
  assert.match(handoff.out, /2 pane\(s\) kept/);
  c.ws.close();
  c = await client();
  const after = c.hello.snapshot ?? c.hello;
  assert(after.panes.some((p) => p.id === pane.id));
  assert(after.panes.some((p) => p.id === fork.paneId));
  assert.equal(JSON.parse(await readFile(join(dir, "agent-" + pane.id), "utf8")).pid, record.pid);
  assert.equal(
    JSON.parse(await readFile(join(dir, "agent-" + fork.paneId), "utf8")).pid,
    cloned.pid,
  );
  process.kill(record.pid, 0);
  process.kill(cloned.pid, 0);
  console.log(
    "PASS: Windows handoff refreshes expired transfer data and preserves both pane IDs and live agent PIDs",
  );
  // preflightを通過した候補workerだけを故障させ、旧コードへのrollbackを確認。
  await writeFile(
    entry,
    original.replace(
      "async function main()",
      "if (workerData?.nonce) throw new Error('deliberate candidate failure');\nasync function main()",
    ),
  );
  const failed = await run(["handoff", "--state-dir", state]);
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /failed after it was accepted/);
  await writeFile(entry, original);
  c.ws.close();
  c = await client();
  process.kill(record.pid, 0);
  process.kill(cloned.pid, 0);
  assert((c.hello.snapshot ?? c.hello).panes.some((p) => p.id === fork.paneId));
  console.log("PASS: failed Windows update rolls back without losing live agents");
  await c.request("server.stop", {});
  await until(() => server.exitCode !== null);
  console.log("PASS: native Windows stop cleans up supervisor");
} finally {
  for (const s of sockets) s.close();
  if (server.exitCode === null) server.kill();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
