import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test,expect} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

for(const mode of ["repeat-shared","replace-shared","blur"]as const)test(`control takeover waits for cleanup and preserves latest intent: ${mode}`,async({page,appServer})=>{
 test.setTimeout(45000);const dir=await mkdtemp(join(tmpdir(),"soda-takeover-generated-")),marker=join(dir,"release"),ledger=join(dir,"lifecycle"),record=join(dir,"input");
 const env={SODA_DESKTOP_ALLOW_INPUT:"1",SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--resource-fence-release-marker",marker,"--lifecycle-ledger",ledger,"--record",record])},before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}),sent:boolean[]=[],received:boolean[]=[];
 page.on("websocket",socket=>{if(new URL(socket.url()).pathname!=="/desktop-share")return;socket.on("framesent",({payload})=>{if(typeof payload==="string"){const value=JSON.parse(payload);if(value.type==="control")sent.push(value.enabled);}});socket.on("framereceived",({payload})=>{if(typeof payload==="string"){const value=JSON.parse(payload);if(value.type==="control")received.push(value.enabled);}});});
 const entries=async()=>{try{return(await readFile(ledger,"utf8")).trim().split("\n").map(line=>JSON.parse(line));}catch{return[];}};
 try{
  const a=await appServer.openClient(),b=await provider.openClient();await a.request("prefs.set",{patch:{notifyHintDone:true}});await b.request("prefs.set",{patch:{notifyHintDone:true}});const invite=await a.request("machine.invite",{label:"Generated takeover B"});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(appServer.origin+"/#token="+appServer.token);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面",{exact:true}),status=view.locator("[data-desktop-status]");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  if(mode!=="blur"){await view.getByLabel("複数viewerで同じ画面を共有",{exact:true}).check();await expect(status).toHaveText("閲覧中");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);}
  await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(status).toHaveText("操作中");await view.getByRole("button",{name:"閲覧に戻る",exact:true}).click();await expect(status).toHaveText("閲覧中");await expect.poll(async()=>(await entries()).some(value=>value.type==="resource_fence_wait"&&value.resource==="control")).toBe(true);
  await view.getByRole("button",{name:"操作する",exact:true}).click();await expect.poll(()=>sent.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  if(mode==="repeat-shared")await view.getByRole("button",{name:"操作する",exact:true}).click();
  else if(mode==="replace-shared"){
   // Public controls use the same focused viewer socket. Exercise true→false→true
   // while cleanup is held, without inventing a source-side permission or ACK.
   await view.getByRole("button",{name:"操作する",exact:true}).focus();await page.evaluate(()=>{const outside=document.createElement("input");outside.id="takeover-outside";document.body.append(outside);outside.focus();});await expect.poll(()=>sent.filter(v=>!v).length).toBeGreaterThanOrEqual(2);await view.getByRole("button",{name:"操作する",exact:true}).click();
  }else{
   await page.evaluate(()=>{const outside=document.createElement("input");outside.id="takeover-outside";document.body.append(outside);outside.focus();});await expect.poll(()=>sent.filter(v=>!v).length).toBeGreaterThanOrEqual(2);
  }
  await writeFile(marker,"generated release");await expect.poll(async()=>(await entries()).some(value=>value.type==="resource_fence_done"&&value.resource==="control")).toBe(true);
  if(mode==="blur"){await expect.poll(()=>received.filter(v=>!v).length).toBeGreaterThanOrEqual(2);await expect(status).toHaveText("閲覧中");expect(await page.locator("#takeover-outside").evaluate(el=>el===document.activeElement)).toBe(true);}
  else{await expect(status).toHaveText("操作中");await canvas.focus();await canvas.press("a");await expect.poll(async()=>readFile(record,"utf8").catch(()=>"")).toContain('"code":"KeyA"');}
 }finally{await writeFile(marker,"generated cleanup");await page.goto("about:blank").catch(()=>{});await provider.close();await rm(dir,{recursive:true,force:true});}
});
