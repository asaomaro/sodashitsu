import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

for(const backend of ["linux-portal","macos-sck"] as const)
test(`fresh ${backend} browser explicitly enables native shared desktop`,async({page,appServer})=>{
 test.setTimeout(45000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--native-platform",backend,"--allow-clipboard","--rich-clipboard"]),SODA_DESKTOP_NATIVE_PLATFORM:backend,SODA_DESKTOP_ALLOW_INPUT:"1",SODA_DESKTOP_ALLOW_MEDIA:"0",SODA_DESKTOP_ALLOW_CLIPBOARD:"1"};
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 await page.addInitScript(()=>{
  const state={writes:0,text:"",html:""};(window as any).__nativeClip=state;
  Object.defineProperty(navigator,"clipboard",{value:{read:async()=>[],write:async(items:ClipboardItem[])=>{
   for(const item of items)for(const type of item.types){const blob=await item.getType(type);if(type==="text/plain")state.text=await blob.text();if(type==="text/html")state.html=await blob.text();}
   state.writes++;
  }}});
 });
 const sent:any[]=[];page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});});
 try{
  const a=await appServer.openClient(),b=await provider.openClient(),invite=await a.request("machine.invite",{label:`Generated shared ${backend}`});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  const separator=appServer.cookie.indexOf("=");await page.context().addCookies([{name:appServer.cookie.slice(0,separator),value:appServer.cookie.slice(separator+1),url:appServer.origin,httpOnly:true,sameSite:"Strict"}]);
  await page.goto(appServer.origin);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),shared=view.locator("[data-shared-desktop-option] input");
  await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect(view.locator("[data-native-platform]")).toContainText(backend==="linux-portal"?"Linux / Portal":"macOS / ScreenCaptureKit");
  await expect(shared).toBeVisible();await expect(shared).not.toBeChecked();await shared.check();
  // Observe the actual browser's start request and rendered replacement image.
  await expect.poll(()=>sent.some(m=>m.type==="start"&&m.options.sharedDesktop===true)).toBe(true);
  await expect(shared).toBeChecked();await expect(view.locator("[data-desktop-shared]")).toBeVisible();await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.width>0&&c.height>0&&c.getContext("2d")!.getImageData(0,0,1,1).data[3]===255;})).toBe(true);
  await expect(view.locator('[role="alert"]')).toHaveCount(0);
  await view.locator("[data-shared-clipboard] input").check();
  await expect.poll(()=>sent.some(m=>m.type==="start"&&m.options.sharedClipboard===true)).toBe(true);
  await view.locator("[data-desktop-clipboard] summary").click();
  await view.getByRole("button",{name:"クリップボード共有を許可",exact:true}).click();
  const read=view.getByRole("button",{name:"画像・書式を手元へコピー",exact:true});await expect(read).toBeEnabled();await read.click();
  // Only the browser memory clipboard is observed; no OS clipboard API is invoked.
  await expect.poll(()=>page.evaluate(()=>(window as any).__nativeClip.writes)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__nativeClip.text)).toBe("B generated table");
  expect(await page.evaluate(()=>(window as any).__nativeClip.html)).toContain('style="color:green"');
  await expect(view.locator('[data-desktop-clipboard] [role="status"]')).toContainText("コピーしました");
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();}
});
