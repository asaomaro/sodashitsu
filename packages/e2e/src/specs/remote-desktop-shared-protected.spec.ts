import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,test} from '../support/fixtures.js';
import {startAppServer} from '../support/appServer.js';
import {openNativeTab} from '../support/nativeTab.js';
// Actual A/B servers and browser canvases/WS ACKs; generated pixels and input only.
// Never installs a service, elevates, captures a real desktop, or injects OS input.
for(const mode of ['elevated-default','elevated-uac','old-worker'] as const)test(`protected shared desktop ${mode}`,async({page,context,appServer})=>{
 test.setTimeout(90000);
 const dir=await mkdtemp(join(tmpdir(),'soda-shared-protected-')),end=join(dir,'ended'),ledger=join(dir,'lifecycle');
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--allow-input','--protected-end-marker',end,'--lifecycle-ledger',ledger,'--protected-mode',mode==='elevated-uac'?'elevated-uac':'elevated-default',...(mode==='old-worker'?['--no-shared-protected']:[])]),SODA_DESKTOP_ALLOW_ELEVATED:'1',SODA_DESKTOP_ALLOW_INPUT:'1'};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}),second=await context.newPage();
 const messages:any[][]=[[],[]];for(const[i,p]of[page,second].entries())p.on('websocket',s=>{if(!s.url().endsWith('/desktop-share'))return;s.on('framereceived',({payload})=>{if(typeof payload==='string')try{messages[i]!.push(JSON.parse(payload));}catch{}});});
 try{
  const a=await appServer.openClient(),b=await provider.openClient();await a.request('prefs.set',{patch:{notifyHintDone:true}});const invite=await a.request('machine.invite',{label:'Generated shared protected B'});await b.request('machine.delegate',{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);await expect(page.locator(`[data-machine-id="${invite.machineId}"] [data-state="online"]`)).toBeVisible();await openNativeTab(page,'desktop',page.locator(`[data-machine-id="${invite.machineId}"]`));
  const first=page.locator('[data-remote-desktop]'),c1=first.getByLabel('共有画面');await expect(c1).toHaveAttribute('data-rendered-frames',/^[1-9]/);
  await first.getByLabel('複数viewerで同じ画面を共有',{exact:true}).check();await expect(c1).toHaveAttribute('data-rendered-frames',/^[1-9]/);
  await first.getByLabel('管理者権限のアプリ・UAC画面を共有',{exact:true}).check();await expect(first.getByLabel('複数viewerで同じ画面を共有',{exact:true})).toBeChecked();
  if(mode==='old-worker'){await expect(first.locator('[data-desktop-status]')).toContainText('停止');await expect(c1).toHaveAttribute('data-rendered-frames','0');expect(messages[0]!.some(m=>m.type==='ready'&&m.sharedProtected)).toBe(false);return;}
  await expect(first.locator('[data-desktop-protected]')).toBeVisible();await expect(c1).toHaveAttribute('data-rendered-frames',/^[1-9]/);await expect(first.locator('[data-desktop-shared]')).toBeVisible();
  await second.goto(`${appServer.origin}/#token=${appServer.token}`);await openNativeTab(second,'desktop',second.locator(`[data-machine-id="${invite.machineId}"]`));const view=second.locator('[data-remote-desktop]'),c2=view.getByLabel('共有画面');
  await expect(view.locator('[data-desktop-status]')).toHaveText(/停止|終了/);await expect.poll(()=>messages[1]!.some(m=>m.type==='shared_protected_available'&&m.enabled)).toBe(true);
  await view.getByLabel('複数viewerで同じ画面を共有',{exact:true}).check();await expect(view.locator('[data-desktop-status]')).toHaveText(/停止|終了/);
  await view.getByLabel('管理者権限のアプリ・UAC画面を共有',{exact:true}).check();await expect(view.getByLabel('複数viewerで同じ画面を共有',{exact:true})).toBeChecked();await expect(c2).toHaveAttribute('data-rendered-frames',/^[1-9]/);
  for(const v of[first,view]){await expect(v.locator('[data-desktop-protected]')).toBeVisible();await expect(v.locator('[data-desktop-media]')).toHaveCount(0);await expect(v.locator('[data-agent-access]')).toHaveCount(0);}
  const children=(await readFile(ledger,'utf8')).trim().split('\n').length;expect(children).toBe(3); // initial normal, normal shared, protected shared
  await page.bringToFront();await first.getByRole('button',{name:'操作する',exact:true}).click();await expect(first.locator('[data-desktop-status]')).toContainText('操作中');
  const before=messages[1]!.filter(m=>m.type==='control').length;await view.getByRole('button',{name:'操作する',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());await expect.poll(()=>messages[1]!.filter(m=>m.type==='control').length).toBeGreaterThan(before);expect(messages[1]!.filter(m=>m.type==='control').at(-1).enabled).toBe(false);
  const count=Number(await c2.getAttribute('data-rendered-frames'));await first.getByRole('button',{name:'共有停止',exact:true}).click();await second.bringToFront();await expect.poll(async()=>Number(await c2.getAttribute('data-rendered-frames'))).toBeGreaterThan(count);
  await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(view.locator('[data-desktop-status]')).toContainText('操作中');await c2.focus();await second.keyboard.press('ArrowRight');await expect.poll(()=>messages[1]!.some(m=>m.type==='input_ack')).toBe(true);expect((await readFile(ledger,'utf8')).trim().split('\n')).toHaveLength(children);
  await writeFile(end,'changed');await expect(view.locator('[data-desktop-status]')).toContainText('停止');await expect(view).toContainText('接続し直し');expect(await c2.evaluate(el=>{const c=el as HTMLCanvasElement;return c.getContext('2d')!.getImageData(20,20,1,1).data[3];})).toBe(0);
 }finally{await second.close();await provider.close();await rm(dir,{recursive:true,force:true});}
});
