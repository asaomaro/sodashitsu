import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { test, expect } from "../support/fixtures.js";
import { enableScript } from "../support/displayScript.js";

// Only discovery is a test facade. Every capture/input operation runs against
// a real Chromium renderer over its existing pipe; no desktop port is opened.
test("registered Windows bridge stays resident across stop, reload and server restart", async ({ page, context, appServer }) => {
  test.setTimeout(90000);
  await enableScript(appServer);
  const bundle = join(appServer.stateDir, "vscode-desktop.sodaplugin");
  for (const args of [
    ["plugin", "pack", resolve("../../plugins/vscode-desktop"), "--out", bundle],
    ["plugin", "install", bundle, "--state-dir", appServer.stateDir],
    ["plugin", "enable", "vscode-desktop", "--state-dir", appServer.stateDir],
  ]) {
    const result = spawnSync(process.execPath, [resolve("../cli/dist/main.js"), ...args], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }
  await appServer.restart();
  const client = await appServer.openClient();
  const tab = await client.request("tab.create", {
    workspaceId: client.helloSnapshot()!.workspaces[0]!.id, label: "Resident desktop",
    plugin: { extensionKey: "user:vscode-desktop", display: "vscode-desktop" },
  });
  await client.request("tab.focus", { tabId: tab.tab.id });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const view = page.locator("[data-plugin-view] [data-desktop-cdp]");
  await expect(view).toBeVisible();
  await view.getByRole("button", { name: "共有元を接続", exact: true }).click();
  const command = await view.getByRole("textbox", { name: "Windows側の接続コマンド" }).inputValue();
  expect(command.includes("--remember")).toBe(true);
  const token = /--token ([a-f0-9]{64})/.exec(command)![1]!;
  const source = await context.newPage();
  await source.setViewportSize({ width: 800, height: 600 });
  await source.setContent('<body style="margin:0;background:rgb(22,88,144)"><input style="position:absolute;left:40px;top:40px" aria-label="Existing editor" value="existing"></body>');
  const session = await context.newCDPSession(source);
  const sockets = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const http = createServer((req, res) => {
    if (req.url !== "/json/list") { res.writeHead(404); res.end(); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: "resident-source", title: "Existing VSCode", type: "page",
      url: "vscode-file://vscode-app/out/vs/code/electron-browser/workbench/workbench.html",
      webSocketDebuggerUrl: `ws://127.0.0.1:${(http.address() as {port:number}).port}/devtools/page/resident-source` }]));
  });
  http.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => {
    sockets.add(ws);
    ws.on("error", () => {});
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", raw => {
      const m = JSON.parse(raw.toString());
      void session.send(m.method, m.params).then(result => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: m.id, result }));
      }, () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: m.id, error: {code:-32000} })); });
    });
  }));
  for (const method of ["Page.screencastFrame", "Page.frameNavigated", "Inspector.detached"])
    session.on(method as never, params => {
      for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method, params }));
    });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(http.address() as {port:number}).port}`;
  const profile = join(appServer.stateDir, "bridge-profile.json");
  const children = new Set<ChildProcess>();
  const exits = new Map<ChildProcess, Promise<unknown>>();
  let bridgeLog = "";
  function launch(args: string[]) {
    const child = spawn(process.execPath, [resolve("../../plugins/vscode-desktop/cdp-bridge.mjs"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    children.add(child); exits.set(child, once(child, "exit"));
    // Drain without logging command arguments, pairing tokens or credentials.
    const collect = (data: Buffer) => { bridgeLog = (bridgeLog + data.toString().replace(/[a-f0-9]{64}/g, "[redacted]")).slice(-8000); };
    child.stdout?.on("data", collect); child.stderr?.on("data", collect);
    return child;
  }
  async function stopChild(child: ChildProcess) {
    if (child.exitCode === null) child.kill("SIGTERM");
    const forced = setTimeout(() => child.kill("SIGKILL"), 3000);
    try { await exits.get(child); } finally { clearTimeout(forced); children.delete(child); }
  }
  const canvas = view.locator("canvas");
  const connect = view.getByRole("button", { name: "接続", exact: true });
  async function visiblePixels() {
    await expect(view.getByRole("status"), bridgeLog).toHaveText("閲覧中");
    await expect.poll(() => canvas.evaluate(el => {
      const c = el as HTMLCanvasElement;
      const pixel = c.getContext("2d")!.getImageData(c.width - 10, c.height - 10, 1, 1).data;
      return pixel[3] === 255 && Math.abs(pixel[2]! - 144) <= 3;
    })).toBe(true);
  }
  async function attach() {
    await expect(connect).toBeEnabled({ timeout: 15000 });
    await connect.click();
    await visiblePixels();
  }
  try {
    let child = launch(["--cdp", endpoint, "--target", "resident-source", "--soda", appServer.origin,
      "--token", token, "--remember", "--profile", profile, "--allow-input", "--allow-fit"]);
    await page.bringToFront();
    await visiblePixels();
    await expect(view.getByRole("combobox", { name: "登録済みの共有元" })).toContainText("Existing VSCode");
    await expect.poll(async () => {
      try { return typeof JSON.parse(await readFile(profile, "utf8")).secret === "string"; } catch { return false; }
    }).toBe(true);
    await view.getByRole("button", { name: "共有を停止", exact: true }).click();
    await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
    await attach(); // Same running CLI, no token/command entry.
    expect(child.exitCode).toBeNull();
    await page.reload();
    await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
    await attach();
    await expect(view.getByRole("button", { name: "操作する", exact: true })).toBeEnabled();
    await view.getByRole("button", { name: "操作する", exact: true }).click();
    await view.getByRole("checkbox", { name: "表示領域に合わせる", exact: true }).check();
    await expect.poll(() => source.evaluate(() => innerWidth)).not.toBe(800);
    await appServer.restart();
    await page.reload();
    await expect(view.getByRole("status")).toHaveText("共有元が接続されていません", {timeout:15000});
    await attach(); // Registry survived server restart, resident resumed idle.
    await stopChild(child);
    expect(child.signalCode).not.toBe("SIGKILL"); // Normal stop must complete without the cleanup fallback.
    await expect(view.getByRole("combobox", { name: "登録済みの共有元" })).toContainText("オフライン");
    child = launch(["--profile", profile]); // No --token, --soda or target flags.
    await attach();
    await page.screenshot({ path: "/tmp/vscode-cdp-resident.png" });
    // Hold completion of a real fullscreen request until sharing has stopped.
    // A late success must not leave a disconnected viewer fullscreen.
    await view.evaluate(el => {
      const enter = el.requestFullscreen.bind(el);
      Object.defineProperty(el, "requestFullscreen", { configurable:true, value:() => new Promise<void>(resolve => {
        Reflect.set(el, "finishFullscreenTest", async () => { await enter(); resolve(); });
      }) });
    });
    await view.getByRole("button", { name:"全画面", exact:true }).click();
    await view.getByRole("button", { name:"共有を停止", exact:true }).click();
    await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
    await view.evaluate(async el => { await Reflect.get(el, "finishFullscreenTest")(); });
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await view.evaluate(el => {
      Reflect.deleteProperty(el, "requestFullscreen"); Reflect.deleteProperty(el, "finishFullscreenTest");
    });
    await attach();
    await view.getByRole("button", { name: "登録を解除", exact: true }).click();
    await expect(view.getByRole("combobox", { name: "登録済みの共有元" })).toHaveCount(0);
    await expect(view.getByRole("status")).toHaveText("共有元が接続されていません");
    await expect.poll(() => child.exitCode).not.toBeNull();
    await expect(view.getByRole("button", { name: "共有元を接続", exact: true })).toBeEnabled();
    await expect(source.getByRole("textbox", { name: "Existing editor" })).toHaveValue("existing");
  } finally {
    for (const child of children) await stopChild(child);
    for (const ws of sockets) ws.terminate();
    wss.close(); await new Promise<void>(resolve => http.close(() => resolve()));
    await session.detach().catch(() => {}); await source.close(); client.close();
  }
});
