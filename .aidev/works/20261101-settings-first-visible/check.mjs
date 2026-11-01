import {app,BrowserWindow,nativeImage} from 'electron';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';import {writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
app.disableHardwareAcceleration();
const root=dirname(fileURLToPath(import.meta.url)),variant=process.argv[2]||'baseline',profile=join(root,'profile-'+variant+'-'+Date.now());mkdirSync(profile);app.setPath('userData',profile);
copyFileSync('C:/Users/makku/AppData/Roaming/Sodashitsu Assistant/assistant-characters.json',join(profile,'assistant-characters.json'));
writeFileSync(join(profile,'assistant.json'),JSON.stringify({version:1,enabled:true,mode:'character',voiceEnabled:false,allowPluginCharacters:true,characterId:'plugin:yukkuri-work/tsumugi',quietFullscreen:false}));
const windows=[],result={variant,cycles:[]};app.on('browser-window-created',(_event,w)=>windows.push(w));
const wait=async check=>{for(let n=0;n<1500;n++){const v=check();if(v)return v;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for test window');};
let failed=false;const watchdog=setTimeout(()=>{void writeFile(join(root,variant+'-result.json'),JSON.stringify({...result,error:'timeout'})).finally(()=>app.exit(1));},45000);
void (async()=>{try{
 await import(pathToFileURL(join(root,variant,'dist/main.mjs')).href);
 const character=await wait(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/character.html')&&!w.webContents.isLoadingMainFrame()));
 await character.webContents.executeJavaScript('window.assistant.chat()',true);
 const bubble=await wait(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/bubble.html')&&!w.webContents.isLoadingMainFrame()));
 await wait(()=>bubble.isVisible());
 for(let i=0;i<3;i++){
  await bubble.webContents.executeJavaScript('document.getElementById("settings").click()',true);
  const settings=await wait(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/settings.html')&&w.isVisible()&&!w.webContents.isLoadingMainFrame()));
  await new Promise(r=>setTimeout(r,700));
  const imagePath=join(root,variant+'-screen-'+i+'.png');
  await promisify(execFile)('powershell.exe',['-NoProfile','-File',join(root,'capture.ps1'),settings.getNativeWindowHandle().readBigUInt64LE().toString(),imagePath],{windowsHide:true});
  const image=nativeImage.createFromPath(imagePath),bytes=image.toBitmap(),colors=new Set();for(let n=0;n<bytes.length;n+=16)colors.add(bytes.readUInt32LE(n));
  const text=await settings.webContents.executeJavaScript('document.body.innerText');result.cycles.push({colors:colors.size,textLength:text.length});
  if(colors.size<50||text.length<200)throw Error('Blank actual screen on cycle '+i);
  settings.close();await wait(()=>settings.isDestroyed());
 }
}catch(error){failed=true;result.error=String(error.stack??error);}
finally{clearTimeout(watchdog);await writeFile(join(root,variant+'-result.json'),JSON.stringify(result,null,2));app.exit(failed?1:0);}
})();
