import {fileURLToPath} from "node:url";
import {isDesktopMediaChunk} from "@sodashitsu/protocol";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

for(const mode of ["close","stall","stop","one-loss"] as const) test(`native H264 actual UDP candidate/direct ACK and WSS recovery after ${mode}`,async({page,appServer})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--native-datagrams","--native-60fps","--native-fixture",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url))]),SODA_DESKTOP_ALLOW_MEDIA:"1",SODA_DESKTOP_ALLOW_INPUT:"1"};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const received:Record<string,any>[]=[],sent:Record<string,any>[]=[];let wssVideo=0;
 page.on("websocket",ws=>{if(ws.url().endsWith("/desktop-share")){
  ws.on("framereceived",({payload})=>{if(typeof payload==="string")received.push(JSON.parse(payload));else if(isDesktopMediaChunk(payload))wssVideo++;});
  ws.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});
 }});
 await page.addInitScript(({delayNotices})=>{
  if(delayNotices){
   const BaseSocket=WebSocket,descriptor=Object.getOwnPropertyDescriptor(BaseSocket.prototype,"onmessage")!;
   window.WebSocket=class extends BaseSocket{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);Object.defineProperty(this,"onmessage",{configurable:true,get:()=>descriptor.get!.call(this),set:handler=>descriptor.set!.call(this,(event:MessageEvent)=>{
    if(typeof event.data==="string"&&JSON.parse(event.data).type==="native_frame_notice")setTimeout(()=>handler?.call(this,event),500);else handler?.call(this,event);
   })});}};
  }
  const Base=RTCPeerConnection;(window as any).__nativePeers=[];(window as any).__dropNativeVideo=false;(window as any).__dropNextNativeVideo=false;(window as any).__droppedNativeSeq=0;
  window.RTCPeerConnection=class extends Base{constructor(config?:RTCConfiguration){super(config);(window as any).__nativePeers.push(this);
   this.addEventListener("datachannel",({channel})=>{
    if(channel.label!=="soda-h264-v1")return;
    const descriptor=Object.getOwnPropertyDescriptor(RTCDataChannel.prototype,"onmessage")!;
    Object.defineProperty(channel,"onmessage",{configurable:true,get:()=>descriptor.get!.call(channel),set:handler=>descriptor.set!.call(channel,(event:MessageEvent)=>{if((window as any).__dropNativeVideo)return;
     if(event.data instanceof ArrayBuffer&&event.data.byteLength>=20){const seq=new DataView(event.data).getUint32(16);
      if((window as any).__dropNextNativeVideo){(window as any).__dropNextNativeVideo=false;(window as any).__droppedNativeSeq=seq;}
      if(seq===(window as any).__droppedNativeSeq)return;
     }handler?.call(channel,event);})});
   });
  }};
 },{delayNotices:mode==="one-loss"});
 try{
  const owner=await provider.openClient(),a=await appServer.openClient(),invite=await a.request("machine.invite",{label:"Generated UDP B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  await view.locator("[data-desktop-media] summary").click();await view.getByLabel("動画の経路").selectOption("native");await expect(view.getByLabel("UDPを優先（利用できない場合はWSS）")).toBeChecked();
  await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect(view.locator("[data-native-datagrams]")).toBeVisible();
  await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames")),{timeout:20000}).toBeGreaterThan(10);
  expect(wssVideo).toBe(0);expect(sent.some(m=>m.type==="native_video_ack")).toBe(false);expect(received.some(m=>m.type==="native_frame_notice")).toBe(true);
  const selected=await page.evaluate(async()=>{
   const peer=((window as any).__nativePeers as RTCPeerConnection[]).find(p=>p.connectionState==="connected")!;const report=await peer.getStats();
   const rows:any[]=[];report.forEach(s=>rows.push(s));const transport=rows.find(s=>s.type==="transport"&&s.selectedCandidatePairId),pair=transport?rows.find(s=>s.id===transport.selectedCandidatePairId):rows.find(s=>s.type==="candidate-pair"&&s.nominated&&s.state==="succeeded");
   return {local:rows.find(s=>s.id===pair.localCandidateId)?.protocol,remote:rows.find(s=>s.id===pair.remoteCandidateId)?.protocol,ice:peer.getConfiguration().iceServers??[]};
  });expect(selected).toEqual({local:"udp",remote:"udp",ice:[]});
  const pixel=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext("2d")!.getImageData(40,40,1,1).data);});expect(pixel[0]).toBeGreaterThan(180);expect(pixel[1]).toBeLessThan(80);expect(pixel[2]).toBeLessThan(80);
  if(mode==="one-loss"){
   const before=Number(await canvas.getAttribute("data-video-frames"));await page.evaluate(()=>{(window as any).__dropNextNativeVideo=true;});
   await expect.poll(()=>page.evaluate(()=>Number((window as any).__droppedNativeSeq))).toBeGreaterThan(0);
   await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames")),{timeout:10000}).toBeGreaterThan(before+20);
   await expect(view.locator("[data-native-datagrams]")).toBeVisible();expect(wssVideo).toBe(0);expect(received.filter(m=>m.type==="media_stream")).toHaveLength(1);return;
  }
  if(mode==="stop"){
   await view.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("画像配信");await expect(view.locator("[data-native-datagrams]")).toHaveCount(0);expect(wssVideo).toBe(0);return;
  }
  // Close the real browser peer; product must restart a fresh stream over WSS.
  if(mode==="close"){
   await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");await canvas.focus();await page.keyboard.down("Control");await expect.poll(()=>received.some(m=>m.type==="input_ack")).toBe(true);
  }
  const heldDown=sent.filter(m=>m.type==="input"&&m.input?.kind==="key"&&m.input.code==="ControlLeft"&&m.input.down).length;
  if(mode==="close")await page.evaluate(()=>{for(const peer of (window as any).__nativePeers as RTCPeerConnection[])if(peer.connectionState==="connected")peer.close();});
  else await page.evaluate(()=>{(window as any).__dropNativeVideo=true;});
  await expect.poll(()=>wssVideo,{timeout:15000}).toBeGreaterThan(5);await expect(view.locator("[data-native-datagrams]")).toHaveCount(0);
  if(mode==="close"){
   await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");expect(heldDown).toBe(1);expect(sent.filter(m=>m.type==="input"&&m.input?.kind==="key"&&m.input.code==="ControlLeft"&&m.input.down)).toHaveLength(heldDown);await page.keyboard.up("Control");
  }
  const streams=received.filter(m=>m.type==="media_stream"&&m.mime==="video/h264");expect(streams.length).toBe(2);expect(streams[0]!.datagrams).toBe(true);expect(streams[1]!.datagrams).toBeUndefined();expect(streams[1]!.id).not.toBe(streams[0]!.id);
  await view.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
 }finally{await provider.close();}
});
