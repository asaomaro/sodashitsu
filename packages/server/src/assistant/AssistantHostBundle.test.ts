import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,readFile,lstat,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {runInNewContext} from "node:vm";
import {expect,it} from "vitest";
const run=promisify(execFile);

it("loads soda's GUI resources without node_modules using a synthetic Electron API only",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"soda-host-bundle-"));
 try{
  const {buildAssistantHost}=await import(new URL("../../../desktop-assistant/scripts/build-host.mjs",import.meta.url).href);
  const packaged=join(directory,"package"),host=join(packaged,"packages/server/assets/assistant-host");await buildAssistantHost(host);
  const manifest=JSON.parse(await readFile(join(host,"host-manifest.json"),"utf8")) as {version:number;entries:{path:string;bytes:number;sha256:string}[]};
  expect(manifest.version).toBe(1);expect(manifest.entries.length).toBeGreaterThan(15);
  for(const entry of manifest.entries){
   const path=join(host,entry.path),info=await lstat(path),bytes=await readFile(path);
   expect(info.isFile()&&!info.isSymbolicLink()).toBe(true);expect(bytes.length).toBe(entry.bytes);
   expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
  }
  for(const name of ["dist/main.mjs","dist/preload.cjs","assets/character.html","assets/bubble.html","assets/captain-robot.svg","THIRD_PARTY_NOTICES.txt"])
   expect(manifest.entries.some(entry=>entry.path===name)).toBe(true);
  expect(await readFile(join(host,"THIRD_PARTY_NOTICES.txt"),"utf8")).toMatch(/zod@/);
  await run(process.execPath,["--check",join(host,"dist/main.mjs")]);
  await run(process.execPath,["--check",join(host,"dist/preload.cjs")]);
  const electron=join(directory,"electron.mjs"),loader=join(directory,"loader.mjs");
  await writeFile(electron,`const deny=new Proxy(function(){throw Error('unexpected native call')},{get(){throw Error('unexpected native access')}});
   export const app={requestSingleInstanceLock(){return false},quit(){console.log('synthetic_gui_declined_owned_start')}};
   export const protocol={registerSchemesAsPrivileged(){}};
   export const BrowserWindow=deny,Menu=deny,Tray=deny,clipboard=deny,desktopCapturer=deny,dialog=deny,ipcMain=deny,nativeImage=deny,powerMonitor=deny,screen=deny,session=deny;`);
  await writeFile(loader,`export async function resolve(id,ctx,next){if(id==='electron')return {url:${JSON.stringify(pathToFileURL(electron).href)},shortCircuit:true};return next(id,ctx);}`);
  const loaded=await run(process.execPath,["--no-warnings","--experimental-loader",pathToFileURL(loader).href,join(host,"dist/main.mjs")],{cwd:directory,timeout:10000,maxBuffer:8192});
  expect(loaded.stdout).toContain("synthetic_gui_declined_owned_start");
  let exposed:unknown;const exports={};
  runInNewContext(await readFile(join(host,"dist/preload.cjs"),"utf8"),{exports,module:{exports},require:(name:string)=>{
   if(name!=="electron")throw Error("Unexpected preload dependency");
   return {contextBridge:{exposeInMainWorld:(name:string,api:unknown)=>{expect(name).toBe("assistant");exposed=api;}},ipcRenderer:{invoke(){throw Error("No native IPC in a bundle test");},on(){},removeListener(){}}};
  }});
  expect(Object.isFrozen(exposed)).toBe(true);expect(Object.keys(exposed as object)).toContain("read");
  const desktopDir=join(packaged,"packages/desktop-assistant");await mkdir(desktopDir,{recursive:true});
  await writeFile(join(desktopDir,"package.json"),await readFile(new URL("../../../desktop-assistant/package.json",import.meta.url)));
  await writeFile(join(packaged,"packages/server/package.json"),JSON.stringify({dependencies:{"@sodashitsu/desktop-assistant":"workspace:*"}}));
  const catalogPath=join(packaged,"packages/server/assets/assistant-runtime.json"),catalog=await readFile(new URL("../../assets/assistant-runtime.json",import.meta.url),"utf8");
  await writeFile(catalogPath,catalog);
  const {verifyAssistantHostPackage}=await import(new URL("../../../desktop-assistant/scripts/verify-host-package.mjs",import.meta.url).href);
  expect((await verifyAssistantHostPackage(packaged)).commonRuntimeVariants).toBe(6);
  await writeFile(join(host,"unlisted.js"),"generated unexpected resource");
  await expect(verifyAssistantHostPackage(packaged)).rejects.toThrow(/Unlisted/);await rm(join(host,"unlisted.js"));
  await mkdir(join(host,"node_modules"));await expect(verifyAssistantHostPackage(packaged)).rejects.toThrow(/Unlisted/);await rm(join(host,"node_modules"),{recursive:true});
  const invalid=JSON.parse(catalog);invalid.entries[1]=invalid.entries[0];await writeFile(catalogPath,JSON.stringify(invalid));
  await expect(verifyAssistantHostPackage(packaged)).rejects.toThrow(/variant/);

 }finally{await rm(directory,{recursive:true,force:true});}
},20000);
