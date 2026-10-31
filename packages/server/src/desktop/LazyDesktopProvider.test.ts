import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {LazyDesktopProvider} from './LazyDesktopProvider.js';
import type {DesktopProviderApi} from './DesktopProvider.js';
import {DesktopTransferStore} from './DesktopTransferStore.js';
const config={command:['generated'],allowInput:false,origins:()=>[]};
function fake(){
 let epoch=0;const start=vi.fn(async()=>({started:true as const}));
 const provider={get epoch(){return epoch;},start,requireEndpoint:vi.fn(()=>{epoch++;}),endpointScope:vi.fn((_origin:string,active:()=>boolean)=>({active,start:async()=>{if(!active())throw Error('expired');return start();},release:vi.fn(),close:vi.fn()})),configure:vi.fn(),enableSavedTransfers:vi.fn(),clientGone:vi.fn(),dispose:vi.fn(),resumeUnlockLease:vi.fn(),resumeSavedTransfers:vi.fn(),suspendSavedTransfers:vi.fn(async()=>{})};
 return{provider:provider as unknown as DesktopProviderApi,start};
}
it('keeps disabled metadata, saved-store declaration, endpoint policy and shutdown free of provider loading',async()=>{
 const load=vi.fn();const provider=new LazyDesktopProvider(undefined,load);
 provider.configure(undefined);provider.enableSavedTransfers('/generated/saved','generated');provider.clientGone('owner');provider.capabilities();provider.endpointScope('http://127.0.0.1:7780',()=>true).close();
 await provider.settleSavedTransfers();await provider.suspendSavedTransfers();provider.dispose(true);provider.resumeSavedTransfers();provider.resumeUnlockLease();expect(load).not.toHaveBeenCalled();
 await expect(provider.start('owner',{} as never)).rejects.toThrow('disabled');expect(load).not.toHaveBeenCalled();
});
it.each(['clientGone','release','scopeClose','disable','dispose','suspend'] as const)('cancels a held first load on %s',async(action)=>{
 const {provider:core,start}=fake(),create=vi.fn(()=>core);let release!:(value:typeof create)=>void;
 const load=vi.fn(()=>new Promise<typeof create>(yes=>{release=yes;}));const provider=new LazyDesktopProvider(config,load);
 const scope=provider.endpointScope('http://127.0.0.1:7780',()=>true);
 const starting=(['release','scopeClose'].includes(action)?scope.start('owner',{} as never):provider.start('owner',{} as never));const refused=expect(starting).rejects.toThrow();
 if(action==='clientGone')provider.clientGone('owner');if(action==='release')scope.release('owner');if(action==='scopeClose')scope.close();if(action==='disable')provider.configure(undefined);if(action==='dispose')provider.dispose();const suspended=action==='suspend'?provider.suspendSavedTransfers():undefined;
 release(create);await refused;await suspended;expect(start).not.toHaveBeenCalled();scope.close();provider.dispose();
});
it('keeps the cold encrypted root epoch stable through endpoint-only initialization',async()=>{
 const {provider:core,start}=fake();const provider=new LazyDesktopProvider(config,async()=>()=>core);
 provider.requireEndpoint(true);const epoch=provider.epoch;const scope=provider.endpointScope('http://127.0.0.1:7780',()=>provider.epoch===epoch);
 expect(await scope.start('owner',{} as never)).toEqual({started:true});expect(provider.epoch).toBe(epoch);expect(start).toHaveBeenCalledOnce();scope.close();provider.dispose();
});
it('invalidates durable checkpoints with the same binding before loading the desktop implementation',async()=>{
 const base=await realpath(await mkdtemp(join(process.platform==='win32'?process.env.LOCALAPPDATA!:tmpdir(),'soda-lazy-policy-'))),directory=join(base,'saved'),binding='generated-settings';
 const scope=createHash('sha256').update(JSON.stringify({settings:binding,endpointOnly:false})).digest('hex');
 const old=new DesktopTransferStore({directory,binding:scope}),load=vi.fn(),provider=new LazyDesktopProvider(undefined,load);
 try{const before=await old.generation();provider.enableSavedTransfers(directory,binding);await provider.invalidateSavedTransfers();await provider.bindSavedTransfers(binding);await provider.settleSavedTransfers();
  const current=new DesktopTransferStore({directory,binding:scope});expect(await current.generation()).not.toBe(before);expect(load).not.toHaveBeenCalled();await current.settled();
 }finally{await provider.suspendSavedTransfers();provider.dispose(true);await old.settled();await rm(base,{recursive:true,force:true});}
},process.platform==='win32'?120000:10000);
it('cold dispose invalidates persisted generations before any subsequent use',async()=>{
 const base=await realpath(await mkdtemp(join(process.platform==='win32'?process.env.LOCALAPPDATA!:tmpdir(),'soda-lazy-dispose-'))),directory=join(base,'saved'),binding='generated-settings';
 const scope=createHash('sha256').update(JSON.stringify({settings:binding,endpointOnly:false})).digest('hex');
 const old=new DesktopTransferStore({directory,binding:scope}),load=vi.fn(),provider=new LazyDesktopProvider(undefined,load);
 try{const before=await old.generation();provider.enableSavedTransfers(directory,binding);provider.dispose();await provider.settleSavedTransfers();
  const current=new DesktopTransferStore({directory,binding:scope});expect(await current.generation()).not.toBe(before);expect(load).not.toHaveBeenCalled();await current.settled();
 }finally{await provider.suspendSavedTransfers();provider.dispose(true);await old.settled();await rm(base,{recursive:true,force:true});}
},process.platform==='win32'?120000:10000);
it('drains both cold registries after a policy failure, including a held retirement',async()=>{
 const {open,writeFile}=await import('node:fs/promises');const base=await mkdtemp(join(tmpdir(),'soda-lazy-drain-'));await writeFile(join(base,'owned'),'generated');const fd=await open(join(base,'owned'),'r');
 let release!:()=>void,retire!:()=>void;const held=new Promise<void>(yes=>{release=yes;}),closing=new Promise<void>(yes=>{retire=yes;});
 const files={invalidate:vi.fn(async()=>{throw Error('generated policy failure');}),freeze:vi.fn(),suspend:vi.fn(async()=>{})};
 const folders={invalidate:vi.fn(()=>held),freeze:vi.fn(),suspend:vi.fn(async()=>{await closing;await fd.close();})};
 const provider=new LazyDesktopProvider(undefined,vi.fn());provider.enableSavedTransfers(join(base,'saved'),'generated');
 (provider as unknown as{state:unknown}).state={files,folders};
 let invalidated=false,drained=false;const invalidating=provider.invalidateSavedTransfers().finally(()=>{invalidated=true;});const refused=expect(invalidating).rejects.toThrow();
 await vi.waitFor(()=>expect(folders.invalidate).toHaveBeenCalled());const suspension=provider.suspendSavedTransfers().finally(()=>{drained=true;});const drainFailure=expect(suspension).rejects.toThrow();
 try{await new Promise(r=>setTimeout(r,10));expect(invalidated).toBe(false);expect(drained).toBe(false);release();await refused;await vi.waitFor(()=>expect(folders.suspend).toHaveBeenCalled());expect(drained).toBe(false);retire();await drainFailure;expect(files.suspend).toHaveBeenCalledOnce();}
 finally{release();retire();await invalidating.catch(()=>{});await suspension.catch(()=>{});await fd.close().catch(()=>{});await rm(base,{recursive:true,force:true});}
});
it('keeps a failed invalidation blocked instead of authorizing a later successful bind',async()=>{
 const registry=()=>({invalidate:vi.fn(async()=>{}),bind:vi.fn(async()=>{}),freeze:vi.fn(),resume:vi.fn(),suspend:vi.fn(async()=>{})});
 const files=registry(),folders=registry();folders.invalidate.mockRejectedValue(Error('generated storage failure'));
 const provider=new LazyDesktopProvider(undefined,vi.fn());provider.enableSavedTransfers('/generated/saved','generated');
 (provider as unknown as{state:unknown}).state={files,folders};
 await expect(provider.invalidateSavedTransfers()).rejects.toThrow();await expect(provider.bindSavedTransfers()).rejects.toThrow();expect(files.bind).not.toHaveBeenCalled();expect(folders.bind).not.toHaveBeenCalled();
 folders.invalidate.mockResolvedValue();await provider.invalidateSavedTransfers();await provider.bindSavedTransfers();expect(files.bind).toHaveBeenCalledOnce();expect(folders.bind).toHaveBeenCalledOnce();await provider.suspendSavedTransfers();provider.dispose(true);
});
