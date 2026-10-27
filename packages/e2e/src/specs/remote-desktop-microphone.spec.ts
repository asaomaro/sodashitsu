import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab, closeNativeTab } from "../support/nativeTab.js";

test("explicit microphone sends generated PCM to B, stops tracks and never restarts on reopen",async({page,appServer})=>{
 test.setTimeout(60000);
 const dir=await mkdtemp(join(tmpdir(),"soda-mic-browser-")),ledger=join(dir,"microphone.jsonl");
 const saved=process.env.SODA_DESKTOP_COMMAND;
 process.env.SODA_DESKTOP_COMMAND=JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--microphone-fixture","--lifecycle-ledger",ledger]);
 const provider=await startAppServer().finally(()=>{if(saved===undefined)delete process.env.SODA_DESKTOP_COMMAND;else process.env.SODA_DESKTOP_COMMAND=saved;});
 const sent:any[]=[],received:any[]=[];
 page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share")){socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});socket.on("framereceived",({payload})=>{if(typeof payload==="string")received.push(JSON.parse(payload));});}});
 // Generated oscillator only. Neither the fixture nor the product graph is
 // connected to a hardware output; getUserMedia never opens a real microphone.
 await page.addInitScript(()=>{
  const w=window as any,Context=AudioContext;w.__mic={requests:0,stops:0,maxOutstanding:0};
  const Original=WebSocket,descriptor=Object.getOwnPropertyDescriptor(Original.prototype,"onmessage")!,pending=new Set<number>();
  window.WebSocket=class extends Original {
   override send(value:string|ArrayBufferLike|Blob|ArrayBufferView){if(typeof value==="string"){const m=JSON.parse(value);if(m.type==="microphone_frame"){pending.add(m.seq);w.__mic.maxOutstanding=Math.max(w.__mic.maxOutstanding,pending.size);}}super.send(value);}
   override set onmessage(fn:((this:WebSocket,event:MessageEvent)=>any)|null){descriptor.set!.call(this,fn?function(this:WebSocket,event:MessageEvent){const m=typeof event.data==="string"?JSON.parse(event.data):undefined;if(m?.type==="microphone_ack"){setTimeout(()=>{for(const seq of pending)if(seq<=m.seq)pending.delete(seq);fn.call(this,event);},120);}else fn.call(this,event);}:null);}
   override get onmessage(){return descriptor.get!.call(this);}
  };
  window.AudioContext=class extends Context {private silent:MediaStreamAudioDestinationNode|undefined;override get destination(){return (this.silent??=this.createMediaStreamDestination()) as unknown as AudioDestinationNode;}};
  Object.defineProperty(navigator.mediaDevices,"getUserMedia",{value:async()=>{w.__mic.requests++;const context=new AudioContext({sampleRate:48000}),osc=context.createOscillator(),destination=context.createMediaStreamDestination();osc.frequency.value=440;osc.connect(destination);osc.start();await context.resume();const track=destination.stream.getAudioTracks()[0]!,original=track.stop.bind(track);track.stop=()=>{w.__mic.stops++;original();osc.stop();void context.close();};return destination.stream;}});
 });
 try {
  const owner=await provider.openClient(),agent=await appServer.openClient();
  await owner.request("desktop.settings.set",{enabled:true,allowInput:false,allowClipboard:false,allowDisplayResize:false,allowMicrophone:true,microphoneEndpoint:"synthetic-virtual-render"});
  const invite=await agent.request("machine.invite",{label:"Microphone B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),mic=view.locator("[data-desktop-microphone]");await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);await expect(mic).toBeVisible();await mic.locator("summary").click();
  expect(await page.evaluate(()=>(window as any).__mic.requests)).toBe(0);await mic.getByRole("button",{name:"マイク転送を開始",exact:true}).click();await expect(mic.locator("[data-microphone-state]")).toHaveText("マイク転送中");
  await expect.poll(()=>received.filter(m=>m.type==="microphone_ack").length).toBeGreaterThan(3);
  await expect.poll(()=>page.evaluate(()=>(window as any).__mic.maxOutstanding)).toBeGreaterThanOrEqual(4);expect(await page.evaluate(()=>(window as any).__mic.maxOutstanding)).toBeLessThanOrEqual(12);
  const frame=sent.find(m=>m.type==="microphone_frame");expect(Buffer.from(frame.data,"base64")).toHaveLength(1920);
  // User-visible status/ACK above is the readiness barrier. The helper ledger
  // additionally proves decoded PCM reached the generated B sink, not speakers.
  await expect.poll(async()=>{const rows=(await readFile(ledger,"utf8")).trim().split("\n").map(s=>JSON.parse(s));return rows.some(m=>m.type==="microphone_frame"&&m.rms>1000);}).toBe(true);
  await mic.getByRole("button",{name:"マイク転送を停止",exact:true}).click();await expect(mic.locator("[data-microphone-state]")).toHaveText("マイク停止");expect(await page.evaluate(()=>(window as any).__mic.stops)).toBe(1);
  await closeNativeTab(page);await openNativeTab(page,"desktop",header);await expect(page.locator("[data-remote-desktop]").getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);expect(await page.evaluate(()=>(window as any).__mic.requests)).toBe(1);expect(sent.filter(m=>m.type==="microphone_start")).toHaveLength(1);
 }finally{await page.goto("about:blank");await provider.close();await rm(dir,{recursive:true,force:true});}
});
