import {mkdtemp,rm,chmod,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it,vi} from 'vitest';
import {assistantNativeRoot} from './AssistantNativeRoot.js';
const options=()=>({signal:new AbortController().signal,expires:performance.now()+10000,check:()=>{}});
it('does no discovery or creation when the authority check synchronously aborts',async()=>{
 const controller=new AbortController(),run=vi.fn();await expect(assistantNativeRoot({...options(),signal:controller.signal,check:()=>controller.abort()},{platform:'win32',run})).rejects.toThrow();expect(run).not.toHaveBeenCalled();
});
it.skipIf(process.platform==='win32')('owns only a private generated POSIX root and rejects replacement',async()=>{
 const home=await mkdtemp(join(tmpdir(),'soda-assistant-root-'));
 try{const host=await assistantNativeRoot(options(),{platform:'linux',env:{},home:()=>home});expect(host.platform).toBe('linux');await host.root.assert();await rename(host.root.path,host.root.path+'-previous');await mkdir(host.root.path);await expect(host.root.assert()).rejects.toThrow(/変わりました/);}
 finally{await rm(home,{recursive:true,force:true});}
});
it.skipIf(process.platform==='win32')('refuses a writable shared ancestor below the generated home',async()=>{
 const home=await mkdtemp(join(tmpdir(),'soda-assistant-root-mode-'));try{await mkdir(join(home,'.cache'),{mode:0o777});await chmod(join(home,'.cache'),0o777);await expect(assistantNativeRoot(options(),{platform:'linux',env:{},home:()=>home})).rejects.toThrow(/専用/);}finally{await rm(home,{recursive:true,force:true});}
});
it('WSL uses a fixed native system executable, bounded JSON and owned path conversion',async()=>{
 const root=await mkdtemp(join(tmpdir(),'soda-assistant-root-wsl-'));const native='C:\\Users\\generated\\AppData\\Local\\Sodashitsu-Assistant-Host';
 const run=vi.fn(async(command:string,args:readonly string[])=>command==='/usr/bin/wslpath'?(args[0]==='-u'?root:native):JSON.stringify({path:native,arch:'x64'}));
 try{const host=await assistantNativeRoot(options(),{platform:'linux',env:{WSL_DISTRO_NAME:'generated'},run});expect(host.platform).toBe('win32');await host.root.assert();expect(await host.nativePath(root)).toBe(native);const launch=run.mock.calls.find(([command])=>command.includes('powershell'));expect(launch?.[0]).toBe('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');expect(launch?.[1]).not.toContain('Bypass');const source=Buffer.from(launch![1][4]!,'base64').toString('utf16le');expect(source).toContain('Test-SodaEndpointAcl');}
 finally{await rm(root,{recursive:true,force:true});}
});

it('rechecks abort after the final authorization callback before starting a native child',async()=>{
 const controller=new AbortController(),run=vi.fn();let checks=0;
 await expect(assistantNativeRoot({...options(),signal:controller.signal,check:()=>{if(++checks===4)controller.abort();}},{platform:'win32',env:{SystemRoot:'C:\\Windows'},run})).rejects.toThrow();
 expect(checks).toBe(4);expect(run).not.toHaveBeenCalled();
});
