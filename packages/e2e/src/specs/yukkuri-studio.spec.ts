import { existsSync } from 'node:fs';
import { decodeFrame, FRAME_TYPE } from '@sodashitsu/protocol';
import { focusTerminal, typeLine } from '../support/keys.js';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '../support/fixtures.js';
const STUDIO_SOURCE = process.env['YUKKURI_STUDIO_SOURCE'] ? resolve(process.env['YUKKURI_STUDIO_SOURCE']!) : '';
test.skip(!STUDIO_SOURCE || !existsSync(join(STUDIO_SOURCE, 'soda-plugin.json')), 'Yukkuri Studioは外部PJで管理。YUKKURI_STUDIO_SOURCEでソースを指定する');
const CLI=resolve('../cli/dist/main.js');
const SOURCE=STUDIO_SOURCE;
const dirs:string[]=[];
test.afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
function node(args:string[]){const r=spawnSync(process.execPath,args,{encoding:'utf8'});expect(r.status,r.stderr).toBe(0);return JSON.parse(r.stdout.trim());}
test('配布物を導入し、制作一覧・工程・進捗の帯・浮いた動画レビューを操作できる',async({page,appServer})=>{
 const root=await mkdtemp(join(tmpdir(),'soda-studio-e2e-'));dirs.push(root);
 const bundle=join(root,'studio.sodaplugin');node([CLI,'plugin','pack',SOURCE,'--out',bundle]);
 const installed=node([CLI,'plugin','install',bundle,'--state-dir',appServer.stateDir]);expect(installed.enabled).toBe(false);
 const studio=join(installed.path,'studio.mjs');node([studio,'init','--workspace',root]);
 const project=node([studio,'create','--workspace',root,'--title','空はなぜ青いのか','--theme','初めて見る人へ']);
 const movie=`<!doctype html><html><body><h1 id="sample">動画の確認</h1><button id="play" onclick="document.getElementById('sample').textContent='再生しました'">再生</button></body></html><!--${'x'.repeat(1200000)}-->`;
 await writeFile(join(root,project.workDir,'video.html'),movie);
 node([CLI,'plugin','enable','yukkuri-studio','--state-dir',appServer.stateDir]);
 const client=await appServer.openClient();const workspace=await client.request('workspace.create',{cwd:process.cwd(),label:'動画制作'});await client.request('prefs.set',{patch:{uiStyle:'modern',displayScriptEnabled:true}});await client.request('extension.reload',{});
 await page.goto(`${appServer.origin}/#token=${appServer.token}`);
 const row=page.locator('.sidebar-spaces .sidebar-row').filter({hasText:'動画制作'});
 await row.click({button:'right'});await page.getByRole('menuitem',{name:'PJフォルダを設定…',exact:true}).click();
 await page.getByRole('textbox',{name:'PJフォルダを設定',exact:true}).fill(root);await page.locator('.name-dialog').getByRole('button',{name:'OK',exact:true}).click();
 await expect(page.locator('.name-dialog')).not.toBeVisible();
 await page.locator('.tab-bar-new').click();await page.getByLabel('タブの種類',{exact:true}).selectOption('user:yukkuri-studio');await page.locator('.name-dialog').getByRole('button',{name:'OK',exact:true}).click();
 await expect(page.locator('[data-plugin-view]')).toBeVisible();await expect(page.locator('.app-panes .terminal-pane:visible')).toHaveCount(0);
 const studioFrame=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');
 await expect(studioFrame.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();
 await studioFrame.getByRole('button',{name:'制作を開く'}).click();
 await expect(studioFrame.getByRole('heading',{name:'空はなぜ青いのか'})).toBeVisible();
 await studioFrame.getByText('工程を更新',{exact:true}).click();
 await studioFrame.locator('form[data-soda-action="stage"] select').nth(0).selectOption('script');await studioFrame.locator('form[data-soda-action="stage"] select').nth(1).selectOption('working');await studioFrame.locator('form[data-soda-action="stage"] textarea').fill('台本を作成中');await studioFrame.getByRole('button',{name:'更新する',exact:true}).click();
 await expect(studioFrame.getByText('台本を作成中',{exact:true})).toBeVisible();
 await expect(studioFrame.locator('form[data-soda-action="review"] textarea')).toHaveValue('');
 await expect(page.frameLocator('[data-pane-band] iframe').locator('body')).toContainText('台本: 作業中');
 await studioFrame.getByRole('button',{name:'video.html',exact:true}).click();
 await page.getByRole('button',{name:'表示を開く（yukkuri-preview）',exact:true}).click();
 const preview=page.frameLocator('[data-display-float] iframe[data-display-script]');
 await expect(preview.locator('#loading')).toContainText('転送');
 await page.locator('[data-pane-band-close]').click();
 await expect(preview.locator('#loading')).toContainText('再生・字幕・音声・クレジット',{timeout:15000});
 const movieFrame=preview.frameLocator('#movie');await expect(movieFrame.locator('#sample')).toHaveText('動画の確認');
 // 不透明originと inherited CSP をブラウザで観測する。別文書でも親のDOM/ネットワークへは出ない。
 expect(await movieFrame.locator('body').evaluate(()=>{try{return parent.document.body.textContent;}catch{return 'isolated';}})).toBe('isolated');
 expect(await movieFrame.locator('body').evaluate(async (_el, origin)=>{try{await fetch(origin+'/healthz');return true;}catch{return false;}},appServer.origin)).toBe(false);
 await page.waitForTimeout(800); // 出た・動いた直後の500msは操作開始を受けない（engageGuard）。
 await page.locator('[data-display-float] [data-display-engage]').click();
 await expect(page.locator('[data-display-float]')).toHaveAttribute('data-display-engaged','1');
 await movieFrame.locator('#play').click();
 await expect(movieFrame.locator('#sample')).toHaveText('再生しました');
 await page.screenshot({path:'/tmp/yukkuri-studio-preview.png',fullPage:true});
 const saved=JSON.parse(await readFile(join(root,'.yukkuri-studio/library.json'),'utf8'));expect(saved.projects[0].stages.script.status).toBe('working');
 await page.locator(`[data-tab-id="${workspace.tab.id}"]`).click();await expect(page.locator('[data-plugin-view]')).toHaveCount(0);await expect(page.locator('.app-panes canvas').first()).toBeVisible();
 client.close();
});


test('未初期化の2つのPJを分離し、新しい端末は設定したPJフォルダで起動する',async({page,appServer})=>{
 const parent=await mkdtemp(join(tmpdir(),'soda-studio-projects-'));dirs.push(parent);
 const {mkdir}=await import('node:fs/promises');const a=join(parent,'a'),b=join(parent,'b');await mkdir(a);await mkdir(b);await mkdir(join(a,'existing'));await writeFile(join(a,'existing','original.txt'),'EXISTING_SCRIPT_KEEP');
 const bundle=join(parent,'studio.sodaplugin');node([CLI,'plugin','pack',SOURCE,'--out',bundle]);node([CLI,'plugin','install',bundle,'--state-dir',appServer.stateDir]);node([CLI,'plugin','enable','yukkuri-studio','--state-dir',appServer.stateDir]);
 const client=await appServer.openClient();await client.request('prefs.set',{patch:{uiStyle:'modern'}});await client.request('extension.reload',{});
 const wa=await client.request('workspace.create',{cwd:process.cwd(),label:'PJ-A'}),wb=await client.request('workspace.create',{cwd:process.cwd(),label:'PJ-B'});
 await client.request('workspace.set_project_folder',{workspaceId:wa.workspace.id,path:a});await client.request('workspace.set_project_folder',{workspaceId:wb.workspace.id,path:b});
 await client.request('tab.create',{workspaceId:wa.workspace.id,label:'Studio A',plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});
 await client.request('tab.create',{workspaceId:wb.workspace.id,label:'Studio B',plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});
 let output='';page.on('websocket',socket=>socket.on('framereceived',({payload})=>{if(typeof payload!=='string'){const frame=decodeFrame(new Uint8Array(payload));if(frame.type===FRAME_TYPE.OUTPUT)output+=new TextDecoder().decode(frame.chunk);}}));
 await page.goto(`${appServer.origin}/#token=${appServer.token}`);
 const frame=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');
 const create=async(title:string)=>{await expect(frame.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();await frame.getByLabel('題',{exact:true}).fill(title);await frame.getByRole('button',{name:'制作を追加',exact:true}).click();await expect(frame.getByRole('heading',{name:title,exact:true})).toBeVisible();};
 await page.locator('.sidebar-spaces .sidebar-row').filter({hasText:'PJ-A'}).click();await expect(frame.getByRole('heading',{name:'Yukkuri Studio'})).toBeVisible();const createForm=frame.locator('form[data-soda-action="create"]');await createForm.locator('input[name=workDir]').fill('existing');await createForm.locator('input[name=artifactPrefix]').fill('original');await create('Aだけの動画');await expect(frame.getByRole('button',{name:'original.txt',exact:true})).toBeVisible();await expect(frame.getByText('制作フォルダ: existing',{exact:true})).toBeVisible();await frame.getByRole('button',{name:'original.txt',exact:true}).click();await page.getByRole('button',{name:'表示を開く（yukkuri-preview）',exact:true}).click();await expect(page.frameLocator('[data-display-float] iframe[data-display-frame]').locator('pre')).toContainText('EXISTING_SCRIPT_KEEP');
 await page.locator('.sidebar-spaces .sidebar-row').filter({hasText:'PJ-B'}).click();await create('Bだけの動画');await expect(frame.locator('body')).not.toContainText('Aだけの動画');
 await page.locator('.sidebar-spaces .sidebar-row').filter({hasText:'PJ-A'}).click();await expect(frame.getByRole('heading',{name:'Aだけの動画',exact:true})).toBeVisible();await expect(frame.locator('body')).not.toContainText('Bだけの動画');
 await page.locator('.tab-bar-new').click();await expect(page.getByLabel('タブの種類',{exact:true})).toHaveValue('');await page.locator('.name-dialog').getByRole('button',{name:'OK',exact:true}).click();
 await expect(page.locator('[data-plugin-view]')).toHaveCount(0);await expect(page.locator('.app-panes canvas').first()).toBeVisible();
 await focusTerminal(page);output='';await typeLine(page,"printf 'SODA_PROJECT_CWD=%s\\n' \"$PWD\"");await expect.poll(()=>output).toContain('SODA_PROJECT_CWD='+a);
 expect(JSON.parse(await readFile(join(a,'.yukkuri-studio/library.json'),'utf8')).projects[0].title).toBe('Aだけの動画');expect(JSON.parse(await readFile(join(b,'.yukkuri-studio/library.json'),'utf8')).projects[0].title).toBe('Bだけの動画');
 client.close();
});

test('既存制作物をUIから取り込み、既存の進捗とファイルを保持し二重登録しない',async({page,appServer})=>{
 const root=await mkdtemp(join(tmpdir(),'soda-studio-import-'));dirs.push(root);const {mkdir}=await import('node:fs/promises');
 for(const slug of ['old','new']){await mkdir(join(root,'videos','kaisetsu',slug),{recursive:true});await writeFile(join(root,'videos','kaisetsu',slug,slug+'.txt'),'---\ntitle: '+slug+'の制作\n---\nEXISTING_SCRIPT');}
 node([join(SOURCE,'studio.mjs'),'init','--workspace',root]);const old=node([join(SOURCE,'studio.mjs'),'create','--workspace',root,'--title','登録済み','--folder','videos/kaisetsu/old','--prefix','old']);node([join(SOURCE,'studio.mjs'),'stage','--workspace',root,'--project',old.id,'--stage','script','--status','done','--note','確認済み']);
 const bundle=join(root,'studio.sodaplugin');node([CLI,'plugin','pack',SOURCE,'--out',bundle]);node([CLI,'plugin','install',bundle,'--state-dir',appServer.stateDir]);node([CLI,'plugin','enable','yukkuri-studio','--state-dir',appServer.stateDir]);
 const client=await appServer.openClient();await client.request('extension.reload',{});const ws=await client.request('workspace.create',{cwd:root});await client.request('workspace.set_project_folder',{workspaceId:ws.workspace.id,path:root});await client.request('tab.create',{workspaceId:ws.workspace.id,plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});await page.goto(`${appServer.origin}/#token=${appServer.token}`);
 const app=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');await expect(app.getByText('登録済み',{exact:true})).toBeVisible();await app.getByRole('button',{name:'既存の制作物を取り込む',exact:true}).click();await expect(app.getByRole('status').filter({hasText:'1件を追加しました'})).toBeVisible();await expect(app.getByText('newの制作',{exact:true})).toBeVisible();await expect(app.getByText('1/9 工程完了',{exact:true})).toBeVisible();await expect(app.getByText('0/9 工程完了',{exact:true})).toBeVisible();
 await app.getByRole('button',{name:'既存の制作物を取り込む',exact:true}).click();await expect(app.getByRole('status').filter({hasText:'0件を追加しました'})).toBeVisible();await expect(app.getByRole('button',{name:'制作を開く',exact:true})).toHaveCount(2);expect(await readFile(join(root,'videos/kaisetsu/new/new.txt'),'utf8')).toContain('EXISTING_SCRIPT');client.close();
});

test('制作一覧を検索・絞り込み・ページ送りし、詳細から戻っても条件を維持する',async({page,appServer})=>{
 const root=await mkdtemp(join(tmpdir(),'soda-studio-search-'));dirs.push(root);const {mkdir}=await import('node:fs/promises');
 for(let i=0;i<30;i++){const slug='v'+i;await mkdir(join(root,'videos','kaisetsu',slug),{recursive:true});await writeFile(join(root,'videos','kaisetsu',slug,slug+'.txt'),'title: ChatGPT 動画'+i+'\nscript');}
 node([join(SOURCE,'studio.mjs'),'init','--workspace',root]);node([join(SOURCE,'studio.mjs'),'import','--workspace',root]);
 const bundle=join(root,'studio.sodaplugin');node([CLI,'plugin','pack',SOURCE,'--out',bundle]);node([CLI,'plugin','install',bundle,'--state-dir',appServer.stateDir]);node([CLI,'plugin','enable','yukkuri-studio','--state-dir',appServer.stateDir]);const c=await appServer.openClient();await c.request('extension.reload',{});const ws=await c.request('workspace.create',{cwd:root});await c.request('workspace.set_project_folder',{workspaceId:ws.workspace.id,path:root});await c.request('tab.create',{workspaceId:ws.workspace.id,plugin:{extensionKey:'user:yukkuri-studio',display:'yukkuri-studio'}});await page.goto(`${appServer.origin}/#token=${appServer.token}`);
 const app=page.frameLocator('[data-plugin-view] iframe[data-display-frame]');await expect(app.locator('[data-search-count]')).toHaveText('30 / 30 件 · 1 / 2 ページ');await expect(app.getByRole('button',{name:'制作を開く',exact:true})).toHaveCount(25);await app.getByRole('button',{name:'次のページ',exact:true}).click();await expect(app.locator('[data-search-count]')).toHaveText('30 / 30 件 · 2 / 2 ページ');await expect(app.getByRole('button',{name:'制作を開く',exact:true})).toHaveCount(5);
 // Native popup pixels depend on the OS; inspect the actual option paint colors in the browser.
 for(const theme of ['dracula','catppuccin-latte'] as const) {
  await c.request('prefs.set',{patch:{theme,themeAuto:false}});
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect.poll(()=>app.locator('select option').evaluateAll(options=>options.every(option=>{
   const style=getComputedStyle(option);
   const rgba=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
   const fg=rgba(style.color),bg=rgba(style.backgroundColor);
   if((bg[3]??1)!==1)return false;
   const lum=(rgb:number[])=>rgb.slice(0,3).map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
   const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
  }))).toBe(true);
  const series=app.getByLabel('シリーズ',{exact:true});await series.focus();await series.press('ArrowDown');await series.press('Enter');await expect(series).toHaveValue('kaisetsu');await series.selectOption('');
 }
 await c.request('prefs.set',{patch:{theme:'dracula'}});
 const search=app.getByRole('search');await search.getByLabel('キーワード').fill('ＣＨＡＴＧＰＴ　v29');await search.getByLabel('シリーズ',{exact:true}).selectOption('kaisetsu');await search.getByLabel('制作状態',{exact:true}).selectOption('pending');await search.getByLabel('並び順',{exact:true}).selectOption('title');await search.getByRole('button',{name:'検索する',exact:true}).click();await expect(app.locator('[data-search-count]')).toHaveText('1 / 30 件 · 1 / 1 ページ');await app.getByRole('button',{name:'制作を開く',exact:true}).click();await expect(app.getByRole('heading',{name:'ChatGPT 動画29',exact:true})).toBeVisible();await app.getByRole('button',{name:'← 制作一覧',exact:true}).click();await expect(search.getByLabel('キーワード')).toHaveValue('ＣＨＡＴＧＰＴ　v29');await expect(search.getByLabel('並び順',{exact:true})).toHaveValue('title');await expect(app.locator('[data-search-count]')).toHaveText('1 / 30 件 · 1 / 1 ページ');
 const state=node([join(SOURCE,'studio.mjs'),'list','--workspace',root]);const project=state.projects.find((p:{workDir:string})=>p.workDir.endsWith('/v29'));node([join(SOURCE,'studio.mjs'),'stage','--workspace',root,'--project',project.id,'--stage','script','--status','working']);await expect(app.locator('[data-search-count]')).toHaveText('0 / 30 件 · 1 / 1 ページ');await expect(search.getByLabel('キーワード')).toHaveValue('ＣＨＡＴＧＰＴ　v29');await expect(app.getByText('条件に一致する制作がありません。キーワードや絞り込み条件を変更してください。',{exact:true})).toBeVisible();await search.getByRole('button',{name:'条件をクリア',exact:true}).click();await expect(app.locator('[data-search-count]')).toHaveText('30 / 30 件 · 1 / 2 ページ');await expect(search.getByLabel('キーワード')).toHaveValue('');c.close();
});
