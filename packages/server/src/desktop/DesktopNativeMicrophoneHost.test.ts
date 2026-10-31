import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {expect,it,vi} from 'vitest';
import {DesktopNativeMicrophoneHost} from './DesktopNativeMicrophoneHost.js';
import {DesktopNativePcmPaths,desktopNativePcmRoot} from './DesktopNativePcmPath.js';
it.skipIf(process.platform==='win32')('starts only on open, keeps one owned worker, and retires it before reusing the slot',async()=>{
 const dir=await mkdtemp(join(desktopNativePcmRoot(),'soda-microphone-host-')),program=join(dir,'generated.mjs');
 await writeFile(program,'process.stdin.on("data",()=>{});process.stdin.on("end",()=>process.exit(0));process.stdin.resume();');
 const launched:ReturnType<typeof spawn>[]=[];const launch=vi.fn((...args:Parameters<typeof spawn>)=>{const child=spawn(...args);launched.push(child);return child;}) as unknown as typeof spawn;
 const host=new DesktopNativeMicrophoneHost(new DesktopNativePcmPaths({root:dir}),launch,()=>[process.execPath,program]);
 try{await host.close();expect(launch).not.toHaveBeenCalled();const lease=await host.open('linux-portal','generated-virtual-output','SodaDesktopMicrophone-'+'a'.repeat(32),()=>true);
  await expect(host.open('linux-portal','generated-virtual-output','SodaDesktopMicrophone-'+'b'.repeat(32),()=>true)).rejects.toThrow();expect(launched).toHaveLength(1);
  await host.suspend();await lease.close();expect(launched[0]!.exitCode).toBe(0);await expect(host.open('linux-portal','generated-virtual-output','SodaDesktopMicrophone-'+'b'.repeat(32),()=>true)).rejects.toThrow();host.resume();const next=await host.open('linux-portal','generated-virtual-output','SodaDesktopMicrophone-'+'c'.repeat(32),()=>true);await next.close();expect(launched[1]!.exitCode).toBe(0);
 }finally{await host.close();await rm(dir,{recursive:true,force:true});}
});
it('rejects absent permissions and arbitrary names before resolving commands or spawning',async()=>{
 const launch=vi.fn(),command=vi.fn();const host=new DesktopNativeMicrophoneHost(undefined,launch as unknown as typeof spawn,command);
 await expect(host.open('linux-portal','virtual','SodaDesktopMicrophone-'+'a'.repeat(32),()=>false)).rejects.toThrow();await expect(host.open('linux-portal','virtual','arbitrary',()=>true)).rejects.toThrow();expect(command).not.toHaveBeenCalled();expect(launch).not.toHaveBeenCalled();await host.close();
});
it.skipIf(process.platform==='win32')('rechecks cancellation after private path creation and drains the actual child',async()=>{
 const dir=await mkdtemp(join(desktopNativePcmRoot(),'soda-microphone-cancel-')),program=join(dir,'generated.mjs');await writeFile(program,'process.stdin.on("end",()=>process.exit(0));process.stdin.resume();');
 let active=true;const paths=new DesktopNativePcmPaths({root:dir}),create=paths.create.bind(paths);vi.spyOn(paths,'create').mockImplementation(async(...args)=>{const path=await create(...args);active=false;return path;});
 const children:ReturnType<typeof spawn>[]=[];const launch=((...args:Parameters<typeof spawn>)=>{const child=spawn(...args);children.push(child);return child;}) as typeof spawn;
 const host=new DesktopNativeMicrophoneHost(paths,launch,()=>[process.execPath,program]);
 try{await expect(host.open('linux-portal','virtual','SodaDesktopMicrophone-'+'a'.repeat(32),()=>active)).rejects.toThrow();expect(children[0]!.exitCode).toBe(0);expect(paths.pending).toBe(0);}finally{await host.close();await rm(dir,{recursive:true,force:true});}
});

it('retains the physical slot when termination cannot be confirmed',async()=>{
 vi.useFakeTimers();
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),exitCode:null,signalCode:null,kill:vi.fn(()=>false)});
 const paths=new DesktopNativePcmPaths();vi.spyOn(paths,'create').mockResolvedValue({path:'/generated/pcm',verify:async()=>{},retire:async()=>{}} as any);
 const launch=vi.fn(()=>child),host=new DesktopNativeMicrophoneHost(paths,launch as any,()=>['generated']);
 try{
  const lease=await host.open('linux-portal','virtual','SodaDesktopMicrophone-'+'a'.repeat(32),()=>true);
  const stopped=expect(lease.close()).rejects.toThrow('retirement not confirmed');await vi.advanceTimersByTimeAsync(5001);await stopped;
  expect(child.kill).toHaveBeenCalledTimes(2);
  await expect(host.open('linux-portal','virtual','SodaDesktopMicrophone-'+'b'.repeat(32),()=>true)).rejects.toThrow();expect(launch).toHaveBeenCalledTimes(1);
 }finally{child.emit('close');vi.useRealTimers();}
});
