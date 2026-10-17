#!/usr/bin/env node
// Isolated, loopback-only manual test server. Does not start or configure VSCode.
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { composeServer } from "../packages/server/dist/composeServer.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/server/package.json"));
const WebSocket = require("ws");
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!["--port", "--state-root"].includes(process.argv[i]) || !process.argv[i + 1])
    throw new Error("Usage: node scripts/vscode-cdp-dev.mjs [--port 17883] [--state-root EXISTING_TEST_STATE]");
  args.set(process.argv[i], process.argv[i + 1]);
}
const port = Number(args.get("--port") ?? 17883);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be an integer between 1024 and 65535");
const stateRoot = args.has("--state-root") ? resolve(args.get("--state-root")) : await mkdtemp(join(tmpdir(), "soda-cdp-live-"));
const stateDir = join(stateRoot, "sessions/cdp-test");
const previous = args.has("--state-root") ? JSON.parse(await readFile(join(stateRoot, "connection.json"), "utf8")) : undefined;
if (previous && (previous.stateRoot !== stateRoot || previous.stateDir !== stateDir || previous.origin !== `http://127.0.0.1:${port}`))
  throw new Error("Existing test state does not match this launcher or port");
await mkdir(stateDir, { recursive: true });
if (!previous) {
  const bundle = join(stateRoot, "vscode-desktop.sodaplugin");
  for (const arguments_ of [
    ["plugin", "pack", join(root, "plugins/vscode-desktop"), "--out", bundle],
    ["plugin", "install", bundle, "--state-dir", stateDir],
    ["plugin", "enable", "vscode-desktop", "--state-dir", stateDir],
  ]) {
    const result = spawnSync(process.execPath, [join(root, "packages/cli/dist/main.js"), ...arguments_], {
      encoding: "utf8", timeout: 15000,
    });
    if (result.status !== 0) throw new Error(result.stderr || "Plugin setup failed");
  }
}
const shell = join(stateRoot, "bash");
await writeFile(shell, '#!/bin/sh\nexec /bin/bash --norc --noprofile "$@"\n', { mode: 0o700 });
process.chdir(stateRoot);
const server = await composeServer({
  host: "127.0.0.1", port: String(port), stateDir: stateRoot, session: "cdp-test", shell, origin: [],
});
let socket;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  socket?.terminate();
  await server.close();
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => void close().then(() => process.exit(0), () => process.exit(1)));
}
try {
  await server.listen();
  const origin = `http://127.0.0.1:${port}`;
  const token = server.freshToken ?? previous?.token;
  if (!token) throw new Error("Missing temporary login token");
  const response = await fetch(origin + "/api/login", {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ token }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (response.status !== 204 || !cookie) throw new Error("Temporary login failed");
  socket = new WebSocket(origin.replace("http", "ws") + "/ws", { headers: { Cookie: cookie, Origin: origin } });
  const pending = new Map();
  let serial = 0;
  socket.on("message", raw => {
    const message = JSON.parse(raw.toString());
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = String(++serial);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  await once(socket, "open");
  const hello = await request("client.hello", { protocol: 1, kind: "desktop" });
  await request("prefs.set", { patch: { displayScriptEnabled: true } });
  const existingTab = hello.snapshot.tabs.find(tab => tab.id === previous?.tabId);
  const tab = existingTab ?? (await request("tab.create", {
    workspaceId: hello.snapshot.workspaces[0].id,
    label: "VSCode Desktop 実機確認",
    plugin: { extensionKey: "user:vscode-desktop", display: "vscode-desktop" },
  })).tab;
  await request("tab.focus", { tabId: tab.id });
  socket.close();
  const infoPath = join(stateRoot, "connection.json");
  await writeFile(infoPath, JSON.stringify({ origin, token, stateRoot, stateDir, pid: process.pid, tabId: tab.id }, null, 2), { mode: 0o600 });
  await writeFile(join(stateRoot, "login-url.txt"), `${origin}/#token=${token}\n`, { mode: 0o600 });
  console.log(`CDP_LIVE_READY ${origin}\nConnection info (private): ${infoPath}\nStop: Ctrl+C`);
} catch (error) {
  await close();
  throw error;
}
