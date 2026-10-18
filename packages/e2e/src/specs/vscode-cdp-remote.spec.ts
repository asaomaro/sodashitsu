import { checkCollapsibleViewerControls } from "../support/viewerControls.js";
import { openNativeTab, closeNativeTab } from "../support/nativeTab.js";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { test, expect } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";

// Real A/B reverse-delegated servers and a real Chromium source. No OS GUI startup or input.
test("machine header routes only the selected remote VSCode and stops it on close or revocation", async ({page,context,appServer,browser})=>{
  test.setTimeout(90000);
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
  await source.evaluate(()=>document.addEventListener("keydown",e=>{if(e.key==="Escape")document.body.dataset.escape="yes";}));
  const provider=await startAppServer();
  const bundle=join(provider.stateDir,"vscode-desktop.sodaplugin");
  for(const args of [
    ["plugin","pack",resolve("../../plugins/vscode-desktop"),"--out",bundle],
    ["plugin","install",bundle,"--state-dir",provider.stateDir],
    ["plugin","enable","vscode-desktop","--state-dir",provider.stateDir],
  ]){
    const result=spawnSync(process.execPath,[resolve("../cli/dist/main.js"),...args],{encoding:"utf8"});
    expect(result.status,result.stderr).toBe(0);
  }
  const saved=process.env["SODA_VSCODE_CDP_COMMAND"];
  process.env["SODA_VSCODE_CDP_COMMAND"]=JSON.stringify([process.execPath,resolve("../../plugins/vscode-desktop/cdp-launcher.mjs"),
    "--code","unused","--user-data-dir",join(provider.stateDir,"unused-profile"),"--soda",provider.origin,
    "--cdp",endpoint,"--allow-input","--allow-fit"]);
  try{await provider.restart();}finally{if(saved===undefined)delete process.env["SODA_VSCODE_CDP_COMMAND"];else process.env["SODA_VSCODE_CDP_COMMAND"]=saved;}
  const owner=await provider.openClient(),operator=await appServer.openClient();
  await owner.request("prefs.set",{patch:{displayScriptEnabled:true}});
  await operator.request("prefs.set",{patch:{displayScriptEnabled:true}});
  const app=await owner.request("tab.create",{workspaceId:owner.helloSnapshot()!.workspaces[0]!.id,
    label:"Remote VSCode app",plugin:{extensionKey:"user:vscode-desktop",display:"vscode-desktop"}});
  await owner.request("tab.focus",{tabId:app.tab.id});
  const frames:{url:string;message:any}[]=[];
  page.on("websocket",socket=>socket.on("framereceived",({payload})=>{
    try{const message=JSON.parse(String(payload));if(message.event==="vscode.cdp")frames.push({url:socket.url(),message:message.data});}catch{}
  }));
  let other: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try{
    const invite=await operator.request("machine.invite",{label:"Remote VSCode B"});
    await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header=page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});
    await owner.request("vscode.settings.set",{enabled:false,allowInput:false,allowFit:false});
    await openNativeTab(page,"vscode",header);
    const dialog=page.locator('[data-native-tab="vscode"]'),view=dialog.locator("[data-desktop-cdp]"),canvas=view.locator("canvas");
    const launch=view.getByRole("button",{name:"VSCodeを起動・接続",exact:true});
    await expect(dialog).toBeVisible();await expect(view).toContainText("接続先: Remote VSCode B");
    await expect(launch).toHaveCount(0);
    await owner.request("vscode.settings.set",{enabled:true,allowInput:false,allowFit:false});
    await expect(launch).toBeVisible();
    await launch.click();
    async function pixels(){
      await expect(view.getByRole("status")).toHaveText("閲覧中",{timeout:15000});
      await expect.poll(()=>canvas.evaluate(el=>{
        const c=el as HTMLCanvasElement,p=c.getContext("2d")!.getImageData(c.width-10,c.height-10,1,1).data;
        return p[3]===255&&Math.abs(p[2]!-144)<=3;
      })).toBe(true);
    }
    await pixels();
    expect(frames.some(f=>f.message.type==="frame"&&new URL(f.url).searchParams.get("machine")===invite.machineId)).toBe(true);
    expect(frames.some(f=>new URL(f.url).pathname!=="/ws")).toBe(false);
    await expect(view.getByRole("button",{name:"共有元を接続",exact:true})).toHaveCount(0);
    // Another authenticated browser receives no screen simply from opening the same controller.
    other=await browser.newContext();const observer=await other.newPage();const leaked:any[]=[];
    observer.on("websocket",s=>s.on("framereceived",({payload})=>{try{const m=JSON.parse(String(payload));if(m.event==="vscode.cdp"&&m.data?.type==="frame")leaked.push(m);}catch{}}));
    await observer.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(observer.locator(`[data-machine-id="${invite.machineId}"]`)).toBeVisible();
    await page.bringToFront();
    await view.getByRole("button",{name:"操作する",exact:true}).click();
    const box=(await canvas.boundingBox())!;await page.mouse.click(box.x+80,box.y+50);
    await view.getByRole("textbox",{name:"日本語・文字列入力"}).fill("日本語remote");
    await view.getByRole("button",{name:"文字を送る",exact:true}).click();
    await expect(source.getByRole("textbox",{name:"Existing editor"})).toHaveValue(/日本語remote/);
    await canvas.click({position:{x:80,y:50}});await page.keyboard.press("Escape");
    await expect(source.locator("body")).toHaveAttribute("data-escape","yes");
    await expect(dialog).toBeVisible();
    await view.getByRole("checkbox",{name:"表示領域に合わせる",exact:true}).check();
    await expect.poll(()=>source.evaluate(()=>({width:innerWidth,height:innerHeight}))).not.toEqual(originalSize);
    await view.getByRole("button",{name:"最大化",exact:true}).click();
    await expect(view).toHaveClass(/soda-viewport-maximized/);
    await expect.poll(()=>view.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})).toEqual(await page.evaluate(()=>({x:0,y:0,width:innerWidth,height:innerHeight})));
    expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
    await expect.poll(()=>view.locator("[data-desktop-screen]").evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})).toEqual(await page.evaluate(()=>({x:0,y:0,width:innerWidth,height:innerHeight})));
    // Wait for the resized source frame, not just the maximized host box.
    await expect.poll(()=>canvas.boundingBox()).toEqual(await view.locator("[data-desktop-screen]").boundingBox());
    await checkCollapsibleViewerControls(page, view, canvas, "日本語・文字列入力");
    await expect(view.getByRole("button",{name:"閲覧に戻る",exact:true})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(view).not.toHaveClass(/soda-viewport-maximized/);
    await expect(dialog).toBeVisible();
    await checkCollapsibleViewerControls(page, view, canvas, "日本語・文字列入力", false);
    await closeNativeTab(page);
    await expect(dialog).toHaveCount(0);
    await expect.poll(()=>source.evaluate(()=>({width:innerWidth,height:innerHeight}))).toEqual(originalSize);
    expect(leaked).toHaveLength(0);
    // The existing plugin app must follow the selected machine as well.
    await header.locator(".machine-select").click();
    await page.getByRole("tab",{name:"Remote VSCode app",exact:true}).click();
    const appView=page.locator("[data-plugin-view] [data-desktop-cdp]");
    await expect(appView).toContainText("接続先: Remote VSCode B");
    await expect(appView.getByRole("button",{name:"共有元を接続",exact:true})).toHaveCount(0);
    // Re-enter the direct app after using parent navigation controls.
    await appView.click({position:{x:4,y:4}});
    await expect(appView.getByRole("button",{name:"VSCodeを起動・接続",exact:true})).toBeEnabled();
    await appView.getByRole("button",{name:"VSCodeを起動・接続",exact:true}).click();
    await expect(appView.getByRole("status")).toHaveText("閲覧中",{timeout:15000});
    await expect.poll(()=>appView.locator("canvas").evaluate(el=>{
      const c=el as HTMLCanvasElement,p=c.getContext("2d")!.getImageData(c.width-10,c.height-10,1,1).data;
      return p[3]===255&&Math.abs(p[2]!-144)<=3;
    })).toBe(true);
    const local=page.locator('[data-machine-id="local"]');
    await local.locator(".machine-select").click(); // Unmount releases the remote plugin peer.
    await expect(appView).toHaveCount(0);
    // Local source is a separate connection; it must not inherit B pixels or permission.
    await openNativeTab(page,"vscode",local);
    await expect(dialog).toBeVisible();
    await expect(view).toContainText("接続先: ローカル");
    await expect(view.getByRole("button",{name:"共有元を接続",exact:true})).toBeVisible();
    expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).getContext("2d")!.getImageData(0,0,1,1).data[3])).toBe(0);
    await closeNativeTab(page);
    // Opening again creates a fresh read-only peer on B; no control/fit carries across.
    await openNativeTab(page,"vscode",header);await launch.click();await pixels();
    await expect(view.getByRole("checkbox",{name:"表示領域に合わせる",exact:true})).toHaveCount(0);
    await operator.request("machine.manage",{id:invite.machineId,action:"disable"});
    await expect(dialog).toHaveCount(0);
    await expect(header).toHaveCount(0);

  }finally{
    await other?.close();await provider.close();
    for(const socket of sockets)socket.terminate();wss.close();await new Promise<void>(r=>http.close(()=>r()));
    await session.detach();await source.close();
  }
});
