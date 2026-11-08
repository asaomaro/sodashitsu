import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(join(repo,'packages/web/package.json'));
const {createServer}=await import(require.resolve('vite')),vue=(await import(require.resolve('@vitejs/plugin-vue'))).default;
const {chromium,expect}=createRequire(join(repo,'packages/desktop-assistant/package.json'))('@playwright/test');
const data=JSON.parse(await readFile(join(here,'public-fixture.json'),'utf8'));assert.equal(data.kind,'grok');
const html=`<!doctype html><html><body><div id="app"></div><script type="module">
import{createApp,h}from'vue';import{uiTokens}from'@sodashitsu/client-core';import SubagentList from'/src/components/SubagentList.vue';import'/src/styles/uiStyle.css';import'/src/styles/assistantTheme.css';
const data=${JSON.stringify(data).replace(/</g,'\\u003c')};window.fixtureTheme=name=>{for(const[k,v]of Object.entries(uiTokens(name).vars))document.documentElement.style.setProperty(k,v);document.body.style.background='var(--soda-bg)';document.body.style.color='var(--soda-fg)'};
window.fixtureTheme('dracula');createApp({render:()=>h('main',{style:'padding:24px;max-width:700px;font:16px sans-serif'},[h('h2','Generated Grok public snapshot'),h(SubagentList,{subagents:data.subagents,readable:true})])}).mount('#app');
</script></body></html>`;
const fixture={name:'owned-grok-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/__grok_native_fixture.html')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__grok_native_fixture.html',html));}else next();});}};
const server=await createServer({configFile:false,root:join(repo,'packages/web'),plugins:[fixture,vue()],server:{host:'127.0.0.1',port:0}});
let browser;try{
 await server.listen();const port=server.httpServer.address().port;browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:850,height:440}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'?r.continue():r.abort();});
 await page.goto(`http://127.0.0.1:${port}/__grok_native_fixture.html`);await expect(page.locator('.subagent-list-type')).toHaveText('grok-observed-child high');await expect(page.locator('.subagent-list')).toContainText('状態不明');await expect(page.locator('.subagent-list')).not.toContainText('開始時');await expect(page.locator('.subagent-list-transcript')).toHaveCount(0);
 for(const theme of ['dracula','one-light']){await page.evaluate(t=>window.fixtureTheme(t),theme);await expect(page.locator('.subagent-list-type')).toBeVisible();await page.screenshot({path:join(here,`browser-${theme}.png`)});}
 assert.deepEqual(errors,[]);const result={actualPublicSnapshot:true,realSubagentList:true,model:'grok-observed-child',effort:'high',unknownNotCompletion:true,noUnsupportedTranscriptButton:true,themes:['dracula','one-light'],pageErrors:errors};await writeFile(join(here,'browser.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await server.close();}
