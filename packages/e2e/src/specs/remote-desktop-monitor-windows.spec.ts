import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
// Synthetic mixed-DPI topology/capture/input only; no real monitor enumeration or input.
for (const mode of [
  "plain",
  "encrypted",
  "native",
  "topology",
  "independent",
  "independent-encrypted",
  "independent-native",
] as const)
  test(`monitor-specific browser popup ${mode}`, async ({
    page,
    context,
    appServer,
  }) => {
    test.setTimeout(90000);
    page.setDefaultTimeout(10000);page.on("pageerror",error=>console.log("Generated page error",error.message));
    const dir = await mkdtemp(join(tmpdir(), "soda-shared-monitors-")),
      ledger = join(dir, "lifecycle"),
      marker = join(dir, "topology"),
      input = join(dir, "input");
    const env = {
      SODA_DESKTOP_COMMAND: JSON.stringify([
        process.execPath,
        fileURLToPath(
          new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
        ),
        "--static",
        "--allow-input",
        "--monitors",
        "--cursor",
        "--lifecycle-ledger",
        ledger,
        "--topology-marker",
        marker,
        "--input-ledger",
        input,
        ...((mode === "native" || mode === "independent-native")
          ? [
              mode === "independent-native" ? "--monitors-wide" : "--monitors-cinema",
              "--native-60fps",
              "--native-fixture",
              fileURLToPath(
                new URL(
                  "../../../../scripts/remote-desktop/fixtures/h264-generated.json",
                  import.meta.url,
                ),
              ),
            ]
          : []),
      ]),
      SODA_DESKTOP_ALLOW_INPUT: "1",
      SODA_DESKTOP_ALLOW_MONITORS: "1",
      ...((mode === "native" || mode === "independent-native") ? { SODA_DESKTOP_ALLOW_MEDIA: "1" } : {}),
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const provider = await startAppServer().finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    let second: Awaited<ReturnType<typeof context.newPage>> | undefined;
    try {
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      const invite = await operator.request("machine.invite", {
        label: "Generated shared monitors B",
      });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity =
        (mode === "encrypted" || mode === "independent-encrypted") ? await owner.request("desktop.endpoint.initialize", {}) : undefined;
      if (identity) await owner.request("desktop.endpoint.required", { required: true });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const first = page.locator("[data-remote-desktop]"),
        c1 = first.getByLabel("共有画面");
      if (identity) {
        const pairing = first.locator("[data-desktop-endpoint]");
        await pairing.locator("summary").click();
        await pairing.getByRole("button", { name: "このブラウザの鍵を作成", exact: true }).click();
        const fp = pairing.locator("[data-browser-fingerprint]");
        await expect(fp).toHaveText(/^[a-f0-9]{64}$/);
        await owner.request("desktop.endpoint.trust", {
          fingerprint: (await fp.textContent())!,
          role: "viewer",
          label: "Generated monitor browser",
        });
        await pairing
          .getByLabel("接続先PCで確認した指紋", { exact: true })
          .fill(identity.fingerprint!);
        await pairing
          .getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました", {
            exact: true,
          })
          .check();
        await pairing
          .getByRole("button", { name: "この接続先を記憶して暗号化で接続", exact: true })
          .click();
      }
      await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await first.getByLabel("複数viewerで同じ画面を共有", { exact: true }).check();
      await expect(first.locator("[data-desktop-status]")).toHaveText("閲覧中");
      await expect(c1).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await first.getByLabel("モニター選択を共有（全ての窓で同じ選択が必要）",{exact:true}).check();
      await expect(first.getByLabel("表示モニター")).toHaveValue("right");
      await first.getByLabel("独立カーソルを共有（全ての窓で同じ選択が必要）",{exact:true}).check();
      await expect(first.locator("[data-desktop-status]")).toHaveText("閲覧中");
      await expect(c1).toHaveAttribute("data-rendered-frames",/^[1-9]/);
      if(mode==="independent"||mode==="independent-encrypted"||mode==="independent-native"){
        await first.getByLabel("モニターごとに独立して配信",{exact:true}).check();
        await expect(first.locator("[data-desktop-status]")).toHaveText("閲覧中");
        await expect(c1).toHaveAttribute("data-rendered-frames",/^[1-9]/);
        await first.getByLabel("この窓に表示するモニター",{exact:true}).selectOption("left");
        const before=(await readFile(ledger,"utf8")).trim().split("\n").map(s=>JSON.parse(s)).filter(v=>v.type==="spawn").length;
        const popup=context.waitForEvent("page");await first.getByRole("button",{name:"選択モニターを別窓で開く",exact:true}).click();second=await popup;await second.waitForLoadState();
        const view=second.locator("[data-remote-desktop]"),c2=view.getByLabel("共有画面");
        await expect(c2).toHaveAttribute("data-rendered-frames",/^[1-9]/);
        // Browser pixels prove that each viewer receives its selected source, without cropping.
        for(const [canvas,blue]of[[c1,false],[c2,true]]as const)await expect.poll(()=>canvas.evaluate((el,blue)=>{const c=el as HTMLCanvasElement,p=c.getContext("2d")!.getImageData(c.width/2,c.height/2,1,1).data;return blue?p[2]!>200&&p[0]!<30:p[0]!>200&&p[2]!<30;},blue)).toBe(true);
        expect((await readFile(ledger,"utf8")).trim().split("\n").map(s=>JSON.parse(s)).filter(v=>v.type==="spawn")).toHaveLength(before+1);
        await view.getByRole("button",{name:"情報・設定",exact:true}).click();
        await expect(view.getByLabel("表示モニター")).toHaveValue("left");await expect(view.getByLabel("表示モニター")).toBeDisabled();
        if(mode==="independent-native"){
          for(const v of[first,view]){await v.locator("[data-desktop-media] summary").click();await v.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect.poll(async()=>Number(await v.getByLabel("共有画面").getAttribute("data-video-frames"))).toBeGreaterThan(4);}
          for(const v of[first,view]){await v.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect(v.locator("[data-video-fps]")).toHaveCount(0);}
        }
        await view.locator("summary").filter({hasText:"画質・計測"}).click();
        await view.getByLabel("送信幅の上限",{exact:true}).fill("320");await view.getByLabel("JPEG品質",{exact:true}).fill("40");
        await view.getByRole("button",{name:"適用して再接続",exact:true}).click();
        await expect.poll(()=>c2.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(320);
        await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
        if(mode==="independent"){
          const sent:any[]=[];const cdp=await context.newCDPSession(second);await cdp.send("Network.enable");cdp.on("Network.webSocketFrameSent",event=>{try{const m=JSON.parse(event.response.payloadData);if(m.type==="input")sent.push(m.input);}catch{}});
          await view.getByRole("button",{name:"情報・設定",exact:true}).click();const b=(await c2.boundingBox())!;await second.mouse.click(b.x+b.width/2,b.y+b.height/2);await expect.poll(()=>sent.some(m=>m.kind==="pointer"&&m.event==="down")).toBe(true);const down=sent.find(m=>m.kind==="pointer"&&m.event==="down");expect(down.x).toBeCloseTo(0.5,2);expect(down.y).toBeCloseTo(0.5,2);
        }
        if(identity)await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
        await second.reload();const again=second.locator("[data-remote-desktop]");
        await expect(again.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect.poll(()=>again.getByLabel("共有画面").evaluate(el=>(el as HTMLCanvasElement).width)).toBe(320);
        await expect(again.locator("[data-desktop-status]")).toHaveText("閲覧中");await again.getByRole("button",{name:"情報・設定",exact:true}).click();await again.locator("summary").filter({hasText:"画質・計測"}).click();
        await expect(again.getByLabel("JPEG品質",{exact:true})).toHaveValue("40");
        await first.locator("summary").filter({hasText:"画質・計測"}).click();await expect(first.getByLabel("JPEG品質",{exact:true})).toHaveValue("65");
        const prior=Number(await again.getByLabel("共有画面").getAttribute("data-rendered-frames"));await first.getByRole("button",{name:"共有停止",exact:true}).click();await expect.poll(async()=>Number(await again.getByLabel("共有画面").getAttribute("data-rendered-frames"))).toBeGreaterThan(prior);
        return;
      }
      await first.getByLabel("表示モニター").selectOption("all");
      const local=first.getByLabel("この窓に表示するモニター",{exact:true});
      await local.selectOption("left");
      await expect(first.locator('[data-monitor-viewport="left"]')).toBeVisible();
      const before=(await readFile(ledger,"utf8")).trim().split("\n").map(s=>JSON.parse(s)).filter(v=>v.type==="spawn").length;
      const popupPromise=context.waitForEvent("page");
      await first.getByRole("button",{name:"選択モニターを別窓で開く",exact:true}).click();
      second=await popupPromise;await second.waitForLoadState();
      expect(await second.evaluate(()=>window.opener)).toBeNull();
      expect(new URL(second.url()).pathname).toBe("/desktop-view");
      const view=second.locator("[data-remote-desktop]"),c2=view.getByLabel("共有画面");
      await expect(c2).toHaveAttribute("data-rendered-frames",/^[1-9]/);
      await view.getByRole("button",{name:"情報・設定",exact:true}).click();
      await expect(view.getByLabel("この窓に表示するモニター",{exact:true})).toHaveValue("left");
      await local.selectOption("right");
      await expect(first.locator('[data-monitor-viewport="right"]')).toBeVisible();
      await expect(view.locator('[data-monitor-viewport="left"]')).toBeVisible();
      const left=view.locator("[data-monitor-viewport]"),right=first.locator("[data-monitor-viewport]");
      for(const [viewport,color]of[[left,"blue"],[right,"red"]]as const){
        await expect.poll(()=>viewport.evaluate((el,color)=>{
          const box=el.getBoundingClientRect(),canvas=el.querySelector("canvas")!,r=canvas.getBoundingClientRect();
          const x=(box.left+box.width/2-r.left)/r.width*canvas.width,y=(box.top+box.height/2-r.top)/r.height*canvas.height;
          const p=canvas.getContext("2d")!.getImageData(Math.floor(x),Math.floor(y),1,1).data;
          return getComputedStyle(el).overflow==="hidden"&&box.width>100&&box.height>100&&(color==="blue"?p[2]!>200&&p[0]!<30:p[0]!>200&&p[2]!<30);
        },color)).toBe(true);
      }
      // Both layers share an exact DOM offset; the initial fake cursor is on right only.
      for(const [viewport,visible]of[[left,false],[right,true]]as const){
        await expect(viewport.locator("[data-remote-cursor]")).toHaveAttribute("data-cursor-seq",/^[1-9]/);
        await expect.poll(()=>viewport.evaluate((el,visible)=>{
          const box=el.getBoundingClientRect(),base=el.querySelector('[aria-label="共有画面"]') as HTMLCanvasElement,over=el.querySelector("[data-remote-cursor]") as HTMLCanvasElement;
          const r=over.getBoundingClientRect(),b=base.getBoundingClientRect(),x=Number(over.dataset.cursorX),y=Number(over.dataset.cursorY),px=r.left+x*r.width,py=r.top+y*r.height;
          const pixel=over.getContext("2d")!.getImageData(Math.floor(x*over.width),Math.floor(y*over.height)-1,1,1).data;
          return Math.abs(r.left-b.left)<0.1&&Math.abs(r.top-b.top)<0.1&&Math.abs(r.width-b.width)<0.1&&pixel[3]===255&&((px>=box.left&&px<box.right&&py>=box.top&&py<box.bottom)===visible);
        },visible)).toBe(true);
      }
      expect((await readFile(ledger,"utf8")).trim().split("\n").map(s=>JSON.parse(s)).filter(v=>v.type==="spawn")).toHaveLength(before);
      if(mode==="encrypted")await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
      if(mode==="native"){
        for(const v of[first,view]){
          await expect.poll(()=>v.getByLabel("共有画面").evaluate(el=>(el as HTMLCanvasElement).width)).toBe(1280);
          await v.locator("[data-desktop-media] summary").click();
          await v.getByRole("button",{name:"動画共有を依頼",exact:true}).click();
          await expect.poll(async()=>Number(await v.getByLabel("共有画面").getAttribute("data-video-frames"))).toBeGreaterThan(4);
          await expect.poll(()=>v.getByLabel("共有画面").evaluate(el=>(el as HTMLCanvasElement).width)).toBe(640);
          const dims=await v.locator("[data-monitor-viewport]").evaluate(el=>{const b=el.getBoundingClientRect(),c=el.querySelector("canvas")!.getBoundingClientRect();return[b.width/c.width,b.height/c.height];});
          expect(dims[0]).toBeCloseTo(v===view?640/1440:800/1440,2);
          expect(dims[1]).toBeCloseTo(v===view?480/810:610/810,2);
        }
      }
      if(mode==="topology"){
        await writeFile(marker,"generated");
        for(const v of[first,view])await expect(v.getByRole("alert")).toContainText("モニター構成が変更");
        return;
      }
      // Observe browser-sent coordinates, with the real helper only accepting fake input.
      const sent:Record<string,any>[]=[];
      const cdp=await context.newCDPSession(second);await cdp.send("Network.enable");
      cdp.on("Network.webSocketFrameSent",event=>{try{const m=JSON.parse(event.response.payloadData);if(m.type==="input")sent.push(m.input);}catch{}});
      await second.bringToFront();
      await view.getByRole("button",{name:"操作する",exact:true}).click();
      await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
      // Close the overlay so it cannot cover the visible monitor.
      await view.getByRole("button",{name:"情報・設定",exact:true}).click();
      const box=(await left.boundingBox())!;
      if(mode!=="encrypted"){
        await second.mouse.move(box.x+box.width/2,box.y+box.height/2);await second.mouse.down();
        await second.mouse.move(box.x+box.width+25,box.y+box.height/2);await second.mouse.up();
        await expect.poll(()=>sent.filter(v=>v.kind==="pointer"&&v.event==="down").length).toBeGreaterThan(0);
        const down=sent.find(v=>v.kind==="pointer"&&v.event==="down")!;
        expect(down.x).toBeCloseTo(320/1439,2);expect(down.y).toBeCloseTo(240/(mode==="native"?809:799),2);
        expect(sent.filter(v=>v.kind==="pointer").every(v=>v.x<=639/1439+0.00001)).toBe(true);
      }
      // Reload uses the same nonsecret launch preferences, never retained input permission.
      await second.reload();
      const reloaded=second.locator("[data-remote-desktop]");
      await expect(reloaded.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);
      await expect(reloaded.locator('[data-monitor-viewport="left"]')).toBeVisible();
      await expect(reloaded.locator("[data-desktop-status]")).toHaveText("閲覧中");
      const prior=Number(await reloaded.getByLabel("共有画面").getAttribute("data-rendered-frames"));
      await first.getByRole("button",{name:"共有停止",exact:true}).click();
      await expect.poll(async()=>Number(await reloaded.getByLabel("共有画面").getAttribute("data-rendered-frames"))).toBeGreaterThan(prior);
    }catch(error){console.log("Generated popup DOM",mode,await page.locator("[data-remote-desktop]").allTextContents().catch(()=>[]),second?await second.locator("body").allTextContents().catch(()=>[]):[]);throw error;}
    finally{
      await second?.close().catch(()=>{});await page.goto("about:blank").catch(()=>{});await provider.close();await rm(dir,{recursive:true,force:true});
    }
  });

test("invalid monitor launch URL never opens a desktop socket",async({page,appServer})=>{
 await page.goto(`${appServer.origin}/#token=${appServer.token}`);
 await expect(page.getByRole("button",{name:"接続ビューを追加・選択",exact:true})).toBeVisible();
 const sockets:string[]=[];page.on("websocket",socket=>sockets.push(socket.url()));
 await page.goto(`${appServer.origin}/desktop-view#%`);
 await expect(page.getByRole("status")).toContainText("URLが無効");
 await expect(page.locator("[data-remote-desktop]")).toHaveCount(0);
 expect(sockets.filter(v=>v.includes("/desktop-share")||v.includes("/desktop-e2e")||v.includes("/desktop-endpoint"))).toHaveLength(0);
});
