import {fileURLToPath} from 'node:url';
import {expect,test} from '../support/fixtures.js';
import {startAppServer} from '../support/appServer.js';
import {openNativeTab} from '../support/nativeTab.js';
const executablePath=process.env["SODA_E2E_CHROMIUM_PATH"];
if(executablePath)test.use({launchOptions:{executablePath}});
for(const backend of ["linux-portal","macos-sck"] as const)
for(const mode of ["udp","wss"] as string[])test(`${backend} generated native resolution and Opus continuity: ${mode}`,async({page,appServer})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static','--allow-input','--native-platform',backend,'--native-adaptive','--native-cadence','--native-60fps','--native-datagrams','--native-audio','--native-fixture',fileURLToPath(new URL('../../../../scripts/remote-desktop/fixtures/h264-native-adaptive.json',import.meta.url))]),SODA_DESKTOP_ALLOW_MEDIA:'1',SODA_DESKTOP_ALLOW_INPUT:'1',SODA_DESKTOP_NATIVE_PLATFORM:backend};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const messages:any[]=[];
 page.on('websocket',ws=>{if(ws.url().endsWith('/desktop-share'))ws.on('framereceived',({payload})=>{if(typeof payload==='string')messages.push(JSON.parse(payload));});});
 await page.addInitScript(({slow})=>{
  const w=window as any;w.__adaptive={outputs:0,energy:0,audio:[],contexts:[],peers:[],controls:[]};
  const send=RTCDataChannel.prototype.send;RTCDataChannel.prototype.send=function(data:any){if(typeof data==='string')w.__adaptive.controls.push(JSON.parse(data));return send.call(this,data);};
  const Audio=AudioDecoder,Context=AudioContext,Peer=RTCPeerConnection;
  window.AudioDecoder=class extends Audio{constructor(init:AudioDecoderInit){super({...init,output:data=>{const values=new Float32Array(data.numberOfFrames);data.copyTo(values,{planeIndex:0,format:'f32-planar'});w.__adaptive.outputs++;w.__adaptive.energy=Math.max(w.__adaptive.energy,Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length));init.output(data);}});w.__adaptive.audio.push(this);}};
  // Real decode/scheduling; generated tone ends at a virtual stream, never speakers.
  window.AudioContext=class extends Context{private silent:MediaStreamAudioDestinationNode|undefined;constructor(options?:AudioContextOptions){super(options);w.__adaptive.contexts.push(this);}override get destination(){return(this.silent??=this.createMediaStreamDestination()) as unknown as AudioDestinationNode;}};
  window.RTCPeerConnection=class extends Peer{constructor(config?:RTCConfiguration){super(config);w.__adaptive.peers.push(this);}};
  if(slow){const support=VideoDecoder.isConfigSupported.bind(VideoDecoder);Object.defineProperty(VideoDecoder,'isConfigSupported',{value:async(config:VideoDecoderConfig)=>{if(config.codedWidth===960)await new Promise(r=>setTimeout(r,2200));return support(config);}});}
 },{slow:mode==='slow-format'});
 try{
  const owner=await provider.openClient(),a=await appServer.openClient(),invite=await a.request('machine.invite',{label:'Generated adaptive B'});
  await owner.request('machine.delegate',{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,'desktop',header);
  const view=page.locator('[data-remote-desktop]'),canvas=view.getByLabel('共有画面');await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);
  await view.locator('[data-desktop-media] summary').click();await view.getByLabel('動画の経路').selectOption('native');
  await view.getByLabel('システム音声を要求').check();if(mode==='wss')await view.getByLabel('UDPを優先（利用できない場合はWSS）').uncheck();
  await view.getByLabel('動画のFPS・帯域・解像度を自動調整',{exact:true}).check();
  await view.getByRole('button',{name:'動画共有を依頼',exact:true}).click();
  await expect.poll(async()=>Number(await canvas.getAttribute('data-video-frames'))).toBeGreaterThan(5);
  await expect(view.locator('[data-native-audio]')).toContainText('ミュート');await view.getByRole('button',{name:'音声を再生',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__adaptive.outputs)).toBeGreaterThan(10);
  const before=await page.evaluate(()=>(window as any).__adaptive.outputs),peersBefore=await page.evaluate(()=>(window as any).__adaptive.peers.length);
  await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(view.locator('[data-desktop-status]')).toHaveText('操作中');await canvas.focus();await page.keyboard.down('Control');await expect.poll(()=>messages.some(m=>m.type==='input_ack')).toBe(true);
  const inputBefore=messages.filter(m=>m.type==='input_ack').at(-1)!.seq;

   await expect.poll(()=>messages.find(m=>m.type==='media_stream'&&m.generation===2),{timeout:20000}).toMatchObject({width:960,height:600,baseSeq:expect.any(Number)});
   // Actual browser canvas/decoder output is the success signal, not a test WS.
   await expect(view.locator('[data-desktop-media]')).toContainText('動画 960×600',{timeout:15000});
   await expect.poll(()=>canvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(960);
   const pixel=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext('2d')!.getImageData(Math.floor(c.width*.15),Math.floor(c.height*.15),1,1).data);});expect(pixel[0]).toBeGreaterThan(150);expect(pixel[1]).toBeLessThan(100);expect(pixel[2]).toBeLessThan(100);
   const count=Number(await canvas.getAttribute('data-video-frames'));await expect.poll(async()=>Number(await canvas.getAttribute('data-video-frames'))).toBeGreaterThan(count+5);
   const streams=messages.filter(m=>m.type==='media_stream');expect(new Set(streams.map(m=>m.id)).size).toBe(1);
   expect(messages.filter(m=>m.type==='media_status'&&m.state==='native')).toHaveLength(1);
  const afterFormat=await page.evaluate(()=>(window as any).__adaptive.outputs);
  await expect.poll(()=>page.evaluate(()=>(window as any).__adaptive.outputs)).toBeGreaterThan(Math.max(before,afterFormat)+20);
  const state=await page.evaluate(()=>({outputs:(window as any).__adaptive.outputs,energy:(window as any).__adaptive.energy,decoders:(window as any).__adaptive.audio.filter((a:AudioDecoder)=>a.state!=='closed').length,contexts:(window as any).__adaptive.contexts.length,peers:(window as any).__adaptive.peers.length}));
  expect(state.energy).toBeGreaterThan(.01);expect(state.decoders).toBe(1);expect(state.contexts).toBe(1);expect(state.peers).toBe(peersBefore);
  await expect(view.locator('[data-native-audio]')).toContainText('再生中');
  expect(messages.find(m=>m.type==='media_stream'&&m.generation===2).datagrams).toBe(mode==='udp'?true:undefined);
  await expect(view.locator('[data-desktop-status]')).toHaveText('操作中');await page.keyboard.up('Control');await expect.poll(()=>messages.filter(m=>m.type==='input_ack').at(-1)?.seq??0).toBeGreaterThan(inputBefore);

  await page.screenshot({path:test.info().outputPath(`${backend}-${mode}-resolution.png`),fullPage:true});
  await view.getByRole('button',{name:'動画・音声を停止',exact:true}).click();await expect(view.getByRole('button',{name:'音声を止める',exact:true})).toHaveCount(0);
 }catch(error){console.log('ADAPTIVE_DIAGNOSTICS',JSON.stringify(messages.filter(m=>!['rtc_signal','native_video_stats','native_frame_notice','video_ticket','image_ticket'].includes(m.type))));console.log('ADAPTIVE_CONTROLS',await page.evaluate(()=>(window as any).__adaptive.controls.filter((m:any)=>m.type==='native_format_ack')));console.log('ADAPTIVE_VIEW',await page.locator('[data-remote-desktop]').innerText().catch(()=>''));throw error;}finally{await page.keyboard.up('Control').catch(()=>{});await provider.close();}
});
