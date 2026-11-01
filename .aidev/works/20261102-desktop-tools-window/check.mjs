import {app,nativeImage} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';import {writeFile} from 'node:fs/promises';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
app.disableHardwareAcceleration();const root=dirname(fileURLToPath(import.meta.url)),profile=join(root,'profile-'+Date.now());mkdirSync(profile);app.setPath('userData',profile);writeFileSync(join(profile,'assistant.json'),JSON.stringify({version:1,enabled:true,mode:'character',voiceEnabled:false,quietFullscreen:false}));
const windows=[],result={};app.on('browser-window-created',(_e,w)=>windows.push(w));const wait=async check=>{for(let n=0;n<1500;n++){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out');};
let failed=false;const watchdog=setTimeout(()=>{void writeFile(join(root,'result.json'),JSON.stringify({...result,error:'timeout'})).finally(()=>app.exit(1));},45000);
void(async()=>{try{
 await import(pathToFileURL(join(root,'bundle/dist/main.mjs')).href);
 const character=await wait(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/character.html')&&!w.webContents.isLoadingMainFrame()));await character.webContents.executeJavaScript('window.assistant.chat()',true);
 const bubble=await wait(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/bubble.html')&&!w.webContents.isLoadingMainFrame()&&w.isVisible()));
 result.inlineTools=await bubble.webContents.executeJavaScript('!!document.getElementById("standard-tools")');if(result.inlineTools)throw Error('Tools remain in chat');
 await bubble.webContents.executeJavaScript('document.getElementById("open-tools").click()',true);
 const tools=await wait(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/tools.html')&&!w.webContents.isLoadingMainFrame()&&w.isVisible()));
 await new Promise(r=>setTimeout(r,700));await promisify(execFile)('powershell.exe',['-NoProfile','-File',join(root,'capture.ps1'),tools.getNativeWindowHandle().readBigUInt64LE().toString(),join(root,'tools.png')],{windowsHide:true});
 const pixels=nativeImage.createFromPath(join(root,'tools.png')).toBitmap(),colors=new Set();for(let i=0;i<pixels.length;i+=16)colors.add(pixels.readUInt32LE(i));result.screenColors=colors.size;if(colors.size<50)throw Error('Blank tools');
 const count=windows.length;await bubble.webContents.executeJavaScript('window.assistant.openTools()',true);result.reused=windows.length===count;if(!result.reused)throw Error('Duplicate tools window');
 await tools.webContents.executeJavaScript('document.getElementById("tool-text").value="操作を確認する文章です。";document.getElementById("prepare-summary").click()',true);
 await wait(()=>bubble.webContents.executeJavaScript('document.getElementById("message").value.includes("要約してください")'));
 result.draftTransferred=true;result.pendingDraft=await bubble.webContents.executeJavaScript('window.assistant.draftState()');
 tools.close();result.chatSurvives=await wait(()=>!bubble.isDestroyed()&&bubble.isVisible());
}catch(error){failed=true;result.error=String(error.stack??error);}
finally{clearTimeout(watchdog);await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));app.exit(failed?1:0);}})();
