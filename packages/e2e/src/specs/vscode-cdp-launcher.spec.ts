import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { test, expect } from "../support/fixtures.js";
import { enableScript } from "../support/displayScript.js";

test("server launches the CDP helper without CLI/token entry and binds the selected window", async ({ page, context, appServer }) => {
  test.setTimeout(60000);
  await enableScript(appServer);
  const bundle = join(appServer.stateDir, "vscode-desktop.sodaplugin");
  for (const args of [
    ["plugin", "pack", resolve("../../plugins/vscode-desktop"), "--out", bundle],
    ["plugin", "install", bundle, "--state-dir", appServer.stateDir],
    ["plugin", "enable", "vscode-desktop", "--state-dir", appServer.stateDir],
  ]) {
    const result = spawnSync(process.execPath, [resolve("../cli/dist/main.js"), ...args], { encoding:"utf8" });
    expect(result.status, result.stderr).toBe(0);
  }
  let ids = ["resident-source"];
  const requestedTargets: string[] = [];
  const source = await context.newPage();
  await source.setViewportSize({ width: 800, height: 600 });
  await source.setContent('<body style="margin:0;background:rgb(22,88,144)"><input style="position:absolute;left:40px;top:40px" aria-label="Existing editor" value="existing"></body>');
  const session = await context.newCDPSession(source);
  // Metrics overrides belong to their CDP session. Establish and clear this
  // session's own override before measuring native size (Playwright has another).
  await session.send("Emulation.setDeviceMetricsOverride", {width:333,height:250,deviceScaleFactor:0,mobile:false});
  await expect.poll(()=>source.evaluate(()=>innerWidth)).toBe(333);
  await session.send("Emulation.clearDeviceMetricsOverride");
  await expect.poll(()=>source.evaluate(()=>innerWidth)).not.toBe(333);
  const originalSize = await source.evaluate(()=>({width:innerWidth,height:innerHeight}));
  const sockets = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const http = createServer((req, res) => {
    if (req.url !== "/json/list") { res.writeHead(404); res.end(); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(ids.map(id => ({ id, title: `Existing VSCode ${id}`, type: "page",
      url: "vscode-file://vscode-app/out/vs/code/electron-browser/workbench/workbench.html",
      webSocketDebuggerUrl: `ws://127.0.0.1:${(http.address() as {port:number}).port}/devtools/page/${id}` }))));
  });
  http.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => {
    requestedTargets.push(req.url ?? "");
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
  const saved = process.env["SODA_VSCODE_CDP_COMMAND"];
  process.env["SODA_VSCODE_CDP_COMMAND"] = JSON.stringify([process.execPath, resolve("../../plugins/vscode-desktop/cdp-launcher.mjs"),
    "--code", "unused-code-executable", "--user-data-dir", join(appServer.stateDir,"unused-vscode-profile"),
    "--soda", appServer.origin, "--cdp", endpoint, "--allow-input", "--allow-fit"]);
  try {
    await appServer.restart();
    const client = await appServer.openClient();
    const tab = await client.request("tab.create", { workspaceId: client.helloSnapshot()!.workspaces[0]!.id,
      label:"Auto VSCode", plugin:{extensionKey:"user:vscode-desktop",display:"vscode-desktop"} });
    await client.request("tab.focus", {tabId:tab.tab.id});
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const view=page.locator("[data-plugin-view] [data-desktop-cdp]");
    const launch=view.getByRole("button",{name:"VSCodeを起動・接続",exact:true});
    const stop=view.getByRole("button",{name:"共有を停止",exact:true});
    const status=view.getByRole("status");
    async function pixels() {
      await expect(status).toHaveText("閲覧中",{timeout:15000});
      await expect.poll(()=>view.locator("canvas").evaluate(el=>{
        const c=el as HTMLCanvasElement, p=c.getContext("2d")!.getImageData(c.width-10,c.height-10,1,1).data;
        return p[3]===255&&Math.abs(p[2]!-144)<=3;
      })).toBe(true);
    }
    await expect(launch).toBeVisible();
    await launch.click(); // Single candidate connects automatically, without displaying a pairing token.
    await pixels();
    await expect(view.getByRole("textbox",{name:"Windows側の接続コマンド"})).toHaveCount(0);
    await expect(view.getByRole("button",{name:"操作する",exact:true})).toBeEnabled();
    await view.getByRole("button",{name:"操作する",exact:true}).click();
    await view.getByRole("checkbox",{name:"表示領域に合わせる",exact:true}).check();
    await expect.poll(()=>source.evaluate(()=>innerWidth)).not.toBe(originalSize.width);
    await stop.click();
    await expect.poll(()=>source.evaluate(()=>({width:innerWidth,height:innerHeight}))).toEqual(originalSize);
    await expect(status).toHaveText("共有元が接続されていません");
    ids=["resident-source","second-source"];
    await launch.click();
    const select=view.getByRole("combobox",{name:"起動・接続するVSCode"});
    await expect(select).toBeVisible();
    await select.selectOption("second-source");
    ids=["resident-source"]; // Selected source disappears: never fall back to the remaining window.
    await view.getByRole("button",{name:"選択したVSCodeに接続",exact:true}).click();
    await expect(status).toContainText("Windows側の起動・接続に失敗しました");
    expect(requestedTargets).toEqual(["/devtools/page/resident-source"]);
    await launch.click();
    await pixels();
    await stop.click();
    await expect(status).toHaveText("共有元が接続されていません");
    await client.close();
  } finally {
    if(saved===undefined)delete process.env["SODA_VSCODE_CDP_COMMAND"];else process.env["SODA_VSCODE_CDP_COMMAND"]=saved;
    for(const ws of sockets)ws.terminate();
    wss.close();await new Promise<void>(r=>http.close(()=>r()));
    await session.detach();await source.close();
  }
});
