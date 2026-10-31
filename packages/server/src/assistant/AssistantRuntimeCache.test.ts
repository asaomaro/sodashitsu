import {mkdtemp,rm,writeFile,readFile,readdir,mkdir,chmod,link} from 'node:fs/promises';
import * as files from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {AssistantRuntimeCache} from './AssistantRuntimeCache.js';
import type {RuntimeVariant} from './AssistantRuntimeCatalog.js';
vi.mock('node:fs/promises',async original=>{const actual=await original<typeof files>();return {...actual,rename:vi.fn(actual.rename)};});
const digest=(data:string)=>createHash('sha256').update(data).digest('hex');
async function fixture(run:(f:{root:string;cache:AssistantRuntimeCache;download:ReturnType<typeof vi.fn>;authority:ReturnType<typeof vi.fn>})=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'soda-runtime-cache-'));
 const variant:RuntimeVariant={version:'45.1.0',platform:'linux',arch:'x64',archive:'electron-v45.1.0-linux-x64.zip',bytes:22,sha256:digest('generated archive'),entry:'electron'};
 const authority=vi.fn(async()=>{}),download=vi.fn(async(_spec:unknown,path:string)=>{await writeFile(path,'generated archive',{flag:'wx'});});
 const cache=new AssistantRuntimeCache(async()=>({path:root,assert:authority}),{select:async()=>variant,download,extract:async(_archive,engine)=>{await writeFile(join(engine,'electron'),'generated inert fixture',{flag:'wx',mode:0o700});await chmod(join(engine,'electron'),0o700);return[{kind:'file',path:'electron',bytes:23,sha256:digest('generated inert fixture'),executable:true}];}});
 try{await run({root,cache,download,authority});}finally{await cache.dispose().catch(()=>{});await rm(root,{recursive:true,force:true});}
}
it('construction and unused disposal never resolve a root or load a runtime',async()=>{const root=vi.fn();const cache=new AssistantRuntimeCache(root);expect(root).not.toHaveBeenCalled();await cache.dispose();expect(root).not.toHaveBeenCalled();});
it('publishes a verified immutable cohort and rechecks it before reuse',()=>fixture(async f=>{
 const first=await f.cache.prepare('linux','x64');expect(first.cached).toBe(false);expect(await readFile(first.executable,'utf8')).toBe('generated inert fixture');
 const second=await f.cache.prepare('linux','x64');expect(second.cached).toBe(true);expect(second.directory).toBe(first.directory);expect(f.download).toHaveBeenCalledTimes(1);expect((await readdir(join(f.root,first.relativeDirectory.split('/')[0]!))).every(name=>name.startsWith('ready-'))).toBe(true);
}));
it.each(['bytes','extra-file','empty-directory','metadata'])('does not reuse corrupt %s or delete an older published cohort',kind=>fixture(async f=>{
 const first=await f.cache.prepare('linux','x64');
 if(kind==='bytes')await writeFile(first.executable,'changed');
 if(kind==='extra-file')await writeFile(join(first.directory,'engine','unlisted.js'),'unexpected');
 if(kind==='empty-directory')await mkdir(join(first.directory,'engine','node_modules'));
 if(kind==='metadata')await writeFile(join(first.directory,'runtime.json'),'{}');
 const second=await f.cache.prepare('linux','x64');expect(second.cached).toBe(false);expect(second.directory).not.toBe(first.directory);expect(f.download).toHaveBeenCalledTimes(2);expect(await readdir(first.directory)).toContain('runtime.json');
}));
it('cancelled download keeps ownership until physical retirement and removes only its staging',()=>fixture(async f=>{
 let release!:()=>void,entered=false,retired=false;
 f.download.mockImplementation(async()=>{entered=true;await new Promise<void>(resolve=>{release=resolve;});retired=true;});
 const operation=f.cache.prepare('linux','x64');const completion=operation.then(()=>null,error=>error);await vi.waitFor(()=>expect(entered).toBe(true));f.cache.cancel();
 await expect(f.cache.prepare('linux','x64')).rejects.toThrow(/retiring/);let disposed=false;const disposal=f.cache.dispose().then(()=>{disposed=true;});await Promise.resolve();expect(disposed).toBe(false);expect(retired).toBe(false);
 release();expect(await completion).toBeInstanceOf(Error);await disposal;expect(retired).toBe(true);const family=(await readdir(f.root))[0]!;expect(await readdir(join(f.root,family))).toEqual([]);
}));
it('cancellation during root resolution never starts a download',async()=>{
 const root=await mkdtemp(join(tmpdir(),'soda-runtime-root-'));let release!:(value:{path:string;assert:()=>Promise<void>})=>void;
 const resolver=vi.fn(()=>new Promise<{path:string;assert:()=>Promise<void>}>(resolve=>{release=resolve;}));
 const cache=new AssistantRuntimeCache(resolver);const completion=cache.prepare('linux','x64').then(()=>null,error=>error);
 try{await vi.waitFor(()=>expect(resolver).toHaveBeenCalledTimes(1));cache.cancel();release({path:root,assert:async()=>{throw Error('must not inspect root after cancellation');}});expect(await completion).toBeInstanceOf(Error);expect(await readdir(root)).toEqual([]);}finally{await cache.dispose();await rm(root,{recursive:true,force:true});}
});
it('permission loss prevents publication and clears private staging',()=>fixture(async f=>{
 let calls=0;f.authority.mockImplementation(async()=>{if(++calls>=8)throw Error('permission revoked');});
 await expect(f.cache.prepare('linux','x64')).rejects.toThrow(/permission revoked/);const family=(await readdir(f.root))[0]!;expect(await readdir(join(f.root,family))).toEqual([]);
}));
it('rejects unknown cache entries without deleting or opening them',()=>fixture(async f=>{
 const first=await f.cache.prepare('linux','x64');const family=join(f.root,first.relativeDirectory.split('/')[0]!);await mkdir(join(family,'unowned'));
 await expect(f.cache.prepare('linux','x64')).rejects.toThrow(/Unexpected runtime cache entry/);expect(await readdir(family)).toContain('unowned');expect(f.download).toHaveBeenCalledTimes(1);
}));

it('refuses a different staging directory substituted at atomic publication',()=>fixture(async f=>{
 const actual=(await vi.importActual<typeof files>('node:fs/promises')).rename;
 const mock=vi.spyOn(files,'rename').mockImplementationOnce(async(source,target)=>{await actual(source,String(source)+'-previous');await mkdir(source);await actual(source,target);});
 try{await expect(f.cache.prepare('linux','x64')).rejects.toThrow(/Published runtime identity changed/);}finally{mock.mockRestore();}
}));
it('does not reuse a runtime file with a hard link outside its cohort',()=>fixture(async f=>{
 const first=await f.cache.prepare('linux','x64');await link(first.executable,join(f.root,'generated-external-link'));
 const second=await f.cache.prepare('linux','x64');expect(second.cached).toBe(false);expect(second.directory).not.toBe(first.directory);
}));

it('rechecks cached cohort identity after the final asynchronous root authority check',()=>fixture(async f=>{
 const first=await f.cache.prepare('linux','x64');let calls=0;
 f.authority.mockImplementation(async()=>{if(++calls!==4)return;await files.rename(first.directory,first.directory+'-previous');await mkdir(first.directory);await mkdir(join(first.directory,'engine'));await writeFile(first.executable,'unverified replacement');});
 await expect(f.cache.prepare('linux','x64')).rejects.toThrow(/Verified runtime identity changed/);
}));
