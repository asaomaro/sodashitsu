import {fileURLToPath} from 'node:url';
import {expect,test} from '../support/fixtures.js';
import {startAppServer} from '../support/appServer.js';
import {openNativeTab} from '../support/nativeTab.js';
// Generated pixels and fake helper only: never installs a driver or changes OS displays.
for(const mode of ['switch','headless','no-permission','old-helper','driver-missing','slow'] as const)test(`generated virtual desktop ${mode}`,async({page,appServer})=>{
 test.setTimeout(60000);
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static','--allow-input',...(mode==='old-helper'?[]:['--virtual-display']),...(mode==='headless'?['--headless']:[]),...(mode==='driver-missing'?['--virtual-missing']:[]),...(mode==='slow'?['--configure-delay-ms','16000']:[])]),SODA_DESKTOP_ALLOW_VIRTUAL_DISPLAY:mode==='no-permission'?'0':'1',SODA_DESKTOP_ALLOW_INPUT:'1'};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const starts:{request:any,received:any[]}[]=[];
 page.on('websocket',socket=>{let current:typeof starts[number]|undefined;socket.on('framesent',({payload})=>{if(typeof payload!=='string')return;try{const m=JSON.parse(payload);if(m.type==='start'){current={request:m,received:[]};starts.push(current);}}catch{}});socket.on('framereceived',({payload})=>{if(current&&typeof payload==='string'){try{current.received.push(JSON.parse(payload));}catch{}}});});
 try{
  const owner=await provider.openClient(),a=await appServer.openClient(),invite=await a.request('machine.invite',{label:'Generated virtual B'});await owner.request('machine.delegate',{url:appServer.origin,machineId:invite.machineId,token:invite.token});await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,'desktop',header);
  const view=page.locator('[data-remote-desktop]'),canvas=view.getByLabel('共有画面');
  if(mode!=='headless'&&mode!=='slow')await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);
  if(mode==='switch'){await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(view.locator('[data-desktop-status]')).toContainText('操作中');}
  await view.getByLabel('一時的な仮想画面を使う',{exact:true}).check();await expect.poll(()=>starts.at(-1)?.request.options.virtualDisplay).toBe(true);
  if(['no-permission','old-helper','driver-missing'].includes(mode)){
   await expect(view.locator('[data-desktop-status]')).toContainText('停止');await expect(view).toContainText('仮想画面を作成できません');if(mode==='driver-missing')await expect(view).toContainText('仮想画面ドライバーが未導入です');expect(starts.at(-1)!.received.some(m=>m.type==='ready')).toBe(false);await expect(canvas).toHaveAttribute('data-rendered-frames','0');expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext('2d')!.getImageData(0,0,1,1).data[3];})).toBe(0);
  }else{
   await expect(view.locator('[data-virtual-display-active]')).toBeVisible({timeout:25000});await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);await expect(view.locator('[data-desktop-status]')).toContainText('閲覧中');expect(starts.at(-1)!.received.find(m=>m.type==='ready')).toMatchObject({virtualDisplay:true,title:'Generated owned virtual desktop'});expect(starts.at(-1)!.request.options).not.toHaveProperty('monitorDevice');
   const pixel=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext('2d')!.getImageData(20,20,1,1).data);});expect(pixel[3]).toBe(255);
   await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(view.locator('[data-desktop-status]')).toContainText('操作中');
   if(mode==='switch'){await view.getByLabel('一時的な仮想画面を使う',{exact:true}).uncheck();await expect(view.locator('[data-virtual-display-active]')).toHaveCount(0);await expect(canvas).toHaveAttribute('data-rendered-frames',/^[1-9]/);await expect(view.locator('[data-desktop-status]')).toContainText('閲覧中');expect(starts.at(-1)!.request.options).not.toHaveProperty('virtualDisplay');}
  }
  await view.getByRole('button',{name:'共有停止',exact:true}).click();
 }finally{await provider.close();}
});
