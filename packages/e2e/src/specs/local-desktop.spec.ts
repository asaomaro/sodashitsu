import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

test("local connection view renders, accepts input and offers computer-use access without a machine registration",async({page})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input"]),SODA_DESKTOP_ALLOW_INPUT:"1"};
 const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const server=await startAppServer().finally(()=>{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const owner=await server.openClient();
 const sent:Record<string,any>[]=[],received:Record<string,any>[]=[];
 page.on("websocket",socket=>{
  if(!socket.url().endsWith("/desktop-share"))return;
  socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});
  socket.on("framereceived",({payload})=>{if(typeof payload==="string")received.push(JSON.parse(payload));});
 });
 try{
  await owner.request("workspace.set_project_folder",{workspaceId:owner.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
  await page.goto(`${server.origin}/#token=${server.token}`);
  await openNativeTab(page,"desktop");
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),status=view.locator("[data-desktop-status]");
  await expect(canvas).toBeVisible();await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);
  expect(sent.some(m=>m.type==="start"&&m.machineId==="local")).toBe(true);
  await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(status).toHaveText("操作中");
  await canvas.focus();await page.keyboard.press("a");
  await expect.poll(()=>sent.some(m=>m.type==="input"&&m.input?.code==="KeyA"&&m.input.down)).toBe(true);
  await expect.poll(()=>received.some(m=>m.type==="input_ack")).toBe(true);
  await view.locator("details").filter({has:page.locator("summary",{hasText:"エージェント連携"})}).locator("summary").click();
  await view.getByRole("button",{name:"エージェントへの画面提供・操作を許可",exact:true}).click();
  await expect(view.getByLabel("エージェント接続コード")).not.toHaveValue("");
  const ticket=await view.getByLabel("エージェント接続コード").inputValue();
  const lease=await owner.request("desktop.agent.attach",{ticket});
  await expect(status).toHaveText("エージェント操作中");
  const observation=await owner.request("desktop.agent.observe",{leaseId:lease.leaseId});
  // Compare API pixels with the actual canvas; a test-only WS receipt is insufficient.
  expect(await canvas.evaluate(async(el,frame)=>{
   const image=await createImageBitmap(new Blob([Uint8Array.from(atob(frame.imageBase64),c=>c.charCodeAt(0))],{type:frame.format}));
   const off=new OffscreenCanvas(image.width,image.height),ctx=off.getContext("2d")!;ctx.drawImage(image,0,0);image.close();
   const rendered=el as HTMLCanvasElement;
   return frame.width===rendered.width&&Array.from(ctx.getImageData(30,30,1,1).data).join()===Array.from(rendered.getContext("2d")!.getImageData(30,30,1,1).data).join();
  },observation)).toBe(true);
  expect(await owner.request("desktop.agent.act",{leaseId:lease.leaseId,observationId:observation.observationId,inputs:[{kind:"text",text:"Local computer use"}]})).toMatchObject({acknowledged:1});
  await view.getByRole("button",{name:"エージェント許可を取り消す",exact:true}).click();
  await expect(view.getByLabel("エージェント接続コード")).toHaveCount(0);
  await expect(owner.request("desktop.agent.observe",{leaseId:lease.leaseId})).rejects.toThrow();
  await page.locator(".viewer-item.active .viewer-close").click();await expect(view).toHaveCount(0);
 }finally{owner.close();await server.close();}
});
