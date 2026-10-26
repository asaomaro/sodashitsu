import {fileURLToPath} from "node:url";
import {isDesktopMediaChunk,isDesktopCursor,decodeDesktopFrame} from "@sodashitsu/protocol";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

test("images render on a separate authenticated socket while input ACK stays on the parent",async({page,appServer})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--input-ack-pipe"]),SODA_DESKTOP_ALLOW_INPUT:"1"};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});

 const sockets:{main:boolean;images:number;acks:number;ready:boolean}[]=[];
 let parentReady=false;
 page.on("websocket",ws=>{
  if(!ws.url().includes("/desktop-share"))return;
  const state={main:false,images:0,acks:0,ready:false};sockets.push(state);
  ws.on("framesent",({payload})=>{if(typeof payload==="string"){try{if(JSON.parse(payload).type==="start")state.main=true;}catch{}}});
  ws.on("framereceived",({payload})=>{
   if(typeof payload==="string"){try{const m=JSON.parse(payload);if(m.type==="ready"){state.ready=true;parentReady=true;}if(m.type==="input_ack")state.acks++;}catch{}}
   else if(!isDesktopMediaChunk(payload)&&!isDesktopCursor(payload)){decodeDesktopFrame(payload);expect(parentReady).toBe(true);state.images++;}
  });
 });
 try{
  const owner=await provider.openClient(),a=await appServer.openClient();
  const invite=await a.request("machine.invite",{label:"Generated cursor B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);

  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");
  await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  await expect.poll(()=>sockets.filter(s=>!s.main).reduce((n,s)=>n+s.images,0)).toBeGreaterThan(0);
  expect(sockets.find(s=>s.main)?.images).toBe(0);expect(sockets.find(s=>s.main)?.ready).toBe(true);
  expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext("2d")!.getImageData(0,0,1,1).data[3];})).toBe(255);
  await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");await canvas.focus();
  await canvas.evaluate(el=>{for(const type of ["keydown","keyup"])el.dispatchEvent(new KeyboardEvent(type,{code:"F13",key:"F13",bubbles:true,cancelable:true}));});
  await expect.poll(()=>sockets.find(s=>s.main)?.acks??0).toBeGreaterThan(0);
  expect(sockets.filter(s=>!s.main).every(s=>s.acks===0)).toBe(true);
 }finally{await provider.close();}
});
