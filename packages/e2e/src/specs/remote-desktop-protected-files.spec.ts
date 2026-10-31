// Generated protected markers and temporary files only; no privileged OS worker or input.
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test,expect} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
const executablePath=process.env["SODA_E2E_CHROMIUM_PATH"];
if(executablePath)test.use({launchOptions:{executablePath}});
for(const mode of ["elevated-default","elevated-uac"] as const)
test(`protected ${mode} keeps ordinary-user file upload/download and grant separate`,async({page,context,appServer},testInfo)=>{
 test.setTimeout(45000);const root=await mkdtemp(join(tmpdir(),"soda-protected-file-ui-")),end=join(root,"source-ended");
 const previous=process.env.SODA_DESKTOP_COMMAND;
 process.env.SODA_DESKTOP_COMMAND=JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--protected-mode",mode,"--protected-end-marker",end]);
 const provider=await startAppServer();
 try{
  // Fixture-local persisted permission setup. Product's viewer grant is exercised below.
  await writeFile(join(provider.stateDir,"desktop-permissions.json"),JSON.stringify({enabled:true,allowInput:false,allowClipboard:false,allowDisplayResize:false,allowElevated:true,allowProtectedFiles:true,fileRoot:root}));await provider.restart();
 }finally{if(previous===undefined)delete process.env.SODA_DESKTOP_COMMAND;else process.env.SODA_DESKTOP_COMMAND=previous;}
 const starts:any[]=[],messages:any[]=[],actions:string[]=[];
 page.on("websocket",socket=>{socket.on("framesent",({payload})=>{if(typeof payload!=="string")return;try{const m=JSON.parse(payload);if(m.type==="start")starts.push(m);if(m.type==="desktop_file")actions.push(m.request.action);}catch{}});socket.on("framereceived",({payload})=>{if(typeof payload!=="string")return;try{messages.push(JSON.parse(payload));}catch{}});});
 try{
  const a=await appServer.openClient(),b=await provider.openClient(),invite=await a.request("machine.invite",{label:"Generated protected files B"});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  const i=appServer.cookie.indexOf("=");await context.addCookies([{name:appServer.cookie.slice(0,i),value:appServer.cookie.slice(i+1),url:appServer.origin,httpOnly:true,sameSite:"Strict"}]);await page.goto(appServer.origin);
  const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]");await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  await view.getByLabel("管理者権限のアプリ・UAC画面を共有",{exact:true}).check();await expect(view.locator("[data-desktop-protected]")).toBeVisible();
  expect(starts.at(-1).options).toMatchObject({elevatedDesktop:true,protectedFiles:true});expect(messages.filter(m=>m.type==="ready").at(-1)).not.toHaveProperty("files");expect(messages.find(m=>m.type==="protected_files_ready")).toMatchObject({files:true});
  const panel=view.locator("[data-desktop-files]");await panel.locator("summary").click();await expect(panel.getByRole("button",{name:"ファイル転送を許可",exact:true})).toBeEnabled();expect(actions.filter(a=>a!=="grant")).toEqual([]);
  await panel.getByRole("button",{name:"ファイル転送を許可",exact:true}).click();await expect(panel).toContainText(root);
  const bytes=Buffer.alloc(8192,0x63);await panel.getByLabel("送信するファイル",{exact:true}).setInputFiles({name:"generated-protected.bin",mimeType:"application/octet-stream",buffer:bytes});
  const jobs=panel.getByRole("list",{name:"ファイル転送の一覧"});await expect(jobs).toContainText("完了");expect(await readFile(join(root,"generated-protected.bin"))).toEqual(bytes);
  const pending=page.waitForEvent("download");await panel.getByRole("button",{name:"ダウンロード",exact:true}).click();const received=await pending;expect(await readFile((await received.path())!)).toEqual(bytes);await expect(jobs).toContainText("ブラウザのダウンロードへ渡しました");
  await expect(view.locator("[data-desktop-media]")).toHaveCount(0);await expect(view.locator("[data-desktop-clipboard]")).toHaveCount(0);await page.screenshot({path:testInfo.outputPath(`protected-files-${mode}.png`)});
  await writeFile(end,"changed");await expect(view.locator("[data-desktop-status]")).toContainText("停止");await expect(panel).toHaveCount(0);expect(await readFile(join(root,"generated-protected.bin"))).toEqual(bytes);
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();await rm(root,{recursive:true,force:true});}
});
