import {afterEach,expect,it} from "vitest";
import {mkdtemp,rm,readdir,rename} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {DesktopEndpointStore} from "./DesktopEndpointStore.node.js";
import {desktopSecretProtector} from "./DesktopEndpointProtector.node.js";
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
async function fixture(){const root=await mkdtemp(join(tmpdir(),"soda-node-directory-"));dirs.push(root);const stateDir=join(root,"nested","state");return{root,stateDir};}
it.skipIf(process.platform==="win32")("checks missing directory without writes and explicitly prepares nested directories",async()=>{
 const f=await fixture(),store=new DesktopEndpointStore({stateDir:f.stateDir});
 expect(await store.directoryAvailable()).toBe(false);expect(await readdir(f.root)).toEqual([]);
 await store.prepareDirectory();expect(await store.directoryAvailable()).toBe(true);expect(await readdir(f.stateDir)).toEqual([]);expect(await store.status()).toEqual({initialized:false});store.close();await store.settled();
});
it("rejects queued preparation when the owner closes",async()=>{
 const f=await fixture(),store=new DesktopEndpointStore({stateDir:f.stateDir});const pending=store.prepareDirectory();store.close();await expect(pending).rejects.toThrow();await store.settled();expect(await readdir(f.root)).toEqual([]);
});
it("validates Windows volume/ACL before any Node filesystem access or creation",async()=>{
 const f=await fixture();const store=new DesktopEndpointStore({stateDir:f.stateDir,platform:"win32",protector:{...desktopSecretProtector("linux"),mode:"dpapi-user"},checkWindowsPath:async(path,allowMissing)=>{expect(path).toBe(f.stateDir);expect(allowMissing).toBe(true);throw Error("fixed volume rejected");},commitWindowsVault:rename});
 await expect(store.directoryAvailable()).rejects.toThrow("fixed volume rejected");await expect(store.prepareDirectory()).rejects.toThrow("fixed volume rejected");expect(await readdir(f.root)).toEqual([]);store.close();await store.settled();
});
it("rechecks directories after two owners race to create the same components",async()=>{
 const f=await fixture();let entered=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const options={stateDir:f.stateDir,platform:"win32" as const,protector:{...desktopSecretProtector("linux"),mode:"dpapi-user" as const},checkWindowsPath:async(path:string)=>{if(path===f.root){if(++entered===2)release();await gate;}},commitWindowsVault:rename};
 const first=new DesktopEndpointStore(options),second=new DesktopEndpointStore(options);
 try{await Promise.all([first.prepareDirectory(),second.prepareDirectory()]);expect(await first.directoryAvailable()).toBe(true);expect(await second.directoryAvailable()).toBe(true);expect(await readdir(f.stateDir)).toEqual([]);}
 finally{release();first.close();second.close();await Promise.all([first.settled(),second.settled()]);}
});
