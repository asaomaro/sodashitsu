/** Browser-entry PoC only. Every listener is bound to loopback; no real user state is used. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoopbackGateway } from "../packages/cli/dist/preview/LoopbackGateway.js";

const require = createRequire(new URL("../packages/e2e/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const temporary = await mkdtemp(join(tmpdir(), "soda-preview-entry-"));
const servers = [];
const sockets = new Set();
const helpers = [];
let browser;

async function listen(server, host = "127.0.0.1") {
  servers.push(server);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server.address().port;
}

try {
  // A disposable self-signed certificate is used only for the fake HTTPS parent.
  // ignoreHTTPSErrors below affects this test context; it is not a product TLS policy.
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-keyout", join(temporary, "key.pem"), "-out", join(temporary, "cert.pem")], { stdio: "ignore" });
  const key = await readFile(join(temporary, "key.pem"));
  const cert = await readFile(join(temporary, "cert.pem"));
  const hosts = [`p${randomUUID().replaceAll("-", "")}.localhost`, `p${randomUUID().replaceAll("-", "")}.localhost`];
  const gateway = createServer(async (req, res) => {
    const host = req.headers.host?.split(":")[0];
    const app = hosts.indexOf(host);
    if (app < 0) { res.writeHead(403).end(); return; }
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    res.setHeader("Cache-Control", "no-store");
    if (path === "/api") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ app, cookie: req.headers.cookie ?? "" }));
    } else if (path === "/module.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end("export const value = 'dynamic-import-ok';");
    } else if (path === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      res.end("#marker { color: rgb(1, 2, 3); }");
    } else if (path === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: first\n\n");
      // This endpoint intentionally remains open; event receipt, not response end, is observed.
      req.once("close", () => res.end());
    } else if (path === "/sw.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end("self.addEventListener('install',()=>self.skipWaiting()); self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");
    } else if (path === "/upload") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      res.end(Buffer.concat(chunks));
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(`<!doctype html><link rel="stylesheet" href="/style.css"><h1 id="marker">app-${app}</h1><script>
        document.cookie='session=app-${app}; Path=/; SameSite=None; Secure';
        localStorage.setItem('session','app-${app}');
        window.ready = (async()=>{
          const module = await import('/module.js');
          const api = await fetch('/api').then(r=>r.json());
          const upload = await fetch('/upload',{method:'POST',body:'upload-${app}'}).then(r=>r.text());
          const event = await new Promise((resolve,reject)=>{const es=new EventSource('/events');es.onmessage=e=>{es.close();resolve(e.data)};es.onerror=reject});
          const ws = await new Promise((resolve,reject)=>{const s=new WebSocket('ws://'+location.host+'/hmr');s.onmessage=e=>{s.close();resolve(e.data)};s.onerror=reject});
          return {module:module.value,api,upload,event,ws,secure:isSecureContext,storage:localStorage.getItem('session')};
        })();
      </script>`);
    }
  });
  const port = await listen(gateway);
  let offers = [];
  const parentHtml = () => `<!doctype html><h1>Parent</h1>${offers.map((offer, i) => `<iframe id="app${i}" sandbox="allow-scripts allow-same-origin allow-forms" src="${offer.url}"></iframe>`).join("")}`;
  const parentCsp = () => `default-src 'none'; script-src 'unsafe-inline'; frame-src ${offers.map((o) => o.origin).join(" ")}`;
  const parentPort = await listen(createHttpsServer({ key, cert }, (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Security-Policy", parentCsp());
    res.end(parentHtml());
  }));
  const simulatedPublic = process.argv.includes("--simulated-public-parent");
  const parentOrigin = simulatedPublic ? "https://soda-preview.invalid" : `https://localhost:${parentPort}`;
  for (let i = 0; i < 2; i++) {
    const helper = await LoopbackGateway.listen({
      http: async (incoming, sink) => new Promise((resolve, reject) => {
        const outgoing = httpRequest({ hostname: "127.0.0.1", port, method: incoming.method, path: incoming.path, headers: { ...incoming.headers, host: hosts[i] } });
        const abort = () => outgoing.destroy(new Error("cancelled"));
        incoming.signal.addEventListener("abort", abort, { once: true });
        outgoing.on("error", reject);
        outgoing.on("response", (response) => {
          void (async () => {
            const headers = Object.fromEntries(Object.entries(response.headers).filter(([, v]) => v !== undefined));
            sink.head(response.statusCode, headers);
            for await (const chunk of response) await sink.write(chunk);
            sink.end(); resolve();
          })().catch(reject).finally(() => incoming.signal.removeEventListener("abort", abort));
        });
        void (async () => {
          for await (const chunk of incoming.body) await new Promise((done, fail) => outgoing.write(chunk, (error) => error ? fail(error) : done()));
          outgoing.end();
        })().catch((error) => { outgoing.destroy(); reject(error); });
      }),
      websocket: async (request, socket) => {
        assert.ok(!String(request.headers.cookie).includes("__Host-soda-preview"));
        socket.send("hmr-ok");
      },
    }, parentOrigin);
    helpers.push(helper);
  }
  offers = helpers.map((helper) => helper.bootstrap());
  const origins = offers.map((offer) => offer.origin);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  if (process.argv.includes("--grant-local-network")) await context.grantPermissions(["local-network-access"], { origin: parentOrigin });
  if (simulatedPublic) await context.route(parentOrigin + "/", (route) => route.fulfill({ status: 200, contentType: "text/html", headers: { "Content-Security-Policy": parentCsp() }, body: parentHtml() }));
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on("requestfailed", (request) => { const u = new URL(request.url()); failedRequests.push({ url: u.origin + u.pathname, error: request.failure()?.errorText }); });
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(parentOrigin);
  const frames = [];
  const results = [];
  for (let i = 0; i < 2; i++) {
    const locator = page.frameLocator(`#app${i}`).locator("#marker");
    try { await locator.waitFor({ timeout: 10_000 }); }
    catch (error) {
      process.stderr.write(JSON.stringify({ failedRequests, consoleErrors: errors.map((e) => e.replace(/#[A-Za-z0-9_-]+/g, "#[redacted]")), frames: page.frames().map((f) => { try { const u = new URL(f.url()); return u.origin + u.pathname; } catch { return "unknown"; } }) }, null, 2) + "\n");
      throw error;
    }
    assert.equal(await locator.textContent(), `app-${i}`);
    const frame = page.frames().find((f) => f.url().startsWith(origins[i] + "/"));
    frames.push(frame);
    const result = await frame.evaluate(() => window.ready);
    assert.equal(result.module, "dynamic-import-ok");
    assert.equal(result.api.app, i);
    assert.equal(result.upload, `upload-${i}`);
    assert.equal(result.event, "first");
    assert.equal(result.ws, "hmr-ok");
    assert.equal(result.secure, true);
    assert.equal(result.storage, `app-${i}`);
    assert.ok(!result.api.cookie.includes("__Host-soda-preview"));
    assert.equal(await locator.evaluate((el) => getComputedStyle(el).color), "rgb(1, 2, 3)");
    results.push(result);
  }
  // Observe an actual script's cookie injection attempt from app 0, then inspect app 1.
  await frames[0].evaluate(() => { document.cookie = "session=injected; Domain=localhost; Path=/; SameSite=None; Secure"; });
  const sibling = await frames[1].evaluate(async () => ({
    cookies: document.cookie,
    storage: localStorage.getItem("session"),
    api: await fetch("/api").then((r) => r.json()),
  }));
  assert.equal(sibling.storage, "app-1");
  assert.ok(!sibling.cookies.includes("injected"));
  assert.ok(!sibling.api.cookie.includes("injected"));
  assert.ok(!sibling.api.cookie.includes("app-0"));
  // Browser JS cannot replace the HttpOnly auth cookie or create a valid __Host
  // cookie with a different path/parent domain. A subsequent authenticated call must still work.
  await frames[0].evaluate(() => {
    document.cookie = "__Host-soda-preview=forged; Path=/; Secure; SameSite=None";
    document.cookie = "__Host-soda-preview=forged; Path=/api; Secure; SameSite=None";
    document.cookie = "__Host-soda-preview=forged; Domain=localhost; Path=/; Secure; SameSite=None";
  });
  assert.equal(await frames[0].evaluate(async () => (await fetch("/api")).status), 200);
  const crossAppRequest = await frames[0].evaluate(async (other) => {
    try { const r = await fetch(other + "/api", { credentials: "include" }); return { status: r.status }; }
    catch { return { blocked: true }; }
  }, origins[1]);
  assert.equal(crossAppRequest.blocked, true);
  // Probe SW support without claiming it has been implemented in the transfer layer.
  const sw = await frames[0].evaluate(async () => {
    try { const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; return { supported: true, scope: reg.scope }; }
    catch (error) { return { supported: false, error: String(error) }; }
  });
  const cookies = (await context.cookies()).map(({ value, ...cookie }) => ({ ...cookie, value: cookie.httpOnly ? "[redacted]" : value }));
  assert.equal(cookies.filter((c) => c.name === "__Host-soda-preview" && c.httpOnly && c.secure).length, 2);
  const report = {
    browser: browser.version(), platform: process.platform, origins, parent: simulatedPublic ? "Playwright-intercepted HTTPS public-shaped origin (not a real public network connection)" : "disposable self-signed HTTPS localhost",
    embeddedApps: results, siblingAfterInjection: sibling, crossAppRequest, cookies, serviceWorkerProbe: sw, consoleErrors: errors,
    note: "Real LoopbackGateway authentication and HTTP sanitization, fixture apps, no real Sodashitsu/remote transport. WebSocket transport is a fixture. No TLS/network security bypass except the disposable parent certificate. Only Linux Chromium is measured.",
  };
  const reportPath = process.env.SODA_PREVIEW_POC_REPORT;
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  await context.close();
} finally {
  await browser?.close();
  await Promise.all(helpers.map((helper) => helper.close()));
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  await rm(temporary, { recursive: true, force: true });
}
