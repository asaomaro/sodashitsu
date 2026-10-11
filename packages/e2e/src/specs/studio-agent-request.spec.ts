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
test('制作UIでCodexを選び、新しい実PTYに制作指示を渡して起動する',async({page})=>{
 const root=await mkdtemp(join(tmpdir(),'soda-studio-auto-')),oldPath=process.env['PATH'];let server:Awaited<ReturnType<typeof startAppServer>>|undefined;
 try{
  const bin=join(root,'bin');await mkdir(bin);const fake=join(bin,'codex');await writeFile(fake,`#!${process.execPath}\nconsole.log('FAKE_TASK_CWD:'+process.cwd());console.log('FAKE_TASK_PROMPT:'+process.argv[2]);setInterval(()=>{},1000);\n`);await chmod(fake,0o755);process.env['PATH']=bin+':'+oldPath;
  server=await startAppServer();const cli=resolve('../cli/dist/main.js');function command(args:string[]){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});expect(r.status,r.stderr).toBe(0);}
  const bundle=join(root,'studio.sodaplugin');command(['plugin','pack',STUDIO_SOURCE,'--out',bundle]);command(['plugin','install',bundle,'--state-dir',server.stateDir]);command(['plugin','enable','yukkuri-studio','--state-dir',server.stateDir]);
  const c=await server.openClient();await c.request('extension.reload',{});const ws=await c.request('workspace.create',{cwd:root});await c.request('workspace.set_project_folder',{workspaceId:ws.workspace.id,path:root});const tab=await c.request('tab.create',{workspaceId:ws.workspace.id,plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});
  // Success is observed in the actual UI and browser-received PTY frames, not a test client's events.
  let output='';page.on('websocket',s=>s.on('framereceived',({payload})=>{if(typeof payload!=='string'){const f=decodeFrame(new Uint8Array(payload));if(f.type===FRAME_TYPE.OUTPUT)output+=new TextDecoder().decode(f.chunk);}}));
  await page.goto(`${server.origin}/#token=${server.token}`);const app=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');await expect(app.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();
  c.sendInput(tab.pane.id,'SODA_KEEP=preserved; printf "ORIGINAL_READY\\n"\r');await expect.poll(()=>output).toContain('ORIGINAL_READY');
  await app.getByLabel('題',{exact:true}).fill('自動依頼の確認');await app.getByLabel('テーマ・対象者').fill('新しい端末で開始する');await app.getByRole('button',{name:'制作を追加',exact:true}).click();
  await app.getByLabel('使うエージェント').selectOption('codex');const launch=app.getByRole('button',{name:'新しい作業ペインで依頼',exact:true});await expect(launch).toBeEnabled();await launch.click();
  await expect(app.getByRole('status').filter({hasText:'起動指示済み'})).toBeVisible();await expect(launch).toBeDisabled();await expect.poll(()=>output).toContain('FAKE_TASK_CWD:'+root);await expect.poll(()=>output).toContain('task.md');await expect.poll(()=>output).toContain('FAKE_TASK_PROMPT:制作指示ファイル');
  await page.getByRole('button',{name:'作業画面',exact:true}).click();await expect(page.locator('[data-work-panes] .terminal-pane')).toHaveCount(2);c.sendInput(tab.pane.id,'printf "KEPT:%s\\n" "$SODA_KEEP"\r');await expect.poll(()=>output).toContain('KEPT:preserved');
  await page.screenshot({path:resolve('../../.aidev/works/20261011-studio-agent-request/agent-request.png'),fullPage:true});
 }finally{await server?.close();if(oldPath===undefined)delete process.env['PATH'];else process.env['PATH']=oldPath;await rm(root,{recursive:true,force:true});}
});
