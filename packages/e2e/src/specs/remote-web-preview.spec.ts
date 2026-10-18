import { openNativeTab } from "../support/nativeTab.js";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

test("agent registers and opens a real HTTP/WS app through B's outbound-only delegation", async ({ page, appServer }) => {
  test.setTimeout(90_000);
  const provider = await startAppServer(), owner = await provider.openClient(), operator = await appServer.openClient();
  const home = await mkdtemp(join(tmpdir(), "soda-preview-e2e-"));
  const cli = fileURLToPath(new URL("../../../cli/dist/main.js", import.meta.url));
  let receivedCookie = "";
  const web = createServer((req, res) => {
    if (req.url === "/api") { receivedCookie = req.headers.cookie ?? ""; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true })); }
    else if (req.url === "/events") { res.writeHead(200, { "Content-Type": "text/event-stream" }); res.write("data: streaming-ok\n\n"); req.once("close", () => res.end()); }
    else if (req.url === "/module.js") { res.setHeader("Content-Type", "text/javascript"); res.end("export const value = 'module-ok'"); }
    else if (req.url === "/upload") { const chunks: Buffer[] = []; req.on("data", (b: Buffer) => chunks.push(b)); req.on("end", () => res.end(Buffer.concat(chunks))); }
    else if (req.url === "/redirect") { const address = web.address() as { port: number }; res.writeHead(302, { Location: `http://127.0.0.1:${address.port}/done` }).end(); }
    else if (req.url === "/done") { res.setHeader("Content-Type", "text/html"); res.end("<h1>Redirected app</h1>"); }
    else {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Set-Cookie", ["session=application; Path=/; SameSite=None; Secure", "__Host-soda-preview=forged; Path=/; Secure; HttpOnly"]);
      res.end(`<!doctype html><h1>Remote development app</h1><button id="check">Check API</button><p id="api"></p><p id="module"></p><p id="sse"></p><p id="ws"></p><p id="upload"></p><a href="/redirect">Redirect</a><script>
      import('/module.js').then(m=>document.querySelector('#module').textContent=m.value);
      document.querySelector('#check').onclick=async()=>{ const r=await fetch('/api',{method:'POST'}).then(r=>r.json());document.querySelector('#api').textContent=r.ok?'api-ok':'failed'; };
      const es=new EventSource('/events');es.onmessage=e=>{document.querySelector('#sse').textContent=e.data;es.close()};
      const ws=new WebSocket('ws://'+location.host+'/hmr',['first','selected']);ws.onmessage=e=>document.querySelector('#ws').textContent=ws.protocol+':'+e.data;
      fetch('/upload',{method:'POST',body:'upload-through-bridge'}).then(r=>r.text()).then(t=>document.querySelector('#upload').textContent=t);
      </script>`);
    }
  });
  const wss = new WebSocketServer({ server: web, handleProtocols: () => "selected" });
  wss.on("connection", (socket) => socket.send("hmr-ok"));
  await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
  const webPort = (web.address() as { port: number }).port;
  const env = { ...process.env, HOME: home, SODACTL_TOKEN: "", SODACTL_URL: "", SODA_PANE_ID: "", SODA_SERVER_URL: "", SODA_PANE_SOCKET: "" };
  delete (env as NodeJS.ProcessEnv).SODACTL_URL;
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}) => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = ""; child.stdout.on("data", (b) => output += String(b)); child.stderr.on("data", (b) => error += String(b));
    child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`sodactl exit ${code}: ${error}`)));
  });
  try {
    const paneId = owner.helloSnapshot()!.panes[0]!.id;
    const invitation = await operator.request("machine.invite", { label: "Preview PC B" });
    await owner.request("machine.delegate", { url: appServer.origin, machineId: invitation.machineId, token: invitation.token });
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invitation.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15_000 });
    await header.locator(".machine-select").click();
    await expect(page.locator(`.pane-frame[data-pane-id="${paneId}"]`)).toBeVisible();
    await openNativeTab(page, "web-preview");
    await expect(page.locator("[data-web-preview-toggle], [data-desktop-open], [data-vscode-open]")).toHaveCount(0);
    // No browser-PC CLI, token, login, or helper process is supplied by the test.
    await expect(page.getByText("ブラウザPCのhelperに接続済み", {exact:true})).toBeVisible({timeout:15000});
    await expect(page.locator("[data-preview-helper-command]")).toHaveCount(0);
    const callerEnv = { SODA_PANE_ID: paneId, SODA_SERVER_URL: provider.origin, SODA_PANE_SOCKET: join(provider.stateDir, "pane.sock"), ...(process.platform === "win32" ? { SODACTL_TOKEN: provider.token } : {}) };
    const registered = JSON.parse(await run(["preview", "register", "--name", "frontend", "--port", String(webPort)], callerEnv)) as { id: string };
    const opening = run(["preview", "open", registered.id], callerEnv);
    const frame = page.frameLocator("[data-preview-frame]");
    await expect(frame.getByRole("heading", { name: "Remote development app" })).toBeVisible({ timeout: 20_000 });
    expect(JSON.parse(await opening)).toMatchObject({ status: "view_opened" });
    await expect(frame.locator("#module")).toHaveText("module-ok");
    await expect(frame.locator("#sse")).toHaveText("streaming-ok");
    await expect(frame.locator("#ws")).toHaveText("selected:hmr-ok");
    await expect(frame.locator("#upload")).toHaveText("upload-through-bridge");
    await frame.locator("#check").click(); await expect(frame.locator("#api")).toHaveText("api-ok");
    expect(receivedCookie).toContain("session=application"); expect(receivedCookie).not.toContain("soda-preview"); expect(receivedCookie).not.toContain("soda_session");
    await frame.getByRole("link", { name: "Redirect" }).click(); await expect(frame.getByRole("heading", { name: "Redirected app" })).toBeVisible();
    // A normal tab switch must preserve the helper and the actual iframe document.
    await frame.locator("body").evaluate(el => el.setAttribute("data-kept", "yes"));
    await page.getByRole("tab").first().click();
    await expect(page.locator("[data-web-preview]")).toBeHidden();
    await page.getByRole("tab", { name: "Webプレビュー", exact: true }).click();
    await expect(frame.locator("body")).toHaveAttribute("data-kept", "yes");
    await expect(page.getByText("ブラウザPCのhelperに接続済み", { exact: true })).toBeVisible();
    // Workspace changes must retain the same live iframe document as well.
    const originalWorkspace = owner.helloSnapshot()!.workspaces[0]!.id;
    const otherWorkspace = await owner.request("workspace.create", { label: "Preview retention workspace" });
    await page.locator(`[data-drop-workspace-id="${otherWorkspace.workspace.id}"]`).first().click();
    await expect(page.locator("[data-web-preview]")).toBeHidden();
    await page.locator(`[data-drop-workspace-id="${originalWorkspace}"]`).first().click();
    await page.getByRole("tab", { name: "Webプレビュー", exact: true }).click();
    await expect(frame.locator("body")).toHaveAttribute("data-kept", "yes");
    await page.screenshot({ path: "/tmp/sodashitsu-remote-web-preview.png" });
    await run(["preview", "stop", registered.id], callerEnv);
    await expect(page.locator("[data-preview-frame]")).toHaveCount(0);
    // Port entry and registration/opening are available entirely through the UI.
    await page.getByRole("textbox", { name: "アプリ名", exact: true }).fill("from-ui");
    await page.getByRole("spinbutton", { name: "ポート", exact: true }).fill(String(webPort));
    await page.getByRole("button", { name: "登録して開く", exact: true }).click();
    await expect(page.frameLocator("[data-preview-frame]").getByRole("heading", { name: "Remote development app" })).toBeVisible();
    await page.locator(".viewer-item.active .viewer-close").click();
    await expect(page.locator("[data-web-preview]")).toHaveCount(0);
    await expect.poll(async () => (await owner.request("preview.viewers", {paneId})).viewers).toEqual([]);

  } finally {
    for (const socket of wss.clients) socket.terminate(); wss.close(); web.closeAllConnections(); await new Promise<void>((resolve) => web.close(() => resolve()));
    owner.close(); operator.close(); await provider.close(); await rm(home, { recursive: true, force: true });
  }
});
