// Real Vue component/DOM with generated WebSocket receipts; no actual desktop or helper start.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(join(repo,'packages/web/package.json'));
const {createServer}=await import(require.resolve('vite'));
const vue=(await import(require.resolve('@vitejs/plugin-vue'))).default;
const {chromium,expect}=createRequire(join(repo,'packages/desktop-assistant/package.json'))('@playwright/test');
const socketModule=`export function createDesktopSocketFactory(){return{encrypted:false,dispose(){},open(url,protocols){const s={readyState:1,bufferedAmount:0,binaryType:'',sent:[],send(value){s.sent.push(JSON.parse(value))},close(){s.closed=true}};(window.generatedSockets??=[]).push(s);return s}}}`;
const server=await createServer({root:join(repo,'packages/web'),configFile:false,plugins:[{name:'generated-fixture-html',configureServer(s){s.middlewares.use('/generated-virtual-drag',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/generated-virtual-drag',`<html><body><div id="app"></div><script type="module">import{createApp}from'vue';import Remote from'/src/components/RemoteDesktopWindow.vue';createApp(Remote,{machineId:'generated',label:'Generated',embedded:true}).mount('#app');</script></body></html>`))});}},{name:'generated-desktop-socket',enforce:'pre',resolveId(id,importer){if(id.endsWith('/desktop/DesktopEndpointSocket.js')&&importer?.includes('RemoteDesktopWindow.vue'))return'\0generated-desktop-socket'},load(id){if(id==='\0generated-desktop-socket')return socketModule}},vue()],server:{host:'127.0.0.1',port:0},logLevel:'error'});

let browser;
try{
 await server.listen();const port=server.httpServer.address().port,origin=`http://127.0.0.1:${port}`;
 browser=await chromium.launch({headless:true,args:['--disable-gpu']});const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message)});page.on('requestfailed',r=>console.error('requestfailed',r.url(),r.failure()));page.on('console',m=>{if(m.type()==='error')console.error('browser-console',m.text())});
 await page.goto(origin+'/generated-virtual-drag');await expect.poll(()=>page.evaluate(()=>window.generatedSockets?.length)).toBe(1);
 await page.getByRole('button',{name:'情報・設定',exact:true}).click();
 await page.locator('[data-virtual-desktop-option] input').check();await expect(page.locator('[data-virtual-native-drag-option] input')).not.toBeChecked();
 await page.locator('[data-virtual-native-drag-option] input').check();
 const index=await page.evaluate(()=>window.generatedSockets.length-1);
 await page.evaluate(index=>window.generatedSockets[index].onopen(),index);
 const start=await page.evaluate(index=>window.generatedSockets[index].sent.find(v=>v.type==='start'),index);assert.equal(start.options.virtualNativeDrag,true);
 const ready={type:'ready',title:'Generated',width:320,height:180,allowInput:true,backend:'synthetic',files:true,resourceFences:true,virtualDisplay:true};
 const deliver=async value=>page.evaluate(async({index,value})=>{await window.generatedSockets[index].onmessage({data:JSON.stringify(value)})},{index,value});
 await deliver(ready);await deliver({type:'files_ticket',ticket:'a'.repeat(43)});await deliver({type:'files_ready'});
 await expect(page.locator('[data-native-desktop-transfer]')).toHaveCount(0);await expect(page.locator('[data-virtual-native-drag-unavailable]')).toContainText('利用できません');
 await deliver({...ready,virtualNativeDrag:true});await expect(page.locator('[data-native-desktop-transfer]')).toHaveCount(1);
 await page.locator('[data-native-desktop-transfer] > summary').click();await expect(page.getByRole('button',{name:'このPCで直接ドラッグを準備',exact:true})).toBeDisabled();
 await deliver({type:'control',enabled:false});await expect(page.locator('[data-native-desktop-transfer]')).toHaveCount(1);
 await page.screenshot({path:join(here,'browser.png')});
 await deliver({type:'monitor_topology_changed'});await expect(page.locator('[data-native-desktop-transfer]')).toHaveCount(0);
 await deliver({...ready,virtualNativeDrag:true});await expect(page.locator('[data-native-desktop-transfer]')).toHaveCount(0);
 const sent=await page.evaluate(()=>window.generatedSockets.flatMap(s=>s.sent));assert.equal(sent.filter(v=>/native_|file_/.test(v.type)).length,0);assert.deepEqual(errors,[]);
 const receipt={explicitOptinObserved:start.options.virtualNativeDrag===true,missingProofHidden:true,proofShowsTransfer:true,filePermissionStillRequired:true,controlReleaseRetainsCapability:true,topologyAndStaleProofHidden:true,nativeTransferCalls:0,pageErrors:errors};
 await writeFile(join(here,'browser.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser?.close();await server.close();}
