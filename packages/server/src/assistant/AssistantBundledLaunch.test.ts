import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {bundledAssistantLaunch} from './AssistantBundledLaunch.js';
import {AssistantLaunchController} from './AssistantLaunchController.js';
it('on WSL launches the mounted executable while passing the app as a Windows path',async()=>{
 const root={path:'/generated/private',assert:vi.fn(async()=>{})},runtime={prepare:vi.fn(async()=>({directory:'/mnt/c/generated/runtime',executable:'/mnt/c/generated/runtime/electron.exe',relativeDirectory:'generated',variant:{} as never,cached:true})),dispose:vi.fn(async()=>{})};
 const launch=await bundledAssistantLaunch('http://127.0.0.1:7780',new AbortController().signal,()=>{},{root:async()=>({root,platform:'win32',arch:'x64',nativePath:async()=> 'C:\\generated\\app'}),runtime:()=>runtime,app:async()=>'/mnt/c/generated/app'});
 expect(launch.command).toEqual(['/mnt/c/generated/runtime/electron.exe','C:\\generated\\app']);expect(runtime.dispose).toHaveBeenCalledOnce();
});
it('aborted authorization never resolves a root, downloads or starts a process',async()=>{
 const controller=new AbortController(),root=vi.fn();await expect(bundledAssistantLaunch('http://127.0.0.1:7780',controller.signal,()=>controller.abort(),{root})).rejects.toThrow();expect(root).not.toHaveBeenCalled();
});
it('enable to attached to disable uses one real generated child and closes it without a GUI/runtime',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-assistant-integrated-')),program=join(dir,'generated.mjs');const id='00000000-0000-4000-8000-000000000001';
 await writeFile(program,'process.stdin.once("data",()=>process.stdout.write(JSON.stringify({type:"attached",deviceId:'+JSON.stringify(id)+'})+"\\n"));process.stdin.on("end",()=>process.exit(0));process.stdin.resume();');
 const root={path:dir,assert:vi.fn(async()=>{})},prepare=vi.fn(async()=>({directory:dir,executable:process.execPath,relativeDirectory:'generated',variant:{} as never,cached:false})),dispose=vi.fn(async()=>{}),resolve=vi.fn((origin:string,signal:AbortSignal,check:()=>void)=>bundledAssistantLaunch(origin,signal,check,{root:async()=>({root,platform:'linux',arch:'x64',nativePath:async path=>path}),runtime:()=>({prepare,dispose}),app:async()=>program}));
 const activate=vi.fn(),stop=vi.fn(async()=>{}),owner=new AssistantLaunchController(dir,{},()=> 'http://127.0.0.1:7780',vi.fn(),undefined,undefined,{activate,requestStop:stop},undefined,resolve);
 try{owner.start();await(owner as unknown as{queue:Promise<void>}).queue;expect(resolve).not.toHaveBeenCalled();await owner.setEnabled(true);await vi.waitFor(()=>expect(activate).toHaveBeenCalledWith(id));expect((await owner.status()).phase).toBe('running');await owner.setEnabled(false);await(owner as unknown as{queue:Promise<void>}).queue;expect((await owner.status()).phase).toBe('disabled');expect(stop).toHaveBeenCalledWith(id);expect(prepare).toHaveBeenCalledOnce();expect(dispose).toHaveBeenCalledOnce();}
 finally{await owner.stop();await rm(dir,{recursive:true,force:true});}
});
it('rejects cancellation while the last preparation owner is retiring',async()=>{
 const controller=new AbortController(),root={path:'/generated/private',assert:async()=>{}};
 await expect(bundledAssistantLaunch('http://127.0.0.1:7780',controller.signal,()=>{},{root:async()=>({root,platform:'linux',arch:'x64',nativePath:async path=>path}),runtime:()=>({prepare:async()=>({directory:'generated',executable:'generated',relativeDirectory:'generated',variant:{} as never,cached:true}),dispose:async()=>{controller.abort();}}),app:async()=>'/generated/app'})).rejects.toThrow();
});
