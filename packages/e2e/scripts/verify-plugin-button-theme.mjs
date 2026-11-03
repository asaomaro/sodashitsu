import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {uiTokens} from '@sodashitsu/client-core';
const host=await readFile(new URL('../../web/public/display-view/script.html',import.meta.url),'utf8');
const buttonCss=await readFile(new URL('../../web/src/styles/buttonTheme.css',import.meta.url),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url.startsWith('/frame')?host:'<!doctype html><body></body>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.SODA_E2E_CHROMIUM_PATH?{executablePath:process.env.SODA_E2E_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage();page.on("pageerror",e=>console.error(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(({buttonCss,vars})=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error("plugin handshake timed out")),10000);
  let accepted=false;const frame=document.createElement('iframe');frame.sandbox='allow-scripts';
  window.addEventListener('message',event=>{
   if(accepted||event.source!==frame.contentWindow||event.data.type!=='display-ready')return;accepted=true;
   const channel=new MessageChannel();window.themePort=channel.port1;
   channel.port1.onmessage=e=>{if(e.data.type==='rendered'){clearTimeout(timeout);resolve();}if(e.data.type==='failed')reject(new Error(JSON.stringify(e.data)));};
   frame.contentWindow.postMessage({type:'display-init',v:1},'*',[channel.port2]);
   channel.port1.postMessage({type:'render',rev:1,format:'script-html',theme:{dark:true,vars,buttonCss,buttonTheme:'features'},source:`<input id="draft" value="original"><button class="soda-button soda-button-action" id="action">Save</button><button class="soda-button soda-button-feature" id="feature">Details</button><script>window.runs=(window.runs||0)+1;window.original=document.getElementById('draft');</script>`});
  });frame.src='/frame?t=probe';document.body.append(frame);
 }),{buttonCss,vars:uiTokens('sodashitsu-assistant-dark').vars});
 const frame=page.frames().find(f=>f.url().includes('/frame'));
 await frame.locator('#draft').fill('edited');
 for(const name of ['sodashitsu-assistant-dark','sodashitsu-assistant','dracula'])for(const mode of ['none','actions','features']){
  await page.evaluate(({buttonCss,vars,mode})=>window.themePort.postMessage({type:'theme',theme:{dark:false,vars,buttonCss,buttonTheme:mode}}),{buttonCss,vars:uiTokens(name).vars,mode});
  await frame.waitForFunction(mode=>document.documentElement.dataset.buttonTheme===mode,mode);
  const result=await frame.evaluate(()=>({mode:window.soda.theme.buttonTheme,runs:window.runs,same:window.original===document.getElementById('draft'),value:document.getElementById('draft').value,action:getComputedStyle(document.getElementById('action')).backgroundColor,feature:getComputedStyle(document.getElementById('feature')).backgroundColor,accent:(()=>{const e=document.createElement('span');e.style.background='var(--soda-accent)';document.body.append(e);const color=getComputedStyle(e).backgroundColor;e.remove();return color;})()}));
  assert.equal(result.runs,1);assert.equal(result.same,true);assert.equal(result.value,'edited');assert.equal(result.mode,mode);
  assert.equal(result.action===result.accent,mode!=='none');assert.equal(result.feature===result.accent,mode==='features');
 }
 console.log('PASS: sandboxed plugin iframe follows palette/level changes; draft identity/value and script execution retained');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
