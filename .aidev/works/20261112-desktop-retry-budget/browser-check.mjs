// Generated local browser fixture: actual Vue component, frame decoder and renderer.
// Only the endpoint transport is replaced. No remote machine, desktop or OS input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../../..');
const req=createRequire(join(repo,'packages/web/package.json'));
const serverReq=createRequire(join(repo,'packages/server/package.json'));
const {createServer}=await import(req.resolve('vite'));
const vue=(await import(req.resolve('@vitejs/plugin-vue'))).default;
const {chromium}=serverReq('playwright');
const cache=await mkdtemp(join(tmpdir(),'soda-retry-browser-'));
const socketModule=`export function createDesktopSocketFactory(){return{encrypted:false,dispose(){},open(){const s={readyState:1,bufferedAmount:0,binaryType:'',sent:[],send(raw){s.sent.push(JSON.parse(raw));},close(){s.readyState=3;queueMicrotask(()=>s.onclose?.({reason:''}));}};(window.sockets??=[]).push(s);setTimeout(()=>s.onopen?.(),0);return s;}}}`;
const html=`<html><body><div id="app"></div><script type="module">
import{createApp,h}from'vue';import{encodeDesktopFrame}from'@sodashitsu/protocol';
import Remote from'/src/components/RemoteDesktopWindow.vue';
window.deliver=async(i,m)=>window.sockets[i].onmessage({data:JSON.stringify(m)});
window.image=async(i,red)=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='rgb('+red+',70,90)';x.fillRect(0,0,320,180);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const raw=new Uint8Array(await blob.arrayBuffer());const frame=encodeDesktopFrame({seq:1,width:320,height:180,format:'image/png',captureMs:0,encodeMs:0},raw);await window.sockets[i].onmessage({data:frame.slice().buffer});};
createApp({render:()=>h(Remote,{machineId:'generated',label:'Generated retry test',embedded:true})}).mount('#app');
</script></body></html>`;
const vite=await createServer({root:join(repo,'packages/web'),configFile:false,cacheDir:cache,
  plugins:[{name:'fixture',configureServer(s){s.middlewares.use('/retry-fixture',async(_q,r)=>{r.setHeader('Content-Type','text/html');r.end(await s.transformIndexHtml('/retry-fixture',html));});}},
    {name:'generated-transport',enforce:'pre',resolveId(id,from){if(id.endsWith('/desktop/DesktopEndpointSocket.js')&&from?.includes('RemoteDesktopWindow.vue'))return'\0retry-socket';},load(id){if(id==='\0retry-socket')return socketModule;}},vue()],
  server:{host:'127.0.0.1',port:0},logLevel:'error'});
const receipt={generatedOnly:true,windows:false,osInput:false,componentSHA256:createHash('sha256').update(await readFile(join(repo,'packages/web/src/components/RemoteDesktopWindow.vue'))).digest('hex'),cases:[],errors:[],cleanup:{browser:false,vite:false}};
let browser;
try{
  await vite.listen();
  const origin='http://127.0.0.1:'+vite.httpServer.address().port;
  browser=await chromium.launch({headless:true});
  for(const withFrames of [true,false]){
    const name=withFrames?'six rendered epochs keep viewing':'ready-only failures remain bounded';
    const context=await browser.newContext();
    try{
      await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      const page=await context.newPage();
      page.on('pageerror',e=>receipt.errors.push(e.message));
      await page.goto(origin+'/retry-fixture');
      await page.waitForFunction(()=>window.sockets?.[0]?.sent.some(m=>m.type==='start'));
      await page.getByRole('button',{name:'情報・設定',exact:true}).click();
      await page.getByLabel('管理者権限のアプリ・UAC画面を共有',{exact:true}).check();
      await page.waitForFunction(()=>window.sockets.length===2&&window.sockets.at(-1).sent.some(m=>m.type==='start'));
      await page.getByRole('button',{name:'情報・設定',exact:true}).click();
      const epochs=withFrames?6:4;
      for(let n=0;n<epochs;n++){
        const i=await page.evaluate(()=>window.sockets.length-1);
        await page.evaluate(i=>window.deliver(i,{type:'ready',title:'Generated',width:320,height:180,backend:'windows-gdi',allowInput:true,secureDesktop:true,protectedDesktop:'elevated-default'}),i);
        if(withFrames){
          await page.evaluate(({i,red})=>window.image(i,red),{i,red:40+n});
          await page.waitForFunction(i=>document.querySelector('canvas[aria-label="共有画面"]').dataset.renderedFrames==='1'&&window.sockets[i].sent.some(m=>m.type==='ack'&&m.seq===1),i);
          const pixel=await page.locator('canvas[aria-label="共有画面"]').evaluate(c=>Array.from(c.getContext('2d').getImageData(10,10,1,1).data));
          assert.deepEqual(pixel,[40+n,70,90,255]);
          assert.match(await page.locator('[data-desktop-status]').textContent(),/閲覧中$/);
        }
        if(withFrames&&n===epochs-1)break;
        const count=await page.evaluate(()=>window.sockets.length);
        await page.evaluate(i=>window.deliver(i,{type:'protected_desktop_failure',code:'source_changed'}),i);
        assert.equal(await page.locator('canvas[aria-label="共有画面"]').getAttribute('data-rendered-frames'),'0');
        if(!withFrames&&n===epochs-1){
          assert.equal(await page.locator('[data-desktop-status]').textContent(),'停止');
          // Wait past the existing retry callback, then inspect browser-created sockets.
          await page.waitForTimeout(900);
          assert.equal(await page.evaluate(()=>window.sockets.length),count);
        }else{
          await page.waitForFunction(count=>window.sockets.length===count+1&&window.sockets.at(-1).sent.some(m=>m.type==='start'),count,{timeout:3500});
        }
      }
      assert.equal(await page.evaluate(()=>window.sockets.some(s=>s.sent.some(m=>m.type==='control'&&m.enabled||m.type==='input'))),false);
      receipt.cases.push({name,ok:true,epochs,actualCanvasPixels:withFrames,controlOrInputSent:false});
    }catch(e){receipt.cases.push({name,ok:false,error:e.message});}
    finally{await context.close();}
  }
  assert.equal(receipt.errors.length,0);
  assert(receipt.cases.every(c=>c.ok),'Browser regression failed');
}finally{
  await browser?.close();receipt.cleanup.browser=true;
  await vite.close();receipt.cleanup.vite=true;
  await rm(cache,{recursive:true,force:true});
  await writeFile(join(here,'browser-result.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
