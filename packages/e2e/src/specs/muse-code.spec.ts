import {mkdtemp,mkdir,writeFile,chmod,rm} from 'node:fs/promises';
import {join,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {assertPaneResolvesFake} from '@sodashitsu/server';
import {expect,test} from '../support/fixtures.js';
const dir=await mkdtemp(join(tmpdir(),'soda-e2e-muse-')),bin=join(dir,'bin'),script=join(dir,'fake-muse.mjs');
await mkdir(bin);
const sessionId='11111111-1111-4111-8111-111111111171';
await writeFile(script,`
import {spawn} from 'node:child_process';
const screen=text=>process.stdout.write('\\x1b[2J\\x1b[H'+text.replaceAll('\\n','\\r\\n'));
const idle=()=>screen('Muse Code generated fixture\\n❯\\nmodel · /generated · Auto-review');
const report=()=>{const child=spawn(process.execPath,[${JSON.stringify(join(import.meta.dirname,'../../../server/assets/agent-hook-report.cjs'))},'muse'],{env:{PATH:process.env.PATH},stdio:['pipe','ignore','ignore']});child.stdin.end(JSON.stringify({session_id:${JSON.stringify(sessionId)},cwd:process.cwd(),source:'startup'}));};
process.stdin.setRawMode(true);idle();report();const timer=setInterval(report,1000);
process.stdin.on('data',d=>{const key=String(d);if(key.includes('w'))screen('◈ Thinking (0s · esc to interrupt)\\n❯\\nmodel · /generated');if(key.includes('b'))screen('Allow this stage once\\nAlways allow in this workspace');if(key.includes('i'))idle();if(key.includes('\\x04')){clearInterval(timer);process.exit(0);}});
`);
await writeFile(join(bin,'muse'),`#!/bin/bash\nexec -a muse ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,'muse'),0o755);
const originalPath=process.env.PATH;
test.beforeAll(()=>{process.env.PATH=bin+delimiter+(originalPath??'');});
test.afterAll(async()=>{if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;await rm(dir,{recursive:true,force:true});});
/** Browser-observed state + session events, no real model or credentials. */
test('Muse Code is launchable and its hook and state changes reach the browser',async({page,appServer})=>{
 test.skip(process.platform!=='linux');test.setTimeout(60000);
 const client=await appServer.openClient(),pane=client.helloSnapshot()!.panes.find(p=>!p.virtual)!;
 let sessionObserved=false,labelObserved=false;
 page.on('websocket',ws=>ws.on('framereceived',frame=>{try{const message=JSON.parse(String(frame.payload));const p=message.data?.pane;if(p?.id===pane.id&&p.agentSession?.kind==='muse'&&p.agentSession.sessionId===sessionId)sessionObserved=true;const actor=message.data?.agent;if(actor?.kind==='muse'&&actor.label==='Muse Code')labelObserved=true;}catch{}}));
 try{
  await assertPaneResolvesFake({write:input=>client.sendInput(pane.id,input),name:'muse',fakeDir:bin,scratchDir:dir});
  await page.addInitScript(()=>localStorage.setItem('soda.prefs.v1',JSON.stringify({onboarding:false,uiStyle:'modern'})));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);await expect(page.locator('.xterm-helper-textarea').first()).toBeAttached();
  await client.request('agent.start',{kind:'muse',name:'muse-test-worker',paneId:pane.id,args:[]});
  const row=page.locator(`[data-agent-pane="${pane.id}"]`),state=row.locator('.sidebar-state-icon');
  await expect(row).toBeVisible({timeout:15000});await expect(state).toHaveAttribute('data-state','idle',{timeout:15000});
  await expect.poll(()=>sessionObserved&&labelObserved).toBe(true);
  await page.locator('.xterm-screen').first().click();await expect(page.locator('.xterm-helper-textarea').first()).toBeFocused();await page.keyboard.press('w');await expect(state).toHaveAttribute('data-state','working');
  await page.keyboard.press('b');await expect(state).toHaveAttribute('data-state','blocked');
  await page.keyboard.press('i');await expect(state).toHaveAttribute('data-state','idle');
  await page.screenshot({path:test.info().outputPath('muse-code-desktop.png')});
 }finally{client.sendInput(pane.id,'\x04');client.close();}
});
