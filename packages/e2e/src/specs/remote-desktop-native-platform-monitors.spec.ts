import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,test} from '../support/fixtures.js';
import {startAppServer} from '../support/appServer.js';
import {openNativeTab} from '../support/nativeTab.js';
const executablePath=process.env['SODA_E2E_CHROMIUM_PATH'];
if(executablePath)test.use({launchOptions:{executablePath}});
for(const backend of ['linux-portal','macos-sck'] as const)
for(const restore of [true,false])test(`${backend} generated logical monitors restore=${restore}`,async({page,appServer})=>{
 test.setTimeout(60000);
 const dir=await mkdtemp(join(tmpdir(),"soda-native-monitors-")),record=join(dir,"generated-input");
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static','--allow-input','--monitors','--native-platform',backend,'--record',record,...(!restore?['--monitors-no-restore']:[])]),SODA_DESKTOP_ALLOW_INPUT:'1',SODA_DESKTOP_ALLOW_MONITORS:'1',SODA_DESKTOP_NATIVE_PLATFORM:backend};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const received:any[]=[],inputs:any[]=[];
 page.on('websocket',ws=>{if(!ws.url().endsWith('/desktop-share'))return;ws.on('framereceived',({payload})=>{if(typeof payload==='string')received.push(JSON.parse(payload));});ws.on('framesent',({payload})=>{if(typeof payload==='string'){const m=JSON.parse(payload);if(m.type==='input')inputs.push(m.input);}});});
 try{
  const owner=await provider.openClient(),a=await appServer.openClient(),invite=await a.request('machine.invite',{label:'Generated native logical monitors'});
  await owner.request('machine.delegate',{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,'desktop',header);
  const view=page.locator('[data-remote-desktop]'),canvas=view.getByLabel('共有画面'),selector=view.getByLabel('表示モニター');
  const pixel=()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext('2d')!.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data);});
  await expect(selector).toHaveValue('right');await expect.poll(pixel).toEqual([255,0,0,255]);
  await expect(selector.locator('option[value="all"]')).toHaveAttribute('disabled','');
  if(!restore){await expect(selector).toBeDisabled();expect(received.some(m=>m.type==='native_monitor_restore')).toBe(false);return;}
  await selector.selectOption('left');await expect(selector).toHaveValue('left');await expect.poll(pixel).toEqual([0,0,255,255]);
  await expect(view.locator('[data-desktop-status]')).toHaveText('閲覧中');
  const ready=received.filter(m=>m.type==='ready').at(-1);expect(ready.monitorLayout.coordinateSpace).toBe('logical');expect(ready.width).toBe(1280);expect(ready.monitorLayout.bounds.width).toBe(640);
  expect(received.some(m=>m.type==='native_monitor_restore'||'nativeMonitorRestoreToken'in m)).toBe(false);
  const configured=JSON.parse(await readFile(record+'.configure.json','utf8'));
  if(backend==='linux-portal')expect(configured.nativeMonitorRestoreToken).toMatch(/^generated-portal-/);else expect(configured.nativeMonitorRestoreToken).toBeUndefined();
  await view.getByRole('button',{name:'操作する',exact:true}).click();await expect(view.locator('[data-desktop-status]')).toHaveText('操作中');
  await view.getByRole('button',{name:'情報・設定',exact:true}).click();
  const bounds=(await canvas.boundingBox())!;await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await expect.poll(()=>inputs.some(m=>m.kind==='pointer'&&m.event==='down'&&Math.abs(m.x-.5)<.02&&Math.abs(m.y-.5)<.02)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`${backend}-logical-monitors.png`)});
 }finally{await provider.close();await rm(dir,{recursive:true,force:true});}
});
