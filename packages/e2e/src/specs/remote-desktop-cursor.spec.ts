import {fileURLToPath} from "node:url";
import {isDesktopCursor,decodeDesktopCursor,type DesktopCursorInfo} from "@sodashitsu/protocol";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

test("cursor shape/alpha/XOR and local motion are separate from screenshot pixels, then clear on hide/reconnect",async({page,appServer})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--cursor","--cursor-no-echo","--input-ack-pipe"]),SODA_DESKTOP_ALLOW_INPUT:"1"};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const poses:DesktopCursorInfo[]=[];
 page.on("websocket",ws=>{if(ws.url().endsWith("/desktop-share"))ws.on("framereceived",({payload})=>{if(typeof payload!=="string"&&isDesktopCursor(payload))poses.push(decodeDesktopCursor(payload).info);});});
 try {
  const owner=await provider.openClient(),a=await appServer.openClient();
  const invite=await a.request("machine.invite",{label:"Generated cursor B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),base=view.getByLabel("共有画面"),overlay=view.locator("[data-remote-cursor]");
  await expect(base).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect(overlay).toHaveAttribute("data-cursor-seq",/^[1-9]/);
  // Evidence is the actual two browser canvases; no test-side WS substitutes rendering.
  const samples=await view.evaluate(el=>{
   const base=el.querySelector('[aria-label="共有画面"]') as HTMLCanvasElement,over=el.querySelector('[data-remote-cursor]') as HTMLCanvasElement;
   const x=Math.floor(base.width*.5)-1,y=Math.floor(base.height*.5)-1,ctx=base.getContext("2d")!,cursor=over.getContext("2d")!;
   return {bg:Array.from(ctx.getImageData(x,y,1,1).data),xor:Array.from(cursor.getImageData(x,y,1,1).data),green:Array.from(cursor.getImageData(x+1,y,1,1).data),underGreen:Array.from(ctx.getImageData(x+1,y,1,1).data)};
  });
  expect(samples.green).toEqual([0,255,0,255]);expect(samples.xor).toEqual([...samples.bg.slice(0,3).map(v=>v^255),255]);
  await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");await base.focus();
  const box=(await base.boundingBox())!;await page.mouse.move(box.x+box.width*.75,box.y+box.height*.75);
  await expect.poll(async()=>Number(await overlay.getAttribute("data-cursor-x"))).toBeGreaterThan(.7);
  // Source intentionally refuses movement, like a clipped cursor; local prediction
  // must move first and then yield to its real position after the bounded interval.
  expect(poses.filter(p=>p.visible).every(p=>p.x===.5&&p.y===.5)).toBe(true);
  await expect.poll(async()=>Number(await overlay.getAttribute("data-cursor-x"))).toBe(.5);
  await page.mouse.move(box.x+.1,box.y+.1);
  expect(await overlay.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(0,0,1,1).data))).toEqual([255,255,255,255]);
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.75);
  await page.mouse.down();await expect.poll(()=>poses.some(p=>p.shape?.kind===2)).toBe(true);
  await expect.poll(()=>overlay.evaluate(el=>{const c=el as HTMLCanvasElement,x=Math.floor(Number(c.dataset.cursorX)*c.width)-1,y=Math.floor(Number(c.dataset.cursorY)*c.height)-1;return Array.from(c.getContext("2d")!.getImageData(x,y,1,1).data);})).toEqual([255,0,0,128]);
  await page.mouse.up();await expect.poll(()=>poses.filter(p=>p.shape?.kind===4).length).toBeGreaterThan(1);
  const original=await base.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext("2d")!.getImageData(Math.floor(c.width*.5),Math.floor(c.height*.5)-1,1,1).data);});
  expect(original).toEqual(samples.underGreen);
  await base.evaluate(el=>{for(const type of ["keydown","keyup"])el.dispatchEvent(new KeyboardEvent(type,{code:"F13",key:"F13",bubbles:true,cancelable:true}));});
  await expect.poll(()=>poses.some(p=>!p.visible)).toBe(true);
  await expect.poll(()=>overlay.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext("2d")!.getImageData(Math.floor(c.width*.5)-1,Math.floor(c.height*.5)-1,1,1).data[3];})).toBe(0);
  const settings=view.getByRole("button",{name:"情報・設定",exact:true});if(await settings.getAttribute("aria-expanded")!=="true")await settings.click();await view.getByText('画質・計測',{exact:true}).click();
  await view.getByLabel("共有元のカーソルを表示").uncheck();await view.getByRole("button",{name:"適用して再接続",exact:true}).click();
  await expect(base).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect(overlay).toHaveCount(0);
  expect(await base.evaluate(el=>getComputedStyle(el).cursor)).not.toBe("none");await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
 }finally{await provider.close();}
});
