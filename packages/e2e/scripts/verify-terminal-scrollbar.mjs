import {chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import assert from "node:assert/strict";
const entry=await readFile(new URL("../../web/src/main.ts",import.meta.url),"utf8");assert.ok(entry.includes("terminalAppearance.css"),"terminal styling must be loaded");
const scrollbarCss=await readFile(new URL("../../web/src/styles/terminalAppearance.css",import.meta.url),"utf8");
const js=await readFile(new URL("../../web/node_modules/@xterm/xterm/lib/xterm.mjs",import.meta.url)),css=await readFile(new URL("../../web/node_modules/@xterm/xterm/css/xterm.css",import.meta.url));
const server=createServer((req,res)=>{if(req.url==="/xterm.mjs"){res.setHeader("content-type","text/javascript");res.end(js);}else if(req.url==="/xterm.css"){res.setHeader("content-type","text/css");res.end(css);}else{res.setHeader("content-type","text/html");res.end('<link rel="stylesheet" href="/xterm.css"><div id="terminal" style="width:700px;height:260px"></div>');}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch({headless:true,...(process.env.SODA_E2E_CHROMIUM_PATH?{executablePath:process.env.SODA_E2E_CHROMIUM_PATH}:{})});
try{const p=await browser.newPage();await p.goto(`http://127.0.0.1:${server.address().port}`);const result=await p.evaluate(async css=>{
 const style=document.createElement("style");style.textContent=css;document.head.append(style);
 const {Terminal}=await import("/xterm.mjs");const t=new Terminal({allowProposedApi:true,cols:60,rows:10});t.open(document.getElementById("terminal"));
 await new Promise(r=>t.write(Array.from({length:100},(_,i)=>`line ${i}`).join("\r\n"),r));await new Promise(r=>requestAnimationFrame(r));
 const bar=document.querySelector(".xterm .scrollbar.vertical"),slider=bar.querySelector(".slider");const before=t.buffer.active.viewportY;t.scrollLines(-5);const after=t.buffer.active.viewportY;
 const result={track:bar.getBoundingClientRect().width,thumb:slider.getBoundingClientRect().width,scrolled:after<before};window.__probeTerm=t;return result;
},scrollbarCss);assert.ok(result.track>=8);assert.equal(result.thumb,8);assert.equal(result.scrolled,true);
 await p.locator("#terminal").hover();const thumb=await p.locator(".scrollbar.vertical > .slider").boundingBox();assert.ok(thumb);
 const start=await p.evaluate(()=>window.__probeTerm.buffer.active.viewportY);
 await p.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2);await p.mouse.down();await p.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2-30,{steps:5});await p.mouse.up();
 await p.waitForFunction(start=>window.__probeTerm.buffer.active.viewportY<start,start);await p.evaluate(()=>window.__probeTerm.dispose());
 console.log("PASS: shared 8px xterm thumb, preserved track/hit area and working scrolling verified");}finally{await browser.close();await new Promise(r=>server.close(r));}
