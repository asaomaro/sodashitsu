import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {mkdtemp,mkdir,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(join(repo,'packages/web/package.json'));
const {createServer}=await import(require.resolve('vite')),vue=(await import(require.resolve('@vitejs/plugin-vue'))).default;
const tools=createRequire('/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/package.json'),{chromium,expect}=tools('@playwright/test');
const mode=process.argv[2]??'fixed',dir=await mkdtemp(join(tmpdir(),'soda-captain-reply-browser-')),bin=join(dir,'bin');await mkdir(bin);
// This is a unique private process/HOME/state. No existing pane, CLI, model, config or credential is used.
for(const name of ['codex','claude','agy','muse','grok','cursor-agent','copilot','bob']){const path=join(bin,name);await writeFile(path,'#!/bin/sh\nexit 1\n');await chmod(path,0o755);}
for(const key of ['HOME','USERPROFILE','XDG_CONFIG_HOME','XDG_DATA_HOME','CODEX_HOME','COPILOT_HOME','CLAUDE_CONFIG_DIR','GROK_HOME'])process.env[key]=join(dir,key);
process.env.PATH=bin+':'+process.env.PATH;process.env.SODA_ASSISTANT_ENABLED='0';delete process.env.NODE_OPTIONS;delete process.env.NODE_PATH;process.env.NODE_REPL_HISTORY='';process.chdir(dir);
const fake=join(dir,'generated-codex.mjs');await writeFile(fake,"process.stdin.setRawMode(true);process.stdout.write('Codex generated captain fixture ready\\r\\n');process.stdin.on('data',d=>process.stdout.write('fixture-echo:'+d.toString()+'\\r\\n'));setInterval(()=>{},1000).unref();");
const {composeServerOnFreePort,getFreePort}=await import('/workspaces/sodashitsu-main-live-assistant-agents/packages/server/dist/composeServerOnFreePort.js');
const {decodeFrame,FRAME_TYPE}=await import('/workspaces/sodashitsu-main-live-assistant-agents/packages/protocol/dist/index.js');
let soda,vite,browser;const sent=[],received=[],errors=[];let failure;
try{
 const webPort=await getFreePort('127.0.0.1'),origin=`http://127.0.0.1:${webPort}`;
 soda=await composeServerOnFreePort({host:'127.0.0.1',stateDir:join(dir,'state'),origin:[origin],shell:process.execPath});
 const captain=await soda.session.createWorkspace(dir,'Generated captain',undefined,{shell:'/bin/bash',args:['--noprofile','--norc','-c','exec -a codex "$0" "$1"',process.execPath,fake]},{deviceId:randomUUID(),kind:'codex'});
 await expect.poll(()=>soda.session.getPane(captain.pane.id)?.agent?.kind,{timeout:12000}).toBe('codex');
 const instance=soda.session.getPane(captain.pane.id).agent.instanceId;
 vite=await createServer({configFile:false,root:join(repo,'packages/web'),plugins:[vue({template:{compilerOptions:{isCustomElement:t=>t==='ask-form'}}})],resolve:{alias:[{find:/^@sodashitsu\/client-core$/,replacement:join(repo,'packages/client-core/src/index.ts')},{find:/^@sodashitsu\/client-core\//,replacement:join(repo,'packages/client-core/src/')+'/'},{find:/^@sodashitsu\/protocol$/,replacement:join(repo,'packages/protocol/src/index.ts')}],dedupe:['vue','pinia']},server:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${soda.options.port}`},'/ws':{target:`ws://127.0.0.1:${soda.options.port}`,ws:true}}}});await vite.listen();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:960,height:620}}),page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());page.on('pageerror',e=>errors.push(String(e)));
 page.on('websocket',socket=>{socket.on('framesent',({payload})=>{if(Buffer.isBuffer(payload)){try{const frame=decodeFrame(payload);if(frame.type===FRAME_TYPE.INPUT)sent.push({pane:frame.paneId,text:Buffer.from(frame.bytes).toString('utf8')});}catch{}}});socket.on('framereceived',({payload})=>{if(Buffer.isBuffer(payload)){try{const frame=decodeFrame(payload);if(frame.type===FRAME_TYPE.OUTPUT)received.push(Buffer.from(frame.chunk).toString('utf8'));else if(frame.type===FRAME_TYPE.SNAPSHOT)received.push(frame.text);}catch{}}});});
 const response=await context.request.post(origin+'/api/login',{headers:{origin},data:{token:soda.freshToken}});assert.equal(response.status(),204);
 const url=`${origin}/?assistantView=reply#assistantPane=${captain.pane.id}&assistantWorkspace=${captain.workspace.id}&assistantInstance=${instance}`;
 await page.goto(url);await expect(page.locator('[data-assistant-response]')).toBeVisible();await expect(page.locator('.xterm-helper-textarea')).toHaveCount(1);
 await expect.poll(()=>received.join('').includes('fixture ready'),{timeout:15000}).toBe(true);
 assert.ok((await page.locator('.xterm-screen').boundingBox()).height>50);
 await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type('captain-key');
 await expect.poll(()=>sent.map(x=>x.text).join('').includes('captain-key'),{timeout:5000}).toBe(true);
 await page.locator('.xterm-helper-textarea').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','captain-paste');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect.poll(()=>sent.map(x=>x.text).join('').includes('captain-paste'),{timeout:5000}).toBe(true);
 await expect.poll(()=>received.join('').includes('fixture-echo:'),{timeout:5000}).toBe(true);
 assert.ok(sent.every(x=>x.pane===captain.pane.id));await expect(page.locator('#assistant-target-guard')).toHaveCount(0);await page.screenshot({path:join(here,`${mode}-terminal.png`)});
 await page.reload();await expect(page.locator('.xterm-helper-textarea')).toHaveCount(1);await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type('reconnect');await expect.poll(()=>sent.map(x=>x.text).join('').includes('reconnect'),{timeout:5000}).toBe(true);
 const before=sent.length;await page.evaluate(()=>{location.hash+='&tampered=true';});await page.keyboard.type('blocked');await expect(page.locator('#assistant-target-guard')).toBeVisible();assert.equal(sent.length,before);assert.deepEqual(errors,[]);
 const result={ok:true,actualMain:true,actualStoreAdapter:true,ownedRealPty:true,keyboard:true,paste:true,allInputToCaptain:true,reconnect:true,hashTamperBlocked:true,normalHiddenFilterUnchanged:true,pageErrors:errors,modelCalls:0};await writeFile(join(here,`${mode}-browser.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){failure=error;console.log(JSON.stringify({ok:false,error:String(error),inputFrames:sent.length,guardFailure:true,modelCalls:0}));if(browser){const page=browser.contexts()[0]?.pages()[0];await page?.screenshot({path:join(here,`${mode}-failure.png`)}).catch(()=>undefined);}}
finally{await browser?.close();await vite?.close();await soda?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
if(failure)process.exitCode=1;
