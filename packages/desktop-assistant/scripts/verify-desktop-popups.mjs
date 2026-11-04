// Real Electron main + renderer, generated server and private userData only.
// No production server, agent, desktop capture or OS input is used.
import {_electron,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const directory=await mkdtemp(join(tmpdir(),'soda-desktop-popup-'));
const launch=encodeURIComponent(JSON.stringify({machineId:'generated',label:'Generated desktop'}));
const server=createServer((request,response)=>{
 response.setHeader('Content-Type','text/html; charset=utf-8');
 const shared=request.headers.cookie?.includes('soda-popup-fixture=present')===true;
 if(request.url==='/')response.setHeader('Set-Cookie','soda-popup-fixture=present; HttpOnly; SameSite=Strict; Path=/');
 response.end(`<!doctype html><title>Generated desktop fixture</title><p id="cookie">${shared}</p><button id="desktop" onclick="window.open('/desktop-view#${launch}','_blank','noopener')">Desktop</button><button id="external" onclick="window.open('https://foreign.invalid/desktop-view#${launch}','_blank')">External</button>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let application;
try {
 await writeFile(join(directory,'assistant.json'),JSON.stringify({enabled:false,serverOrigin:origin,mode:'tray',voiceEnabled:false,mute:true}));
 const main=pathToFileURL(fileURLToPath(new URL('../dist/main.js',import.meta.url))).href;
 const bootstrap=join(directory,'launch.cjs');
 await writeFile(bootstrap,`const {app}=require('electron');app.setPath('userData',${JSON.stringify(directory)});import(${JSON.stringify(main)});`);
 application=await _electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:['--no-sandbox','--disable-gpu',bootstrap],timeout:30000});
 expect(await application.evaluate(({app})=>app.getPath('userData'))).toBe(directory);
 const settings=await application.firstWindow();
 await settings.waitForURL('soda-assistant://app/settings.html');
 await settings.evaluate(async serverOrigin=>{await window.assistant.save({enabled:true,serverOrigin,mode:'tray',voiceEnabled:false,mute:true});await window.assistant.open();},origin);
 const views=()=>application.evaluate(({webContents})=>webContents.getAllWebContents().filter(c=>c.getURL().startsWith('http://127.0.0.1:')).map(c=>({id:c.id,url:c.getURL(),preload:c.getLastWebPreferences().preload??null,node:c.getLastWebPreferences().nodeIntegration,sandbox:c.getLastWebPreferences().sandbox})));
 await expect.poll(async()=>(await views()).filter(v=>v.url===origin+'/').length).toBe(1);
 const parent=(await views()).find(v=>v.url===origin+'/');
 const click=id=>application.evaluate(async({webContents},{id,button})=>{await webContents.fromId(id).executeJavaScript(`document.getElementById('${button}').click()`);},{id,button:'desktop'});
 await click(parent.id);
 await expect.poll(async()=>(await views()).filter(v=>v.url.includes('/desktop-view#')).length).toBe(1);
 const desktop=(await views()).find(v=>v.url.includes('/desktop-view#'));
 expect(desktop.preload).toBe(null);expect(desktop.node).toBe(false);expect(desktop.sandbox).toBe(true);
 const proof=await application.evaluate(async({webContents},id)=>webContents.fromId(id).executeJavaScript('({cookie:document.getElementById("cookie").textContent,native:typeof window.assistant})'),desktop.id);
 expect(proof).toEqual({cookie:'true',native:'undefined'});
 await click(desktop.id);
 await expect.poll(async()=>(await views()).filter(v=>v.url.includes('/desktop-view#')).length).toBe(2);
 const windowIds=()=>application.evaluate(({BrowserWindow,webContents})=>({windows:BrowserWindow.getAllWindows().map(w=>w.id).sort(),contents:webContents.getAllWebContents().map(w=>w.id).sort()}));
 const beforeExternal=await windowIds();
 await application.evaluate(async({webContents},id)=>webContents.fromId(id).executeJavaScript('document.getElementById("external").click()'),parent.id);
 expect(await windowIds()).toEqual(beforeExternal);
 expect((await views()).filter(v=>v.url.includes('/desktop-view#'))).toHaveLength(2);
 expect((await views()).some(v=>v.id===parent.id)).toBe(true);
 await application.evaluate(({BrowserWindow},id)=>{const win=BrowserWindow.getAllWindows().find(w=>w.contentView.children.some(v=>v.webContents?.id===id));if(!win)throw Error('Missing desktop owner');win.close();},desktop.id);
 await expect.poll(async()=>(await views()).some(v=>v.id===desktop.id)).toBe(false);
 expect((await views()).some(v=>v.id===parent.id)).toBe(true);
 console.log('electron_desktop_popups_passed: real renderer opens sibling/nested windows; HttpOnly session shared; no remote preload; parent retained; child renderer closed');
}finally{
 try{await application?.close();}finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
}
