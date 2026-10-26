import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,test} from '../support/fixtures.js';
import {startAppServer} from '../support/appServer.js';
import {openNativeTab} from '../support/nativeTab.js';
for(const mode of ['av1-udp','av1-wss','av1-loss','hevc','decoder-reject','encoder-unavailable','old-helper','av1-resize','active-decoder-fail'] as const)test(`native codec actual generated access units: ${mode}`,async({page,appServer})=>{
 test.setTimeout(60000);const root=await mkdtemp(join(tmpdir(),'soda-codec-ledger-')),ledger=join(root,'held.jsonl');
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static',...(mode==='av1-resize'?['--native-adaptive','--native-cadence','--native-60fps','--codec-profile',fileURLToPath(new URL('../../../../scripts/remote-desktop/fixtures/av1-software-profiles-generated.json',import.meta.url))]:[]),...(mode==='active-decoder-fail'?['--allow-input','--input-ledger',ledger]:[]),'--native-datagrams',...(mode==='old-helper'?[]:['--native-codecs']),...(mode==='encoder-unavailable'?['--codec-encoder-failure']:[]),'--codec-fixtures',fileURLToPath(new URL('../../../../scripts/remote-desktop/fixtures',import.meta.url)),'--native-fixture',fileURLToPath(new URL('../../../../scripts/remote-desktop/fixtures/h264-generated.json',import.meta.url))]),SODA_DESKTOP_ALLOW_MEDIA:'1',SODA_DESKTOP_ALLOW_INPUT:mode==='active-decoder-fail'?'1':'0'};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const received:any[]=[],sent:any[]=[];
 page.on('websocket',ws=>{if(ws.url().endsWith('/desktop-share')){ws.on('framereceived',({payload})=>{if(typeof payload==='string')received.push(JSON.parse(payload));});ws.on('framesent',({payload})=>{if(typeof payload==='string')sent.push(JSON.parse(payload));});}});
 await page.addInitScript(({loss,reject})=>{
  const w=window as any;w.__codec={decoders:0,channels:[],dropped:0,callbacks:[]};const Decoder=VideoDecoder,Peer=RTCPeerConnection;
  window.VideoDecoder=class extends Decoder{static async isConfigSupported(config:VideoDecoderConfig){if(reject&&config.codec.startsWith('hev1'))return {supported:false,config};return Decoder.isConfigSupported(config);}format='';configure(config:VideoDecoderConfig){this.format=config.codec;super.configure(config);}constructor(init:VideoDecoderInit){super(init);w.__codec.decoders++;w.__codec.callbacks.push({decoder:this,init});}};
  window.RTCPeerConnection=class extends Peer{constructor(config?:RTCConfiguration){super(config);this.addEventListener('datachannel',({channel})=>{w.__codec.channels.push(channel.label);if(!loss||channel.label!=='soda-native-video-v2')return;const descriptor=Object.getOwnPropertyDescriptor(RTCDataChannel.prototype,'onmessage')!;Object.defineProperty(channel,'onmessage',{get:()=>descriptor.get!.call(channel),set:handler=>descriptor.set!.call(channel,(event:MessageEvent)=>{if(event.data instanceof ArrayBuffer&&new DataView(event.data).getUint32(16)===8){w.__codec.dropped++;return;}handler?.call(channel,event);})});});}};
 },{loss:mode==='av1-loss',reject:mode==='decoder-reject'});
 try{
  const owner=await provider.openClient(),a=await appServer.openClient(),invite=await a.request('machine.invite',{label:'Generated codec B'});await owner.request('machine.delegate',{url:appServer.origin,machineId:invite.machineId,token:invite.token});await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,'desktop',header);
  const view=page.locator('[data-remote-desktop]'),canvas=view.getByLabel('共有画面');await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);await view.locator('[data-desktop-media] summary').click();await view.getByLabel('動画の経路').selectOption('native');
  const requested=mode==='hevc'||mode==='decoder-reject'?'hevc':'av1';
  if(mode==='old-helper')await expect(view.getByLabel('動画コーデック')).toHaveCount(0);else{await view.getByLabel('動画コーデック').selectOption(requested);await expect(view.getByLabel('動画コーデック').locator('option[value="h264-444"]')).toHaveJSProperty('disabled',true);}
  if(mode==='av1-resize'){await view.getByText('画質・計測',{exact:true}).click();await view.getByLabel('自動画質調整').check();}
  if(mode==='av1-wss'||mode==='active-decoder-fail')await view.getByLabel('UDPを優先（利用できない場合はWSS）').uncheck();
  let hevcSupported=false;if(mode==='hevc'){const fixture=JSON.parse(readFileSync(new URL('../../../../scripts/remote-desktop/fixtures/hevc-hardware-generated.json',import.meta.url),'utf8'));hevcSupported=await page.evaluate(async codec=>(await VideoDecoder.isConfigSupported({codec,codedWidth:640,codedHeight:360})).supported!,fixture.packets[0].codec);}
  await view.getByRole('button',{name:'動画共有を依頼',exact:true}).click();await expect.poll(async()=>Number(await canvas.getAttribute('data-video-frames')),{timeout:20000}).toBeGreaterThan(12);
  if(mode==='active-decoder-fail'){
   await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(view.locator('[data-desktop-status]')).toContainText('操作中');await canvas.focus();await page.keyboard.down('Shift');
   await expect.poll(async()=>readFile(ledger,'utf8').catch(()=>'' )).toContain('ShiftLeft');
   await page.evaluate(()=>{const w=window as any;w.__codec.retired=w.__codec.callbacks.find((v:any)=>v.decoder.format.startsWith('av01')&&v.decoder.state==='configured');w.__codec.retired.init.error(new DOMException('generated active decoder failure'));});
   await expect(view.locator('[data-native-codec]')).toContainText('実際: H.264');await expect(view.locator('[data-desktop-status]')).toContainText('閲覧中');
   await expect.poll(async()=>{const rows=(await readFile(ledger,'utf8')).trim().split('\n').map(line=>JSON.parse(line));return rows.at(-1)?.held;}).toEqual([]);
   await page.evaluate(()=>(window as any).__codec.retired.init.error(new DOMException('late retired failure')));await page.keyboard.up('Shift');
   const rows=(await readFile(ledger,'utf8')).trim().split('\n').map(line=>JSON.parse(line));expect(rows.filter(row=>row.type==='key-down'&&row.held.includes('ShiftLeft'))).toHaveLength(1);expect(sent.filter(m=>m.type==='native_codec_fallback')).toHaveLength(1);
  }
  if(mode!=='old-helper'){
   const actual=mode==='encoder-unavailable'||mode==='decoder-reject'||mode==='active-decoder-fail'||(mode==='hevc'&&!hevcSupported)?'H.264':requested==='hevc'?'HEVC':'AV1';await expect(view.locator('[data-native-codec]')).toContainText(`実際: ${actual}`);await expect(view.locator('[data-native-codec]')).toContainText(`要求: ${requested==='hevc'?'HEVC':'AV1'}`);
   if(actual==='H.264')await expect(view.locator('[data-native-codec]')).toContainText('H.264へ復帰');
   if(mode==='encoder-unavailable')expect(new Set(received.filter(m=>m.type==='media_stream').map(m=>m.id)).size).toBe(1);
   if(mode==='decoder-reject')expect(sent.filter(m=>m.type==='native_codec_fallback')).toHaveLength(1);
   if(mode.startsWith('av1-'))expect(received.filter(m=>m.type==='media_stream')).toContainEqual(expect.objectContaining({mime:'video/av1',codecName:'av1'}));
  }else expect(sent.find(m=>m.type==='media'&&m.enabled)?.settings).not.toHaveProperty('codec');
  if(mode==='av1-resize'){await expect.poll(()=>received.find(m=>m.type==='media_stream'&&m.generation===2),{timeout:20000}).toMatchObject({codecName:'av1',mime:'video/av1',width:960,height:540});await expect.poll(()=>canvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(960);}
  const count=Number(await canvas.getAttribute('data-video-frames'));await expect.poll(async()=>Number(await canvas.getAttribute('data-video-frames'))).toBeGreaterThan(count+10);
  const pixel=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext('2d')!.getImageData(Math.floor(c.width*.15),Math.floor(c.height*.15),1,1).data);});expect(pixel[0]).toBeGreaterThan(150);expect(pixel[1]).toBeLessThan(100);expect(pixel[2]).toBeLessThan(100);
  if(mode==='av1-loss'){expect(await page.evaluate(()=>(window as any).__codec.dropped)).toBeGreaterThan(0);expect(await page.evaluate(()=>(window as any).__codec.decoders)).toBeGreaterThan(1);expect(new Set(received.filter(m=>m.type==='media_stream').map(m=>m.id)).size).toBe(1);}
  if(mode!=='av1-wss'&&mode!=='active-decoder-fail'&&mode!=='old-helper')expect(await page.evaluate(()=>(window as any).__codec.channels)).toContain('soda-native-video-v2');
  console.log('NATIVE_CODEC_RESULT',{mode,actual:received.filter(m=>m.type==='media_status'&&m.state==='native').at(-1)?.codec,frames:Number(await canvas.getAttribute('data-video-frames'))});
  await view.getByRole('button',{name:'動画・音声を停止',exact:true}).click();
 }catch(error){console.log('CODEC_DIAGNOSTICS',JSON.stringify(received.filter(m=>['media_status','media_stream','error'].includes(m.type))));console.log('CODEC_VIEW',await page.locator('[data-remote-desktop]').innerText().catch(()=>''));throw error;}finally{await page.keyboard.up('Shift').catch(()=>{});await provider.close();await rm(root,{recursive:true,force:true});}
});
