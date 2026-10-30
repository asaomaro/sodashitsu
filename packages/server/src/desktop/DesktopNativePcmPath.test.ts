import {createServer,type Server} from "node:net";
import {mkdtemp,readdir,rm,chmod,lstat,mkdir,rename,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {afterEach,expect,it,vi} from "vitest";
import {DesktopNativePcmPaths,type NativePcmOwner} from "./DesktopNativePcmPath.js";

const gate=vi.hoisted(()=>({wait:undefined as Promise<void>|undefined,unlinkWait:undefined as Promise<void>|undefined,entered:undefined as (()=>void)|undefined,rmdirWait:undefined as Promise<void>|undefined,rmdirEntered:undefined as (()=>void)|undefined}));
vi.mock("node:fs/promises",async original=>{
 const fs=await original<typeof import("node:fs/promises")>();
 return {...fs,mkdtemp:async(prefix:Parameters<typeof fs.mkdtemp>[0])=>{if(String(prefix).endsWith("soda-native-pcm-"))await gate.wait;return fs.mkdtemp(prefix as string);},unlink:async(path:Parameters<typeof fs.unlink>[0])=>{if(gate.unlinkWait&&String(path).endsWith(".sock")){gate.entered?.();await gate.unlinkWait;}return fs.unlink(path);},rmdir:async(path:Parameters<typeof fs.rmdir>[0])=>{if(gate.rmdirWait&&String(path).includes("soda-native-pcm-")){gate.rmdirEntered?.();await gate.rmdirWait;}return fs.rmdir(path);}};
});
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{gate.wait=undefined;gate.unlinkWait=undefined;gate.entered=undefined;gate.rmdirWait=undefined;gate.rmdirEntered=undefined;for(const run of cleanup.splice(0).reverse())await run();});
function owner(){
 let exited=false,close!:()=>void;const closed=new Promise<void>(resolve=>{close=()=>{exited=true;resolve();};});
 return {value:{closed,exited:()=>exited} satisfies NativePcmOwner,close};
}
async function fixture(){const root=await mkdtemp(join(tmpdir(),"soda-pcm-test-"));cleanup.push(()=>rm(root,{recursive:true,force:true}));return root;}
const name=()=>"SodaDesktopAudio-"+crypto.randomUUID().replaceAll("-","");
function stop(server:Server){return new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

it.skipIf(process.platform==="win32")("creates no files while disabled and rejects invalid names before allocating",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root,maximum:1}),source=owner();expect(paths.pending).toBe(0);expect(await readdir(root)).toEqual([]);
 await expect(paths.create(source.value,"../../outside")).rejects.toThrow("unavailable");source.close();await expect(paths.create(source.value,name())).rejects.toThrow("unavailable");expect(paths.pending).toBe(0);expect(await readdir(root)).toEqual([]);
});
it.skipIf(process.platform==="win32")("reserves its bounded slot through asynchronous creation and drains a cancelled source",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root,maximum:1}),source=owner();let release!:()=>void;gate.wait=new Promise<void>(resolve=>{release=resolve;});
 const creating=paths.create(source.value,name());const rejected=expect(creating).rejects.toThrow("unavailable");expect(paths.pending).toBe(1);
 await expect(paths.create(owner().value,name())).rejects.toThrow("unavailable");source.close();release();await rejected;
 await vi.waitFor(()=>expect(paths.pending).toBe(0));expect(await readdir(root)).toEqual([]);
});
it.skipIf(process.platform==="win32")("uses a private directory and retains an active socket until helper cleanup",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root,maximum:1,retryMs:10}),source=owner(),lease=await paths.create(source.value,name());
 expect((await lstat(dirname(lease.path))).mode&0o777).toBe(0o700);
 const server=createServer();await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(lease.path,resolve);});let listening=true;cleanup.push(async()=>{if(listening)await stop(server);source.close();});
 await chmod(lease.path,0o600);await lease.verify();await lease.retire();expect(paths.pending).toBe(1);expect((await lstat(lease.path)).isSocket()).toBe(true);
 await stop(server);listening=false;await vi.waitFor(()=>expect(paths.pending).toBe(0));expect(await readdir(root)).toEqual([]);
});
it.skipIf(process.platform==="win32")("discards an unused path immediately without waiting for the still-live source",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root}),source=owner(),lease=await paths.create(source.value,name());await lease.retire();expect(paths.pending).toBe(0);expect(source.value.exited()).toBe(false);expect(await readdir(root)).toEqual([]);source.close();
});
it.skipIf(process.platform==="win32")("never removes a replacement directory or its files when the owner exits",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root}),source=owner(),lease=await paths.create(source.value,name()),path=dirname(lease.path),held=join(root,"held");
 await rename(path,held);await mkdir(path,{mode:0o700});await writeFile(join(path,"replacement.txt"),"generated replacement");
 await expect(lease.verify()).rejects.toThrow("unavailable");await lease.retire();expect(paths.pending).toBe(1);source.close();await vi.waitFor(()=>expect(paths.pending).toBe(0));
 expect(await readFile(join(path,"replacement.txt"),"utf8")).toBe("generated replacement");expect((await lstat(held)).isDirectory()).toBe(true);
});

it.skipIf(process.platform==="win32")("rechecks directory identity after an awaited socket unlink before removing an empty directory",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root}),source=owner(),lease=await paths.create(source.value,name()),path=dirname(lease.path),held=join(root,"held");
 const server=createServer();await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(lease.path,resolve);});cleanup.push(()=>stop(server));
 await chmod(lease.path,0o600);await lease.verify();
 let release!:()=>void,entered!:()=>void;const reached=new Promise<void>(resolve=>{entered=resolve;});gate.entered=entered;gate.unlinkWait=new Promise<void>(resolve=>{release=resolve;});
 source.close();await reached;await rename(path,held);await mkdir(path,{mode:0o700});release();
 await vi.waitFor(()=>expect(paths.pending).toBe(0));expect((await lstat(path)).isDirectory()).toBe(true);expect((await lstat(held)).isDirectory()).toBe(true);
});

it.skipIf(process.platform==="win32")("reruns cleanup when physical close arrives during a pending rmdir",async()=>{
 const root=await fixture(),paths=new DesktopNativePcmPaths({root}),source=owner(),lease=await paths.create(source.value,name());
 const server=createServer();await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(lease.path,resolve);});cleanup.push(()=>stop(server));
 await chmod(lease.path,0o600);await lease.verify();let release!:()=>void,entered!:()=>void;const reached=new Promise<void>(resolve=>{entered=resolve;});gate.rmdirEntered=entered;gate.rmdirWait=new Promise<void>(resolve=>{release=resolve;});
 const retiring=lease.retire();await reached;source.close();release();await retiring;
 await vi.waitFor(()=>expect(paths.pending).toBe(0));expect(await readdir(root)).toEqual([]);
});
