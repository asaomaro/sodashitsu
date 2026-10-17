/** Real Vite HMR through B-initiated delegation and the shipped helper. Loopback only. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeServerOnFreePort } from "../packages/server/dist/testkit.js";
import { createServer as createViteServer, version as viteVersion } from "../packages/web/node_modules/vite/dist/node/index.js";

const require = createRequire(new URL("../packages/e2e/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const WebSocket = require("ws");
const temporary = await mkdtemp(join(tmpdir(), "soda-preview-vite-"));
const servers = [], clients = [];
let browser, helper, vite;
const cli = fileURLToPath(new URL("../packages/cli/dist/main.js", import.meta.url));
const env = { ...process.env, HOME: temporary, SODACTL_TOKEN: "", SODA_PANE_ID: "", SODA_SERVER_URL: "", SODA_PANE_SOCKET: "", CODEX_HOME: join(temporary, "codex"), CLAUDE_CONFIG_DIR: join(temporary, "claude") };
delete env.SODACTL_URL;
const savedAgentRoots = ["CODEX_HOME", "CLAUDE_CONFIG_DIR"].map((name) => [name, process.env[name]]);
for (const [name] of savedAgentRoots) process.env[name] = env[name];

async function boot(name) {
  const stateDir = join(temporary, name);
  await mkdir(stateDir, { recursive: true });
  const shell = join(stateDir, "bash");
  await writeFile(shell, '#!/bin/sh\nexec /bin/bash --norc --noprofile "$@"\n'); await chmod(shell, 0o755);
  const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, shell });
  servers.push(server);
  const origin = `http://127.0.0.1:${server.options.port}`, token = server.freshToken;
  const login = await fetch(origin + "/api/login", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ token }) });
  assert.equal(login.status, 204);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const ws = new WebSocket(origin.replace("http:", "ws:") + "/ws", { headers: { cookie, origin } });
  clients.push(ws);
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let serial = 0;
  const pending = new Map();
  ws.on("message", (bytes, binary) => {
    if (binary) return;
    const message = JSON.parse(String(bytes)), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = String(++serial);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, 15_000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const hello = await request("client.hello", { protocol: 1, kind: "desktop" });
  return { origin, token, stateDir, request, paneId: hello.snapshot.panes[0].id };
}

function run(args, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (b) => stdout += String(b)); child.stderr.on("data", (b) => stderr += String(b));
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(`CLI exit ${code}: ${stderr}`)));
  });
}

try {
  const app = join(temporary, "vite-app"); await mkdir(app);
  await writeFile(join(app, "index.html"), '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><h1 id="marker"></h1><script type="module" src="/main.js"></script></body></html>');
  await writeFile(join(app, "style.css"), "#marker { color: rgb(1, 2, 3); }");
  const source = (value) => `document.querySelector('#marker').textContent=${JSON.stringify(value)}; if(import.meta.hot) import.meta.hot.accept();`;
  await writeFile(join(app, "main.js"), source("vite-initial"));
  // No base, HMR URL, allowedHosts, proxy, or app code adaptations to the gateway.
  vite = await createViteServer({ root: app, configFile: false, server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen(); const port = vite.httpServer.address().port;
  const a = await boot("a"), b = await boot("b");
  const invitation = await a.request("machine.invite", { label: "Vite Preview B" });
  await b.request("machine.delegate", { url: a.origin, machineId: invitation.machineId, token: invitation.token });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const wsFrames = [], errors = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("localhost")) return;
    ws.on("framereceived", ({ payload }) => {
      try { const message = JSON.parse(String(payload)); wsFrames.push({ type: message.type, updates: message.updates?.map(({ type, path }) => ({ type, path })) }); } catch { /* non-JSON is not a Vite protocol frame */ }
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(a.origin + "/#token=" + a.token);
  const header = page.locator(`[data-machine-id="${invitation.machineId}"]`);
  await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15_000 });
  await header.locator(".machine-select").click();
  await expect(page.locator(`.pane-frame[data-pane-id="${b.paneId}"]`)).toBeVisible();
  await page.locator("[data-web-preview-toggle]").click();
  await page.getByRole("button", { name: "このpaneでエージェントからの表示を許可" }).click();
  const command = page.locator("[data-preview-helper-command]"); await expect(command).toContainText("--viewer");
  const viewer = /--viewer ([0-9a-f-]{36})/.exec(await command.textContent())[1];
  let helperLog = "";
  helper = spawn(process.execPath, [cli, "--machine", invitation.machineId, "preview", "helper", "--viewer", viewer, "--url", a.origin, "--token", a.token], { env, stdio: ["ignore", "pipe", "pipe"] });
  helper.stdout.on("data", (b) => helperLog += String(b)); helper.stderr.on("data", (b) => helperLog += String(b));
  await expect.poll(() => helperLog).toContain("helper_ready");
  const caller = { SODA_PANE_ID: b.paneId, SODA_SERVER_URL: b.origin, SODA_PANE_SOCKET: join(b.stateDir, "pane.sock") };
  const registered = JSON.parse(await run(["preview", "register", "--name", "vite-hmr", "--port", String(port)], caller));
  const opening = run(["preview", "open", registered.id], caller);
  const frame = page.frameLocator("[data-preview-frame]");
  await expect(frame.locator("#marker")).toHaveText("vite-initial", { timeout: 20_000 });
  assert.equal(JSON.parse(await opening).status, "view_opened");
  await expect.poll(() => wsFrames.some((m) => m.type === "connected")).toBe(true);
  const stamp = randomUUID();
  await frame.locator("body").evaluate((el, value) => { el.dataset.documentStamp = value; }, stamp);
  await writeFile(join(app, "main.js"), source("vite-module-updated"));
  await expect(frame.locator("#marker")).toHaveText("vite-module-updated", { timeout: 15_000 });
  await expect(frame.locator("body")).toHaveAttribute("data-document-stamp", stamp);
  await writeFile(join(app, "style.css"), "#marker { color: rgb(4, 5, 6); }");
  await expect(frame.locator("#marker")).toHaveCSS("color", "rgb(4, 5, 6)", { timeout: 15_000 });
  await expect(frame.locator("body")).toHaveAttribute("data-document-stamp", stamp);
  assert.ok(wsFrames.some((m) => m.updates?.some((u) => u.type === "js-update")));
  assert.ok(wsFrames.some((m) => m.updates?.some((u) => u.type === "css-update")));
  await run(["preview", "stop", registered.id], caller);
  await expect(page.locator("[data-preview-frame]")).toHaveCount(0);
  const report = { status: "passed", platform: process.platform, node: process.version, browser: browser.version(), vite: viteVersion, route: "loopback Vite → B → B-initiated delegation to A → authenticated CLI helper → isolated localhost iframe", moduleHmr: true, cssHmr: true, documentPreserved: true, stopRevoked: true, browserReceivedViteFrames: wsFrames, pageErrors: errors, limitations: "Linux Chromium only. Both Sodashitsu hosts are separate server instances on one PC; no external network, real HTTPS parent, Next, other OS/browser, or production TLS tested." };
  if (process.env.SODA_PREVIEW_VITE_REPORT) await writeFile(process.env.SODA_PREVIEW_VITE_REPORT, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} finally {
  helper?.kill("SIGTERM");
  if (helper && helper.exitCode === null) await new Promise((resolve) => { helper.once("exit", resolve); setTimeout(() => { helper.kill("SIGKILL"); resolve(); }, 5000).unref(); });
  await browser?.close();
  clients.forEach((ws) => ws.terminate());
  await Promise.all(servers.reverse().map((server) => server.close()));
  await vite?.close();
  await rm(temporary, { recursive: true, force: true });
  for (const [name, value] of savedAgentRoots) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
