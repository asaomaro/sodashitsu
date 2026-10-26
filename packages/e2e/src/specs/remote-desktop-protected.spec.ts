import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,test} from '../support/fixtures.js';
import {startAppServer} from '../support/appServer.js';
import {openNativeTab} from '../support/nativeTab.js';
// Browser DOM/canvas and browser WS frames, generated helper only. No elevation,
// service installation, UAC prompt, capture or input on the Windows desktop.
for(const mode of ['elevated-default','elevated-uac','no-permission','old-helper'] as const)test(`generated protected desktop ${mode}`,async({page,appServer})=>{
 test.setTimeout(60000);
 const dir=await mkdtemp(join(tmpdir(),'soda-protected-e2e-')),end=join(dir,'ended');
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static','--allow-input','--protected-end-marker',end,...(mode==='old-helper'?[]:['--protected-mode',mode==='elevated-uac'?'elevated-uac':'elevated-default'])]),SODA_DESKTOP_ALLOW_ELEVATED:mode==='no-permission'?'0':'1',SODA_DESKTOP_ALLOW_INPUT:'1'};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const starts:{request:any;received:any[]}[]=[];
 page.on('websocket',socket=>{let current:typeof starts[number]|undefined;socket.on('framesent',({payload})=>{if(typeof payload!=='string')return;try{const m=JSON.parse(payload);if(m.type==='start'){current={request:m,received:[]};starts.push(current);}}catch{}});socket.on('framereceived',({payload})=>{if(current&&typeof payload==='string')try{current.received.push(JSON.parse(payload));}catch{}});});
 try{
  const b=await provider.openClient(),a=await appServer.openClient(),invite=await a.request('machine.invite',{label:'Generated protected B'});
  await b.request('machine.delegate',{url:appServer.origin,machineId:invite.machineId,token:invite.token});await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,'desktop',header);
  const view=page.locator('[data-remote-desktop]'),canvas=view.getByLabel('共有画面'),status=view.locator('[data-desktop-status]');
  await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(status).toContainText('操作中');
  await view.getByLabel('管理者権限のアプリ・UAC画面を共有',{exact:true}).check();await expect.poll(()=>starts.at(-1)?.request.options.elevatedDesktop).toBe(true);
  expect(starts.at(-1)!.request.options).not.toHaveProperty('virtualDisplay');expect(starts.at(-1)!.request.options).not.toHaveProperty('monitorDevice');
  if(mode==='no-permission'||mode==='old-helper'){
   await expect(status).toContainText('停止');await expect(view).toContainText('管理者画面');expect(starts.at(-1)!.received.some(m=>m.type==='ready')).toBe(false);
   await expect(canvas).toHaveAttribute('data-rendered-frames','0');expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext('2d')!.getImageData(20,20,1,1).data[3];})).toBe(0);
   await expect(view.getByRole('button',{name:'既定のモニターで接続し直す'})).toHaveCount(0);
  }else{
   await expect(view.locator('[data-desktop-protected]')).toBeVisible();await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);await expect(status).toContainText('管理者画面・閲覧中');
   expect(starts.at(-1)!.received.find(m=>m.type==='ready')).toMatchObject({secureDesktop:true,protectedDesktop:mode});
   await expect(view.getByRole('button',{name:'Ctrl+Alt+Del',exact:true})).toHaveCount(0);await expect(view.locator('[data-desktop-locked]')).toHaveCount(0);
   await expect(view.locator('[data-agent-access]')).toHaveCount(0);await expect(view.locator('[data-desktop-media]')).toHaveCount(0);await expect(view.locator('[data-desktop-clipboard]')).toHaveCount(0);
   await expect(view.getByLabel('接続先を最大解像度にする',{exact:true})).toHaveCount(0);
   expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext('2d')!.getImageData(20,20,1,1).data[3];})).toBe(255);
   await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(status).toContainText('操作中');await canvas.focus();await page.keyboard.press('ArrowRight');
   await expect.poll(()=>starts.at(-1)!.received.some(m=>m.type==='input_ack')).toBe(true);
   if(mode==='elevated-uac'){
    await writeFile(end,'changed');await expect(status).toContainText('停止');await expect(view).toContainText('接続し直し');
    await expect(view.getByLabel('確定した文字を送る')).toBeDisabled();expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext('2d')!.getImageData(20,20,1,1).data[3];})).toBe(0);
    expect(starts.filter(s=>s.request.options.elevatedDesktop)).toHaveLength(1);
   }else{
    await view.getByLabel('管理者権限のアプリ・UAC画面を共有',{exact:true}).uncheck();await expect(view.locator('[data-desktop-protected]')).toHaveCount(0);await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);await expect(status).toHaveText('閲覧中');expect(starts.at(-1)!.request.options).not.toHaveProperty('elevatedDesktop');
   }
  }
  await view.getByRole('button',{name:'共有停止',exact:true}).click();
 }finally{await provider.close();await rm(dir,{recursive:true,force:true});}
});
