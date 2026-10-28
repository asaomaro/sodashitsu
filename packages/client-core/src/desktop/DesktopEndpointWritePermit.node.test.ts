import {mkdtemp,mkdir,chmod,readdir,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {DesktopEndpointStore} from './DesktopEndpointStore.node.js';
const roots:string[]=[];afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'soda-finite-write-'));roots.push(root);const stateDir=join(root,'state');await mkdir(stateDir,{mode:0o700});await chmod(root,0o700);let active=true,hook:(()=>void)|undefined;
 const protector={mode:(process.platform==='win32'?'dpapi-user':'owner-file') as 'dpapi-user'|'owner-file',protect:vi.fn(async(bytes:Uint8Array)=>Uint8Array.from(bytes)),unprotect:vi.fn(async(bytes:Uint8Array)=>Uint8Array.from(bytes))};
 const store=new DesktopEndpointStore({stateDir,protector,writeAllowed:()=>{hook?.();return active;},...(process.platform==='win32'?{checkWindowsPath:async()=>{},commitWindowsVault:rename}:{})});return {store,protector,stateDir,lose:()=>{active=false;},hook:(value:()=>void)=>{hook=value;}};
}
it('does not create an identity directory without a current write lease',async()=>{const f=await fixture();f.lose();await expect(f.store.initialize()).rejects.toThrow();await f.store.settled();expect(await readdir(f.stateDir)).toEqual([]);f.store.close();});
it('never commits a key after the lease expires during protection',async()=>{const f=await fixture();f.protector.protect.mockImplementation(async bytes=>{f.lose();return Uint8Array.from(bytes);});await expect(f.store.initialize()).rejects.toThrow();await f.store.settled();expect(await readdir(f.store.directory)).toEqual([]);f.store.close();});
it('rechecks a reentrant close from the authorization callback',async()=>{const f=await fixture();f.hook(()=>f.store.close());await expect(f.store.initialize()).rejects.toThrow();await f.store.settled();expect(await readdir(f.stateDir)).toEqual([]);});
it('preserves an existing identity when a later trust write loses permission',async()=>{const f=await fixture(),initial=await f.store.initialize();f.protector.protect.mockImplementation(async bytes=>{f.lose();return Uint8Array.from(bytes);});await expect(f.store.trust({fingerprint:'a'.repeat(64),role:'viewer',label:'generated'})).rejects.toThrow();expect(await f.store.status()).toMatchObject({initialized:true,fingerprint:initial.fingerprint,peers:[]});f.store.close();await f.store.settled();});
