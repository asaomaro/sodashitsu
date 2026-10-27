import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";
test("quality drafts survive browser reload without Apply, including codec, route, rate and fit",async({page,appServer})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--native-codecs","--native-60fps","--native-datagrams","--native-fixture",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url)),"--codec-fixtures",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/",import.meta.url))]),SODA_DESKTOP_ALLOW_MEDIA:"1"};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 await page.addInitScript(()=>{
  const Original=WebSocket;const descriptor=Object.getOwnPropertyDescriptor(Original.prototype,"onmessage")!;
  (window as any).__withoutNative=false;
  window.WebSocket=class extends Original {
   override set onmessage(fn:((this:WebSocket,event:MessageEvent)=>any)|null){descriptor.set!.call(this,fn?function(this:WebSocket,event:MessageEvent){if(typeof event.data==="string"){const m=JSON.parse(event.data);if(m.type==="ready"&&(window as any).__withoutNative){m.nativeVideo=false;event=new MessageEvent("message",{data:JSON.stringify(m)});}}fn.call(this,event);}:null);}
   override get onmessage(){return descriptor.get!.call(this);}
  };
 });
 const sent:any[]=[];page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});});
 try{
  const owner=await provider.openClient(),agent=await appServer.openClient(),invite=await agent.request("machine.invite",{label:"Quality memory B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);
  await view.getByText("画質・計測",{exact:true}).click();await view.getByLabel("送信幅の上限").fill("1000");await view.getByLabel("fps上限",{exact:true}).fill("7");await view.getByLabel("JPEG品質").fill("72");await view.getByLabel("送信する色").selectOption("gray16");await view.getByLabel("共有元のカーソルを表示",{exact:true}).uncheck();await view.getByLabel("差分転送",{exact:true}).uncheck();await view.getByLabel("自動画質調整",{exact:true}).check();
  await view.locator("[data-desktop-media] summary").click();await view.getByLabel("動画の経路").selectOption("native");await view.getByLabel("動画帯域の上限").fill("6789");await view.getByLabel("動画コーデック").selectOption("hevc");await view.getByLabel("動画FPS上限").selectOption("30");await view.getByLabel("UDPを優先",{exact:false}).uncheck();await view.getByLabel("画面に合わせる",{exact:true}).uncheck();
  // A real reload bypasses Vue's unmount hook; assertions observe browser state
  // and its new start request, so saving only on close/Apply cannot pass.
  await page.reload();await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});if(!await view.count())await openNativeTab(page,"desktop",header);else await view.getByRole("button",{name:"情報・設定",exact:true}).click();
  await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);await view.getByText("画質・計測",{exact:true}).click();await expect(view.getByLabel("送信幅の上限")).toHaveValue("1000");await expect(view.getByLabel("fps上限",{exact:true})).toHaveValue("7");await expect(view.getByLabel("JPEG品質")).toHaveValue("72");await expect(view.getByLabel("送信する色")).toHaveValue("gray16");await expect(view.getByLabel("共有元のカーソルを表示",{exact:true})).not.toBeChecked();await expect(view.getByLabel("差分転送",{exact:true})).not.toBeChecked();await expect(view.getByLabel("自動画質調整",{exact:true})).toBeChecked();await expect(view.getByLabel("画面に合わせる",{exact:true})).not.toBeChecked();
  await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");await expect(view.getByLabel("動画帯域の上限")).toHaveValue("6789");await expect(view.getByLabel("動画コーデック")).toHaveValue("hevc");await expect(view.getByLabel("動画FPS上限")).toHaveValue("30");await expect(view.getByLabel("UDPを優先",{exact:false})).not.toBeChecked();await expect(view.getByLabel("システム音声を要求",{exact:true})).not.toBeChecked();
  await page.evaluate(()=>(window as any).__withoutNative=true);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("auto");
  await page.evaluate(()=>(window as any).__withoutNative=false);await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(view.getByLabel("動画の経路")).toHaveValue("native");
  expect(sent.filter(m=>m.type==="media"&&m.enabled)).toHaveLength(0);expect(sent.filter(m=>m.type==="control"&&m.enabled)).toHaveLength(0);expect(sent.filter(m=>m.type==="start").at(-1).options).toMatchObject({width:1000,fps:7,quality:72,deltas:false,adaptive:true,image:{colorMode:"gray16",showCursor:false}});
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();}
});
