import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
for(const mode of ["wss","udp"] as const)test(`shared system audio uses one capture and isolates stop/fallback: ${mode}`,async({page,context,appServer})=>{
 test.setTimeout(90000);const dir=await mkdtemp(join(tmpdir(),"soda-shared-audio-")),lifecycle=join(dir,"source.jsonl");
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--native-60fps","--native-datagrams","--native-audio","--native-fixture",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url)),"--lifecycle-ledger",lifecycle]),SODA_DESKTOP_ALLOW_MEDIA:"1"};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const second=await context.newPage();const ledger=async()=>(await readFile(lifecycle,"utf8")).trim().split("\n").map(s=>JSON.parse(s));
 for(const p of [page,second])await p.addInitScript(()=>{
  const w=window as any,Context=AudioContext,Decoder=AudioDecoder,Peer=RTCPeerConnection;w.__tone={outputs:0,energy:0};w.__peers=[];
  // Generated tone only. Each graph terminates at a virtual MediaStream node,
  // with no connection to hardware speakers and no microphone capture.
  window.AudioContext=class extends Context {private silent:MediaStreamAudioDestinationNode|undefined;override get destination(){return (this.silent??=this.createMediaStreamDestination()) as unknown as AudioDestinationNode;}};
  window.AudioDecoder=class extends Decoder {constructor(init:AudioDecoderInit){super({...init,output:data=>{const pcm=new Float32Array(data.numberOfFrames);data.copyTo(pcm,{planeIndex:0,format:"f32-planar"});w.__tone.outputs++;w.__tone.energy=Math.max(w.__tone.energy,Math.sqrt(pcm.reduce((n,v)=>n+v*v,0)/pcm.length));init.output(data);}});}};
  window.RTCPeerConnection=class extends Peer {constructor(config?:RTCConfiguration){super(config);w.__peers.push(this);}};
 });
 try{
  const a=await appServer.openClient(),b=await provider.openClient(),invite=await a.request("machine.invite",{label:"Generated shared audio B"});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  for(const p of [page,second]){
   await p.goto(`${appServer.origin}/#token=${appServer.token}`);const header=p.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(p,"desktop",header);const view=p.locator("[data-remote-desktop]");await view.getByLabel("複数viewerで同じ画面を共有",{exact:true}).check();await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);await view.locator("[data-desktop-media] summary").click();await expect(view.getByLabel("システム音声を要求",{exact:true})).toBeEnabled();await view.getByLabel("システム音声を要求",{exact:true}).check();if(mode==="wss")await view.getByLabel("UDPを優先",{exact:false}).uncheck();await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect(view.locator("[data-native-audio]")).toContainText("ミュート");expect(await p.evaluate(()=>(window as any).__tone.outputs)).toBe(0);await view.getByRole("button",{name:"音声を再生",exact:true}).click();await expect.poll(()=>p.evaluate(()=>(window as any).__tone.outputs)).toBeGreaterThan(5);expect(await p.evaluate(()=>(window as any).__tone.energy)).toBeGreaterThan(0.01);
  }
  expect((await ledger()).filter(m=>m.type==="audio_start")).toHaveLength(1);expect((await ledger()).filter(m=>m.type==="native_start")).toHaveLength(1);
  const firstView=page.locator("[data-remote-desktop]"),secondView=second.locator("[data-remote-desktop]");
  if(mode==="udp"){
   const before=await second.evaluate(()=>(window as any).__tone.outputs);await page.evaluate(()=>{for(const peer of (window as any).__peers as RTCPeerConnection[])if(peer.connectionState==="connected")peer.close();});await expect(firstView.locator("[data-native-datagrams]")).toHaveCount(0);await expect(secondView.locator("[data-native-datagrams]")).toBeVisible();await expect.poll(()=>second.evaluate(()=>(window as any).__tone.outputs)).toBeGreaterThan(before+8);await expect(firstView.locator("[data-native-audio]")).toContainText("ミュート");await firstView.getByRole("button",{name:"音声を再生",exact:true}).click();expect((await ledger()).filter(m=>m.type==="audio_start")).toHaveLength(1);
  }
  await firstView.getByRole("button",{name:"動画・音声を停止",exact:true}).click();const before=await second.evaluate(()=>(window as any).__tone.outputs);await expect.poll(()=>second.evaluate(()=>(window as any).__tone.outputs)).toBeGreaterThan(before+8);expect((await ledger()).filter(m=>m.type==="audio_stop")).toHaveLength(0);await secondView.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect.poll(async()=>(await ledger()).filter(m=>m.type==="audio_stop").length).toBe(1);await firstView.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect(firstView.locator("[data-native-audio]")).toContainText("ミュート");expect((await ledger()).filter(m=>m.type==="audio_start")).toHaveLength(2);await firstView.getByRole("button",{name:"動画・音声を停止",exact:true}).click();
 }finally{await second.close();await page.goto("about:blank").catch(()=>{});await provider.close();await rm(dir,{recursive:true,force:true});}
});
