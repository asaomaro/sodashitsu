import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decodeFrame, FRAME_TYPE } from '@sodashitsu/protocol';
import { expect, test } from '../support/fixtures.js';
const STUDIO_SOURCE = process.env['YUKKURI_STUDIO_SOURCE'] ? resolve(process.env['YUKKURI_STUDIO_SOURCE']!) : '';
test.skip(!STUDIO_SOURCE || !existsSync(join(STUDIO_SOURCE, 'soda-plugin.json')), 'Yukkuri Studioは外部PJで管理。YUKKURI_STUDIO_SOURCEでソースを指定する');
const CLI=resolve('../cli/dist/main.js');
function command(exe:string,args:string[]){const r=spawnSync(exe,args,{encoding:'utf8'});expect(r.status,r.stderr).toBe(0);return r.stdout;}

test('パースペクティブを切り替えても2つの端末を維持し、タブとペインに汎用ビューを追加できる',async({page,appServer})=>{
 await page.setViewportSize({width:1920,height:1080});
 const root=await mkdtemp(join(tmpdir(),'soda-perspectives-'));
 try{
  command('git',['init',root]);await writeFile(join(root,'hello.txt'),'hello');command('git',['-C',root,'add','hello.txt']);command('git',['-C',root,'-c','user.name=Soda Test','-c','user.email=test@example.invalid','commit','-m','seed-commit']);
  for(const id of ['yukkuri-studio','commit-graph']){
   const bundle=join(root,id+'.sodaplugin');command(process.execPath,[CLI,'plugin','pack',id === 'yukkuri-studio' ? STUDIO_SOURCE : resolve('../../plugins',id),'--out',bundle]);command(process.execPath,[CLI,'plugin','install',bundle,'--state-dir',appServer.stateDir]);command(process.execPath,[CLI,'plugin','enable',id,'--state-dir',appServer.stateDir]);
  }
  const client=await appServer.openClient();await client.request('prefs.set',{patch:{uiStyle:'modern'}});await client.request('extension.reload',{});
  const ws=await client.request('workspace.create',{cwd:root,label:'制作PJ'});await client.request('workspace.set_project_folder',{workspaceId:ws.workspace.id,path:root});
  const studio=await client.request('tab.create',{workspaceId:ws.workspace.id,label:'制作環境',plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});
  const second=await client.request('pane.split',{paneId:studio.pane.id,direction:'right'});
  let output='';page.on('websocket',socket=>socket.on('framereceived',({payload})=>{if(typeof payload!=='string'){const f=decodeFrame(new Uint8Array(payload));if(f.type===FRAME_TYPE.OUTPUT)output+=new TextDecoder().decode(f.chunk);}}));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  const app=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');await expect(app.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();await expect(app.getByRole('heading',{name:'作業ペイン・エージェント'})).toBeVisible();
  // Actual iframe focus and input must not dim any ancestor of the app.
  const titleInput=app.getByLabel('題',{exact:true});await titleInput.click();
  await titleInput.pressSequentially('画面を操作しても暗くならない',{delay:50});
  await expect(titleInput).toHaveValue('画面を操作しても暗くならない');
  await expect.poll(()=>page.locator('[data-plugin-view] iframe[data-display-frame]').evaluate(el=>document.activeElement===el)).toBe(true);
  const appOpacities=await page.locator('[data-plugin-view]').evaluate(el=>{const values=[];for(let node:Element|null=el;node;node=node.parentElement)values.push(getComputedStyle(node).opacity);return values;});
  expect(appOpacities.every(value=>value==='1')).toBe(true);
  const terminals=page.locator('[data-work-panes] .terminal-pane');await expect(terminals).toHaveCount(2);await expect(terminals.first()).not.toBeVisible();
  await terminals.first().evaluate(el=>{(el as HTMLElement).dataset['continuity']='original';});
  client.sendInput(studio.pane.id,'SODA_VIEW_KEEP=preserved; printf "APP_READY\\n"\r');await expect.poll(()=>output).toContain('APP_READY');
  async function add(target:'tab'|'pane'){
   if(target==='tab')await page.getByRole('button',{name:'＋作業ビュー',exact:true}).click();else await page.locator(`[data-pane-id="${second.pane.id}"]`).getByRole('button',{name:'このペインにビューを追加',exact:true}).first().click();const dlg=page.locator('.view-picker');await expect(dlg).toBeVisible();await dlg.getByLabel('ビュー',{exact:true}).selectOption({label:'コミットグラフ · commit-graph（ユーザー）'});await dlg.getByLabel('配置',{exact:true}).selectOption('right');await dlg.getByRole('button',{name:'追加',exact:true}).click();await expect(dlg).not.toBeVisible();
  }
  await add('tab');const graph=page.frameLocator('[data-pane-panel] iframe[data-display-frame]').first();await expect(graph.locator('pre')).toContainText('seed-commit');
  await page.getByRole('button',{name:'作業画面',exact:true}).click();await expect(terminals.first()).toBeVisible();await expect(terminals.first()).toHaveAttribute('data-continuity','original');await expect(graph.locator('pre')).toContainText('seed-commit');
  client.sendInput(studio.pane.id,'printf "KEPT:%s\\n" "$SODA_VIEW_KEEP"\r');await expect.poll(()=>output).toContain('KEPT:preserved');
  await add('pane');await expect(page.locator('[data-pane-panel]')).toHaveCount(2);
  await page.getByRole('button',{name:'アプリ画面',exact:true}).click();await expect(app.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();await expect(terminals.first()).toHaveAttribute('data-continuity','original');
  await page.getByRole('button',{name:'作業画面',exact:true}).click();await page.getByRole('button',{name:'コミットグラフを削除',exact:true}).first().click();await expect(page.locator('[data-pane-panel]')).toHaveCount(1);
  await appServer.restart();await page.reload();await expect(page.getByRole('button',{name:'作業画面',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-pane-panel]')).toHaveCount(1);await expect(page.frameLocator('[data-pane-panel] iframe[data-display-frame]').locator('pre')).toContainText('seed-commit');
  await page.screenshot({path:resolve('../../.aidev/works/20261011-plugin-perspectives/terminal.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.mobile-shell')).toBeVisible();await page.getByRole('button',{name:'アプリ画面',exact:true}).click();
  await expect(page.frameLocator('.mobile-app-view iframe[data-display-frame]').getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();
  const mainBox=await page.locator('.mobile-shell-pane').boundingBox(), appBox=await page.locator('.mobile-app-view').boundingBox();expect(mainBox).not.toBeNull();expect(appBox).not.toBeNull();expect(appBox!.width).toBeCloseTo(mainBox!.width,0);expect(appBox!.y).toBeCloseTo(mainBox!.y,0);expect(await page.locator('.mobile-shell-pane').evaluate(el=>getComputedStyle(el).touchAction)).toBe('auto');
  await page.screenshot({path:resolve('../../.aidev/works/20261011-plugin-perspectives/mobile.png'),fullPage:true});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('PJだけのパッケージはGit外でも承認後に利用でき、別PJには表示しない',async({page,appServer})=>{
 const root=await mkdtemp(join(tmpdir(),'soda-pj-plugin-'));const other=await mkdtemp(join(tmpdir(),'soda-pj-other-'));
 try{
  const bundle=join(root,'studio.sodaplugin');command(process.execPath,[CLI,'plugin','pack',STUDIO_SOURCE,'--out',bundle]);command(process.execPath,[CLI,'plugin','install',bundle,'--project-dir',root]);command(process.execPath,[CLI,'plugin','enable','yukkuri-studio','--project-dir',root]);
  const client=await appServer.openClient();const ws=await client.request('workspace.create',{cwd:root,label:'非Git制作'});await client.request('workspace.set_project_folder',{workspaceId:ws.workspace.id,path:root});await client.request('extension.reload',{});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.locator('.toast-sticky .toast-action').click();const approval=page.locator('dialog[data-ext-approval-dialog]');await expect(approval).toBeVisible();await expect(approval.locator('[data-ext-approval-root]')).toContainText(root);await expect(approval.locator('[data-ext-approval-approve]')).toBeEnabled();await approval.locator('[data-ext-approval-approve]').click();await expect(approval).not.toBeVisible();
  await page.getByRole('button',{name:'＋作業ビュー',exact:true}).click();const picker=page.locator('.view-picker');await expect(picker.getByLabel('ビュー',{exact:true}).locator('option')).toContainText(['ビューを選択','動画制作の進捗 · yukkuri-studio（PJ）']);await picker.getByLabel('ビュー',{exact:true}).selectOption({label:'動画制作の進捗 · yukkuri-studio（PJ）'});await picker.getByRole('button',{name:'追加',exact:true}).click();
  await expect(page.frameLocator('[data-pane-band] iframe[data-display-frame]').getByText(/0 制作/)).toBeVisible();
  const second=await client.request('workspace.create',{cwd:other,label:'別PJ'});await client.request('workspace.set_project_folder',{workspaceId:second.workspace.id,path:other});await page.locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({hasText:'別PJ'}).click();await page.getByRole('button',{name:'＋作業ビュー',exact:true}).click();await expect(picker.getByLabel('ビュー',{exact:true}).locator('option')).not.toContainText(['動画制作の進捗 · yukkuri-studio（PJ）']);
 }finally{await rm(root,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
