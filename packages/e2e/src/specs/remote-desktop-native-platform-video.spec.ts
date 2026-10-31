import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

const executablePath=process.env["SODA_E2E_CHROMIUM_PATH"];
if(executablePath)test.use({launchOptions:{executablePath}});

for(const backend of ["linux-portal","macos-sck"] as const)
for(const shared of [false,true])
for(const udp of [false,true])
test(`${backend} generated H264 shared=${shared} udp=${udp} reaches browser pixels and stops independently`,async({page,appServer})=>{
 test.setTimeout(45000);
 const env={
  SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--native-60fps","--native-audio","--native-platform",backend,"--native-fixture",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url))]),
  SODA_DESKTOP_NATIVE_PLATFORM:backend,SODA_DESKTOP_ALLOW_INPUT:"1",SODA_DESKTOP_ALLOW_MEDIA:"1",
 };
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 await page.addInitScript(()=>{
  const w=window as any,Context=AudioContext,Decoder=AudioDecoder;w.__nativeTone={outputs:0,energy:0};
  // Generated source only; terminate the graph at a virtual stream, never speakers.
  window.AudioContext=class extends Context {private silent:MediaStreamAudioDestinationNode|undefined;override get destination(){return(this.silent??=this.createMediaStreamDestination()) as unknown as AudioDestinationNode;}};
  window.AudioDecoder=class extends Decoder {constructor(init:AudioDecoderInit){super({...init,output:data=>{const pcm=new Float32Array(data.numberOfFrames);data.copyTo(pcm,{planeIndex:0,format:"f32-planar"});w.__nativeTone.outputs++;w.__nativeTone.energy=Math.max(w.__nativeTone.energy,Math.sqrt(pcm.reduce((n,v)=>n+v*v,0)/pcm.length));init.output(data);}});}};
 });
 const sent:any[]=[];page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});});
 try{
  const owner=await provider.openClient(),viewer=await appServer.openClient(),invite=await viewer.request("machine.invite",{label:`Generated H264 ${backend}`});
  await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  const split=appServer.cookie.indexOf("=");await page.context().addCookies([{name:appServer.cookie.slice(0,split),value:appServer.cookie.slice(split+1),url:appServer.origin,httpOnly:true,sameSite:"Strict"}]);
  await page.goto(appServer.origin);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  if(shared){await view.locator("[data-shared-desktop-option] input").check();await expect(view.locator("[data-desktop-shared]")).toBeVisible();await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);}
  await view.locator("[data-desktop-media] summary").click();await view.getByLabel("動画の経路").selectOption("native");
  await expect(view.locator("[data-desktop-media]")).toContainText("GPUまたはCPU");
  await view.getByLabel("UDPを優先（利用できない場合はWSS）",{exact:true}).setChecked(udp);
  {
   await expect(view.getByLabel("動画の経路").locator("option[value=native]")).toContainText("システム音声対応");
   await expect(view.getByLabel("システム音声を要求",{exact:true})).toBeEnabled();await view.getByLabel("システム音声を要求",{exact:true}).check();
  }
  await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();
  await expect(view.locator("[data-media-state]")).toHaveText("H.264");
  if(udp)await expect(view.locator("[data-native-datagrams]")).toBeVisible();
  {
   await expect(view.locator("[data-native-audio]")).toContainText("ミュート");expect(await page.evaluate(()=>(window as any).__nativeTone.outputs)).toBe(0);
   await view.getByRole("button",{name:"音声を再生",exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__nativeTone.outputs)).toBeGreaterThan(5);expect(await page.evaluate(()=>(window as any).__nativeTone.energy)).toBeGreaterThan(0.01);
  }

  await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThanOrEqual(8);
  await page.screenshot({path:test.info().outputPath(`native-platform-${backend}-${shared}-${udp}.png`),fullPage:true});
  // The browser decoded only generated test pixels; no OS capture or input occurred.
  const pixel=await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(80,60,1,1).data));
  expect(pixel[0]).toBeGreaterThan(220);expect(pixel[1]).toBeLessThan(35);expect(pixel[2]).toBeLessThan(35);
  if(!udp)await expect.poll(()=>sent.some(value=>value.type==="native_video_ack")).toBe(true);
  const images=Number(await canvas.getAttribute("data-rendered-frames"));await view.getByRole("button",{name:"動画・音声を停止",exact:true}).click();
  await expect(view.locator("[data-media-state]")).toHaveText("画像配信");await expect.poll(async()=>Number(await canvas.getAttribute("data-rendered-frames"))).toBeGreaterThan(images);
  await expect(view.locator('[role="alert"]')).toHaveCount(0);
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();}
});
