import {fileURLToPath} from "node:url";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
// Real WebCodecs after an injected encoder-only stall. All capture/render is generated memory.
for(const sealed of [false,true])for(const mode of ["recover","exhaust"] as const)test(`microphone encoder ${mode} ${sealed?"sealed":"plain"}`,async({page,appServer})=>{
 test.setTimeout(60000);
 const dir=await mkdtemp(join(tmpdir(),"soda-microphone-recovery-")),ledger=join(dir,"generated.jsonl"),saved=process.env.SODA_DESKTOP_COMMAND;
 process.env.SODA_DESKTOP_COMMAND=JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--microphone-fixture","--lifecycle-ledger",ledger]);
 const provider=await startAppServer().finally(()=>{if(saved===undefined)delete process.env.SODA_DESKTOP_COMMAND;else process.env.SODA_DESKTOP_COMMAND=saved;});
 const sent:any[]=[];page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});});
 await page.addInitScript(({mode})=>{
  const w=window as any,Context=AudioContext,Encoder=AudioEncoder;
  w.__micRecovery={requests:0,stops:0,encoders:0,closed:0,stalled:0,outputs:0,maxQueue:0};
  window.AudioContext=class extends Context{private silent:MediaStreamAudioDestinationNode|undefined;override get destination(){return(this.silent??=this.createMediaStreamDestination())as unknown as AudioDestinationNode;}};
  window.AudioEncoder=class extends Encoder{
   private stalled:boolean;private queued=0;
   static override isConfigSupported(config:AudioEncoderConfig){return Encoder.isConfigSupported(config);}
   constructor(init:AudioEncoderInit){super({...init,output:(chunk,metadata)=>{w.__micRecovery.outputs++;init.output(chunk,metadata);}});this.stalled=mode==="exhaust"||++w.__micRecovery.encoders===1;if(mode==="exhaust")w.__micRecovery.encoders++;}
   override get encodeQueueSize(){return this.stalled?this.queued:super.encodeQueueSize;}
   override encode(data:AudioData){if(this.stalled){this.queued++;w.__micRecovery.stalled++;w.__micRecovery.maxQueue=Math.max(w.__micRecovery.maxQueue,this.queued);return;}super.encode(data);}
   override close(){w.__micRecovery.closed++;super.close();}
  };
  Object.defineProperty(navigator.mediaDevices,"getUserMedia",{value:async()=>{
   w.__micRecovery.requests++;const audio=new AudioContext({sampleRate:48000}),osc=audio.createOscillator(),destination=audio.createMediaStreamDestination();osc.frequency.value=440;osc.connect(destination);osc.start();await audio.resume();const track=destination.stream.getAudioTracks()[0]!,stop=track.stop.bind(track);track.stop=()=>{w.__micRecovery.stops++;stop();osc.stop();void audio.close();};return destination.stream;
  }});
 },{mode});
 try{
  const owner=await provider.openClient(),operator=await appServer.openClient();await operator.request("prefs.set",{patch:{notifyHintDone:true}});
  await owner.request("desktop.settings.set",{enabled:true,allowInput:false,allowClipboard:false,allowDisplayResize:false,allowMicrophone:true,microphoneEndpoint:"synthetic-virtual-render"});
  const invite=await operator.request("machine.invite",{label:"Generated microphone recovery B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  const identity=sealed?await owner.request("desktop.endpoint.initialize",{}):undefined;if(identity)await owner.request("desktop.endpoint.required",{required:true});
  // Authentication is a fixture precondition; browser DOM/frames still prove microphone behavior.
  const cookie=appServer.cookie,separator=cookie.indexOf("=");await page.context().addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:appServer.origin,httpOnly:true,sameSite:"Strict"}]);
  await page.goto(appServer.origin);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]");
  if(identity){
   const pairing=view.locator("[data-desktop-endpoint]");await pairing.locator("summary").click();await pairing.getByRole("button",{name:"このブラウザの鍵を作成",exact:true}).click();const fingerprint=pairing.locator("[data-browser-fingerprint]");await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);await owner.request("desktop.endpoint.trust",{fingerprint:(await fingerprint.textContent())!,role:"viewer",label:"Generated microphone recovery browser"});await pairing.getByLabel("接続先PCで確認した指紋",{exact:true}).fill(identity.fingerprint!);await pairing.getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました",{exact:true}).check();await pairing.getByRole("button",{name:"この接続先を記憶して暗号化で接続",exact:true}).click();
  }
  await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9]/);const mic=view.locator("[data-desktop-microphone]");await expect(mic).toBeVisible();await mic.locator("summary").click();expect(await page.evaluate(()=>(window as any).__micRecovery.requests)).toBe(0);await mic.getByRole("button",{name:"マイク転送を開始",exact:true}).click();await expect(mic.locator("[data-microphone-codec]")).toHaveText("Opus 32 kbps");
  const probe=()=>page.evaluate(()=>(window as any).__micRecovery);
  const rows=async()=>(await readFile(ledger,"utf8")).trim().split("\n").map(line=>JSON.parse(line));
  if(mode==="recover"){
   await expect.poll(async()=>(await probe()).outputs).toBeGreaterThan(3);await expect(mic.locator("[data-microphone-state]")).toHaveText("マイク転送中");expect((await probe()).encoders).toBe(2);expect((await probe()).stops).toBe(0);
   // DOM and real browser encoder output are readiness barriers; sink RMS additionally proves decode reached B.
   await expect.poll(async()=>(await rows()).some(m=>m.type==="microphone_frame"&&m.rms>1000)).toBe(true);expect((await rows()).filter(m=>m.type==="microphone_start")).toHaveLength(1);
   if(!sealed){const start=sent.find(m=>m.type==="microphone_start"),frames=sent.filter(m=>m.type==="microphone_opus");expect(frames.length).toBeGreaterThan(0);expect(frames.every(m=>m.id===start.id&&m.seq>2)).toBe(true);expect(sent.filter(m=>m.type==="microphone_start")).toHaveLength(1);}
   await mic.getByRole("button",{name:"マイク転送を停止",exact:true}).click();await expect(mic.locator("[data-microphone-state]")).toHaveText("マイク停止");
  }else{
   await expect(mic.locator("[data-microphone-state]")).toContainText("マイクを利用できません");expect((await probe()).encoders).toBe(3);expect((await probe()).outputs).toBe(0);expect((await rows()).some(m=>m.type==="microphone_frame")).toBe(false);
  }
  const result=await probe();expect(result.requests).toBe(1);expect(result.stops).toBe(1);expect(result.closed).toBe(result.encoders);expect(result.maxQueue).toBeLessThanOrEqual(2);if(sealed)await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
 }finally{if(!page.isClosed())await page.goto("about:blank",{timeout:3000}).catch(()=>{});await provider.close();await rm(dir,{recursive:true,force:true});}
});
