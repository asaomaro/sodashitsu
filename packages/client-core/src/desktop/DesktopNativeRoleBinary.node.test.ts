import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,lstat,rename,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,win32} from 'node:path';
import {createHash} from 'node:crypto';
const fixture=vi.hoisted(()=>({run:vi.fn()}));vi.mock('./DesktopOwnedChild.node.js',()=>({desktopOwnedChild:fixture.run}));
import {DesktopNativeRoleBinary,type DesktopNativeRole} from './DesktopNativeRoleBinary.node.js';
import {DesktopNativeBinary} from './DesktopNativeBinary.node.js';
import {DesktopAudioPipeBinary} from './DesktopAudioPipeBinary.node.js';
const clean:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();fixture.run.mockReset();});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function setup(role:DesktopNativeRole='copy',mode='success'){
 const root=await mkdtemp(join(tmpdir(),'soda-common-role-')),directory=join(root,'host'),id='b'.repeat(32),roleDirectory=join(directory,'role-'+id),binary=join(directory,'soda-native-host.exe'),module=join(roleDirectory,role+'.dll');
 await mkdir(roleDirectory,{recursive:true});await writeFile(binary,'generated host');await writeFile(module,'generated role');clean.push(()=>rm(root,{recursive:true,force:true}));
 const windows=String.raw`C:\Users\generated\AppData\Local\Sodashitsu-Native-Host`+'\\'+'a'.repeat(32)+'\\host-'+'c'.repeat(32);
 const prefix=['--role',role,'--module',id,'--sha256',sha('generated role')];
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),admitted=new Promise<void>(r=>entered=r);
 fixture.run.mockImplementation(async(command:string,args:readonly string[],input:string)=>{
  if(command==='/usr/bin/wslpath')return args[0]==='-w'?String.raw`C:\fixed\sdk`:directory;
  if(command.endsWith('powershell.exe')){
   const request=JSON.parse(input);expect(request.role).toBe(role);
   if(request.operation==='host')return JSON.stringify({directory:mode==='bad-path'?'C:\\unexpected':windows,binary:win32.join(windows,'soda-native-host.exe'),sha256:sha(mode==='bad-host'?'changed':'generated host')});
   expect(request).toMatchObject({expectedHost:'c'.repeat(32),expectedHash:sha('generated host')});
   if(mode==='delayed'){entered();await gate;}
   return JSON.stringify({directory:win32.join(windows,'role-'+id),binary:win32.join(windows,'soda-native-host.exe'),sha256:sha(mode==='bad-module'?'changed':'generated role'),hostSha256:sha('generated host')});
  }
  if(command===binary){expect(args).toEqual([...prefix,'--preflight']);return mode==='bad-preflight'?'wrong product':({'user-audio':'soda-user-audio-preflight-v1',copy:'soda-native-copy-preflight-v1',audio:'soda-audio-pipe-preflight-v1',selection:'soda-explorer-selection-preflight-v1'}[role]);}
  throw Error('Unexpected program in generated fixture');
 });
 const product=role==='copy'?new DesktopNativeBinary('linux',{WSL_DISTRO_NAME:'generated'}):role==='audio'?new DesktopAudioPipeBinary('linux',{WSL_DISTRO_NAME:'generated'}):new DesktopNativeRoleBinary(role,'linux',{WSL_DISTRO_NAME:'generated'});
 return {product,root,directory,roleDirectory,binary,module,prefix,release,admitted};
}
for(const role of ['copy','audio','selection','user-audio'] as const)it(`prepares only ${role}, uses the mounted common host and retains the shared executable`,async()=>{
 const f=await setup(role);expect(fixture.run).not.toHaveBeenCalled();expect(()=>f.product.executable).toThrow('準備');await f.product.prepare();expect(f.product.executable).toBe(f.binary);expect(f.product.arguments).toEqual(f.prefix);await f.product.close();await expect(lstat(f.roleDirectory)).rejects.toMatchObject({code:'ENOENT'});expect((await lstat(f.binary)).isFile()).toBe(true);
});
for(const [mode,message] of [['bad-path','準備結果'],['bad-host','確認'],['bad-module','変更'],['bad-preflight','事前']])it(`rejects ${mode} before exposing a role`,async()=>{
 const f=await setup('copy',mode);await expect(f.product.prepare()).rejects.toThrow(message);expect(()=>f.product.executable).toThrow('準備');if(mode==='bad-module'||mode==='bad-preflight')await f.product.close();expect(fixture.run.mock.calls.filter(([command])=>command===f.binary).length).toBe(mode==='bad-preflight'?1:0);
});
it('stops preparation immediately but waits for its owned builder before cleaning, without launching preflight',async()=>{
 const f=await setup('selection','delayed'),preparing=f.product.prepare();await f.admitted;let closed=false;const closing=f.product.close().then(()=>closed=true);await Promise.resolve();expect(closed).toBe(false);f.release();await preparing;await closing;expect(fixture.run.mock.calls.some(([command])=>command===f.binary)).toBe(false);await expect(lstat(f.roleDirectory)).rejects.toMatchObject({code:'ENOENT'});
});
it('retiring preparation alone keeps the module until the role owner has physically closed',async()=>{
 const f=await setup();await f.product.prepare();await f.product.retirePreparation();expect((await lstat(f.module)).isFile()).toBe(true);expect(()=>f.product.arguments).toThrow('準備');await f.product.close();await expect(lstat(f.module)).rejects.toMatchObject({code:'ENOENT'});
});
for(const replaced of ['module','directory','extra','hardlink'])it(`refuses cleanup of changed ownership (${replaced})`,async()=>{
 const f=await setup();await f.product.prepare();
 if(replaced==='module'){const other=join(f.root,'other');await writeFile(other,'other');await rename(other,f.module);}
 if(replaced==='directory'){await rename(f.roleDirectory,f.roleDirectory+'-old');await mkdir(f.roleDirectory);await writeFile(f.module,'other');}
 if(replaced==='extra')await writeFile(join(f.roleDirectory,'other'),'other');
 if(replaced==='hardlink')await link(f.module,join(f.root,'alias'));
 await expect(f.product.close()).rejects.toThrow('変更');expect((await lstat(f.module)).isFile()).toBe(true);
});
it('rejects non-Windows hosts and unknown roles without starting any process',async()=>{
 await expect(new DesktopNativeRoleBinary('copy','linux',{}).prepare()).rejects.toThrow('Windows');expect(()=>new DesktopNativeRoleBinary('unknown' as DesktopNativeRole)).toThrow('Unknown');expect(fixture.run).not.toHaveBeenCalled();
});

it('shares one physical retirement and cleanup for concurrent close calls',async()=>{
 const f=await setup();await f.product.prepare();const first=f.product.close(),second=f.product.close();expect(second).toBe(first);await Promise.all([first,second]);await expect(lstat(f.roleDirectory)).rejects.toMatchObject({code:'ENOENT'});expect((await lstat(f.binary)).isFile()).toBe(true);
});
