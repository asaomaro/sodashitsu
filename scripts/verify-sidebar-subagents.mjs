// Generated browser-only fixture: actual Sidebar.vue + theme CSS; no server/agent/user state.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
const webRequire=createRequire(new URL('../packages/web/package.json',import.meta.url));
const browserRequire=createRequire(new URL('../packages/desktop-assistant/package.json',import.meta.url));
const {createServer}=await import(webRequire.resolve('vite'));
const {chromium,expect}=browserRequire('@playwright/test');
const html=`<!doctype html><html data-ui-style="modern"><head><style>.sidebar{width:340px!important;height:740px!important}</style></head><body style="margin:0;font:16px sans-serif"><div id="app"></div><script type="module">
import {createApp,h} from 'vue';
import {createPinia} from 'pinia';
import Sidebar from '/src/components/Sidebar.vue';
import SubagentList from '/src/components/SubagentList.vue';
import PaneStatusline from '/src/components/PaneStatusline.vue';
import GraphNode from '/src/components/graph/GraphNode.vue';
import GraphSubagentLayer from '/src/components/graph/GraphSubagentLayer.vue';
import {ActionDispatcherKey,ConnectionKey} from '/src/injection.ts';
import {useSessionStore} from '/src/store/session.ts';
import {useViewStore} from '/src/store/view.ts';
import {useSettingsStore} from '/src/store/settings.ts';
import {uiTokens} from '@sodashitsu/client-core';
import '/src/styles/uiStyle.css';import '/src/styles/buttonTheme.css';
const pinia=createPinia(),session=useSessionStore(pinia),settings=useSettingsStore(pinia);settings.uiStyle='modern';settings.statuslineSettings={enabled:true,fields:{subagents:true}};
const agent={instanceId:'fixture-main',kind:'claude',label:'親エージェント',state:'working',completionSeq:0,serverSeenSeq:0,verified:true,since:0};
const pane={id:'fixture-pane',tabId:'fixture-tab',label:null,cwd:'/',shell:'sh',cols:80,rows:24,status:'running',failure:null,busy:false,title:'',rightClick:'herdr',agent,agentSession:null};
session.workspaceUpserted({id:'fixture-workspace',label:'生成されたプロジェクト',cwd:'/',tabIds:['fixture-tab'],activeTabId:'fixture-tab',groupId:null,git:null,autoLabel:false});
session.tabUpserted({id:'fixture-tab',workspaceId:'fixture-workspace',label:'fixture',layout:{type:'pane',paneId:pane.id},focusedPaneId:pane.id,zoomedPaneId:null,sizeOwnerClientId:null});
window.updateChildren=(count,opts={})=>session.paneUpserted({...pane,agent:{...agent,kind:opts.kind||'claude',subagents:{count,...(opts.basis?{countBasis:opts.basis}:{}),items:Array.from({length:Math.min(count,64)},(_,i)=>({id:'child-'+i,type:'調査担当'+i,description:'生成された作業 '+i,startedAt:Date.now(),...(opts.state?{state:opts.state}:{})}))}}});
window.applyTheme=name=>{const t=uiTokens(name);for(const [k,v] of Object.entries(t.vars))document.documentElement.style.setProperty(k,v);document.documentElement.style.colorScheme=t.colorScheme;document.body.style.background='var(--soda-bg)';document.body.style.color='var(--soda-fg)';};
window.applyTheme('sodashitsu-assistant-dark');window.updateChildren(3);
const Root={setup(){return()=>{const a=session.panes.get(pane.id).agent,info={key:'local:'+pane.id,paneId:pane.id,name:'親エージェント',exists:true,local:true,label:null,machine:'local',machineLabel:'local',cwd:'/',state:'working',agent:a};return h('div',{style:'display:flex;gap:24px'},[h(Sidebar),h('section',{style:'width:520px'},[h('div',{id:'fixture-list'},h(SubagentList,{subagents:a.subagents})),h('div',{id:'fixture-footer',style:'height:110px;width:500px;position:relative'},[h('div',{class:'pane-frame-main',style:'height:80px'}),h(PaneStatusline,{paneId:pane.id})]),h('div',{id:'fixture-graph',style:'height:260px;position:relative'},[h(GraphNode,{info,x:0,y:0,selected:false,tabbable:false,outCount:0,inCount:0}),h(GraphSubagentLayer,{nodes:[{key:info.key,x:0,y:0}],infos:new Map([[info.key,info]])})])])]);}}};
const app=createApp(Root).use(pinia);app.provide(ActionDispatcherKey,{openContextMenu(){}});app.provide(ConnectionKey,{request:async()=>({}),sendInput(){}});app.mount('#app');window.fixtureReady=true;
</script></body></html>`;
const server=await createServer({root:fileURLToPath(new URL('../packages/web',import.meta.url)),server:{host:'127.0.0.1',port:0},plugins:[{name:'generated-subagent-fixture',configureServer(s){s.middlewares.use('/__subagents.html',async(_req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__subagents.html',html));}catch(e){next(e);}});}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.SODA_E2E_CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:900,height:800}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 page.setDefaultTimeout(8000);
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__subagents.html`);await page.waitForFunction(()=>window.fixtureReady);
 const toggle=page.locator('.sidebar-subagent-btn');await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(toggle.locator('.sidebar-subagent-count')).toHaveText('3');
 await toggle.focus();await page.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(page.locator('.sidebar-subagent-row')).toHaveCount(3);await expect(page.locator('.sidebar-subagent-count')).toHaveCount(0);
 await expect(page.locator('.sidebar-subagent-row').first()).toContainText('実行中');await expect(page.locator('.sidebar-subagent-row').first()).toContainText('調査担当0');
 for(const theme of ['dracula','one-light','sodashitsu-assistant-dark','sodashitsu-assistant']){
  await page.evaluate(t=>window.applyTheme(t),theme);
  const metrics=await page.locator('.sidebar-subagent-row').first().evaluate(el=>{const c=getComputedStyle(el),p=getComputedStyle(el.closest('.sidebar'));return{radius:c.borderRadius,color:c.color,sidebarColor:p.color,width:el.getBoundingClientRect().width};});
  assert.notEqual(metrics.radius,'0px');assert.equal(metrics.color,metrics.sidebarColor);assert(metrics.width>100);
 }
 await page.evaluate(()=>window.updateChildren(70));await expect(page.locator('.sidebar-subagent-row')).toHaveCount(64);await expect(page.locator('.sidebar-subagent-more')).toHaveText('ほか 6 件');
 await page.evaluate(()=>window.updateChildren(2));await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(page.locator('.sidebar-subagent-row')).toHaveCount(2);
 await page.evaluate(()=>window.updateChildren(2,{kind:'agy',basis:'alive',state:'unknown'}));
 await expect(toggle).toHaveAttribute('aria-label',/所属 2 件/);
 await expect(page.locator('.sidebar-subagent-status').first()).toHaveText('状態不明');
 await expect(page.locator('#fixture-list .subagent-list-state').first()).toHaveText('状態不明');
 await expect(page.locator('#fixture-list')).toContainText('所属 2 件');
 await expect(page.locator('#fixture-footer .pane-statusline')).toBeVisible();
 await expect(page.locator('#fixture-footer')).toContainText('Subagents 所属 2');
 await expect(page.locator('#fixture-footer .statusline-text [title]')).toHaveAttribute('title',/作業中の件数ではありません/);
 await expect(page.locator('#fixture-graph [data-subagents-button]')).toHaveAttribute('aria-label',/所属 2 件/);
 await expect(page.locator('#fixture-graph [data-subagent-id="child-0"]')).toContainText('状態不明');
 for(const theme of ['dracula','one-light','sodashitsu-assistant-dark','sodashitsu-assistant']){
  await page.evaluate(t=>window.applyTheme(t),theme);
  await expect(page.locator('.sidebar-subagent-status').first()).toHaveText('状態不明');
  await expect(page.locator('#fixture-list .subagent-list-state').first()).toHaveText('状態不明');
  await expect(page.locator('#fixture-graph [data-subagent-id="child-0"]')).toContainText('状態不明');
 }
 const artifact=process.env.SODA_SUBAGENT_SCREENSHOT;if(artifact){await mkdir(dirname(artifact),{recursive:true});await page.screenshot({path:artifact});}
 await toggle.click();await expect(toggle.locator('.sidebar-subagent-count')).toHaveText('2');await expect(page.locator('.sidebar-subagent-row')).toHaveCount(0);
 assert.deepEqual(errors,[]);console.log('PASS: served Sidebar DOM keyboard expansion, collapsed-only badge, readonly children, 64-item cap/remainder, update stability and rounded rows across four themes; AGY membership/unknown in sidebar, shared list, footer tooltip and graph');
}finally{await browser?.close();await server.close();}
