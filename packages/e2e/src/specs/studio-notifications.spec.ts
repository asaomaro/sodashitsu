import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeFrame, FRAME_TYPE } from '@sodashitsu/protocol';
import { startAppServer } from '../support/appServer.js';
import { expect,test } from '../support/fixtures.js';

const STUDIO_SOURCE = process.env['YUKKURI_STUDIO_SOURCE'] ? resolve(process.env['YUKKURI_STUDIO_SOURCE']!) : '';
test.skip(!STUDIO_SOURCE || !existsSync(join(STUDIO_SOURCE, 'soda-plugin.json')), 'Yukkuri Studioは外部PJで管理。YUKKURI_STUDIO_SOURCEでソースを指定する');
test('レビューと工程を保存して実sodactl経由で通知し、担当不在でも保存を維持する',async({page})=>{
 const root=await mkdtemp(join(tmpdir(),'soda-studio-notify-')),oldPath=process.env['PATH'];let server:Awaited<ReturnType<typeof startAppServer>>|undefined;
 try{
  const bin=join(root,'bin');await mkdir(bin);const script=join(root,'fake-agent.sh');await writeFile(script,'printf "FAKE_NOTIFY_READY\\n"\nwhile IFS= read -r line; do printf "RECEIVED:%s\\n" "$line"; done\n');
  const fake=join(bin,'claude');await writeFile(fake,`#!/bin/bash\nexec -a claude /bin/bash '${script}' "$@"\n`);await chmod(fake,0o755);process.env['PATH']=bin+':'+oldPath;
  server=await startAppServer();const cli=resolve('../cli/dist/main.js');
  // Isolated credentials for the real CLI; no real AI process or account is used.
  const wrapper=join(bin,'sodactl');await writeFile(wrapper,`#!${process.execPath}\nconst {spawnSync}=require('node:child_process');const r=spawnSync(${JSON.stringify(process.execPath)},[${JSON.stringify(cli)},...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,HOME:${JSON.stringify(join(root,'auth-home'))},SODACTL_TOKEN:${JSON.stringify(server.token)}}});process.exit(r.status??1);\n`);await chmod(wrapper,0o755);
  function command(args:string[]){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});expect(r.status,r.stderr).toBe(0);}
  const bundle=join(root,'studio.sodaplugin');command(['plugin','pack',STUDIO_SOURCE,'--out',bundle]);command(['plugin','install',bundle,'--state-dir',server.stateDir]);command(['plugin','enable','yukkuri-studio','--state-dir',server.stateDir]);
  const c=await server.openClient();await c.request('extension.reload',{});const ws=await c.request('workspace.create',{cwd:root});await c.request('workspace.set_project_folder',{workspaceId:ws.workspace.id,path:root});await c.request('tab.create',{workspaceId:ws.workspace.id,plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});
  // Observe delivery in browser-received terminal frames and save/result DOM.
  let output='';page.on('websocket',s=>s.on('framereceived',({payload})=>{if(typeof payload!=='string'){const f=decodeFrame(new Uint8Array(payload));if(f.type===FRAME_TYPE.OUTPUT)output+=new TextDecoder().decode(f.chunk);}}));
  await page.goto(`${server.origin}/#token=${server.token}`);const app=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');await expect(app.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();
  await app.getByLabel('題',{exact:true}).fill('通知の確認');await app.getByRole('button',{name:'制作を追加',exact:true}).click();await app.getByLabel('使うエージェント').selectOption('claude');await app.getByRole('button',{name:'新しい作業ペインで依頼',exact:true}).click();
  await expect(app.getByRole('status').filter({hasText:'起動指示済み'})).toBeVisible();await expect.poll(()=>output).toContain('FAKE_NOTIFY_READY');
  await expect(app.getByRole('region',{name:'この制作環境の作業ペイン'})).toContainText('claude',{timeout:15000});
  await app.locator('select[name^="review-status-"]').selectOption('changes');await app.locator('textarea[name^="review-note-"]').fill('字幕を大きくしてください');await app.getByRole('button',{name:'レビューを記録',exact:true}).click();
  await expect(app.getByRole('status').filter({hasText:'エージェントへの通知: 送信済み'})).toBeVisible();await expect.poll(()=>output).toContain('字幕を大きくしてください');await expect.poll(()=>output).toContain('RECEIVED:Yukkuri Studio');
  await app.getByText('工程を更新',{exact:true}).click();await app.locator('select[name^="stage-kind-"]').selectOption('script');await app.locator('select[name^="stage-status-"]').selectOption('review');await app.locator('textarea[name^="stage-note-"]').fill('台本を確認してください');await app.getByRole('button',{name:'更新する',exact:true}).click();await expect.poll(()=>output).toContain('台本を確認してください');await expect(app.getByRole('status').filter({hasText:'エージェントへの通知: 送信済み'})).toBeVisible();
  // Closing the assigned pane is setup only. Save and failure are checked in UI.
  const observer=await server.openClient();const snap=observer.helloSnapshot()!;const assigned=snap.panes.find(p=>p.agent?.name?.startsWith('task-'));expect(assigned).toBeTruthy();await c.request('pane.close',{paneId:assigned!.id});
  await app.locator('select[name^="review-status-"]').selectOption('approved');await app.locator('textarea[name^="review-note-"]').fill('確認完了');await app.getByRole('button',{name:'レビューを記録',exact:true}).click();await expect(app.getByRole('status').filter({hasText:'エージェントへの通知: 送信失敗'})).toBeVisible();await expect(app.getByText('結果: approved 確認完了',{exact:true})).toBeVisible();await expect(app.getByRole('button',{name:'受信状況を確認したので再通知',exact:true})).toBeVisible();
 }finally{await server?.close();if(oldPath===undefined)delete process.env['PATH'];else process.env['PATH']=oldPath;await rm(root,{recursive:true,force:true});}
});
