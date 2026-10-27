import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
// Generated pixels and synthetic 80ms capture-cost metadata only. No OS capture,
// input or audio device. Success requires both browsers' draw counters and UI.
test("shared video adapts its one encoder through the browser without restarting either viewer",async({page,context,appServer})=>{
 test.setTimeout(90000);const dir=await mkdtemp(join(tmpdir(),"soda-shared-rate-")),lifecycle=join(dir,"lifecycle.jsonl"),helper=fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url));
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,helper,"--static","--native-60fps","--native-cadence","--native-test-cost","--native-fixture",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url)),"--lifecycle-ledger",lifecycle]),SODA_DESKTOP_ALLOW_MEDIA:"1"};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}),second=await context.newPage(),sent:any[][]=[[],[]];
 for(const[index,browser]of [page,second].entries())browser.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framesent",({payload})=>{if(typeof payload==="string")sent[index]!.push(JSON.parse(payload));});});
 const ledger=async()=>(await readFile(lifecycle,"utf8")).trim().split("\n").map(s=>JSON.parse(s));
 try{
  const a=await appServer.openClient(),b=await provider.openClient(),invite=await a.request("machine.invite",{label:"Generated shared rate"});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  for(const browser of [page,second]){
   await browser.goto(`${appServer.origin}/#token=${appServer.token}`);const header=browser.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(browser,"desktop",header);const view=browser.locator("[data-remote-desktop]");await view.getByLabel("複数viewerで同じ画面を共有",{exact:true}).check();await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("共有動画のFPS・帯域を自動調整",{exact:true})).toBeEnabled();await view.getByLabel("共有動画のFPS・帯域を自動調整",{exact:true}).check();await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("GPU H.264");await expect.poll(async()=>Number(await view.getByLabel("共有画面").getAttribute("data-video-frames"))).toBeGreaterThan(4);
  }
  for(const values of sent)expect(values.some(m=>m.type==="media"&&m.enabled&&m.settings?.adaptive===true)).toBe(true);
  await expect.poll(async()=>(await ledger()).some(m=>m.type==="native_rate"&&m.fps<30),{timeout:15000}).toBe(true);const rows=await ledger(),source=rows.find(m=>m.type==="native_start").id;expect(rows.filter(m=>m.type==="native_start")).toHaveLength(1);expect(rows.filter(m=>m.type==="native_rate").every(m=>m.id===source)).toBe(true);expect(rows.filter(m=>m.type==="native_stop")).toHaveLength(0);
  for(const browser of [page,second]){const view=browser.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),before=Number(await canvas.getAttribute("data-video-frames"));await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThan(before+3);await expect(view.locator("[data-shared-rate]")).toBeVisible();expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement,p=c.getContext("2d")!.getImageData(80,60,1,1).data;return c.width===640&&p[0]!>220&&p[1]!<35;})).toBe(true);}
 }finally{await page.goto("about:blank");await second.close();await provider.close();await rm(dir,{recursive:true,force:true});}
});
