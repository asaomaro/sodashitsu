import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {it,expect,vi} from 'vitest';
import {DesktopProvider} from './DesktopProvider.js';
import {DesktopResourceChannel} from './DesktopResourceChannel.js';
import type {DesktopHelper} from './DesktopSharedCapture.js';
class Child extends EventEmitter implements DesktopHelper {
 stdout=new PassThrough();stderr=new PassThrough();stdin=new Writable({write:(_c,_e,done)=>done()});exitCode:number|null=null;signalCode=null;
 kill=vi.fn(()=>{this.exitCode=1;this.emit('close',1,null);return true;});
 send(value:unknown){this.stdout.write(JSON.stringify(value)+'\n');}
}
it.each(['known','missing','unknown','old-source'] as const)('real Provider teardown waits for exact terminal proof after notice (%s)', async kind=>{
 const provider=new DesktopProvider({command:['unused'],allowInput:true,origins:()=>[]}),p=provider as any,child=new Child();
 const channel=new DesktopResourceChannel(child,{ack:(source,id)=>p.resources.acknowledge(source,id),close:source=>p.resources.sourceGone(source)});
 const ws=Object.assign(new EventEmitter(),{close:vi.fn(),terminate:vi.fn()});
 const share={dead:false,resourcesManaged:true,process:channel,inputAcks:{invalidatePointers:vi.fn()},clipboardPending:new Map(),ws};
 vi.spyOn(p.companion,'end').mockImplementation(()=>{});vi.spyOn(p,'pruneSources').mockImplementation(()=>{});
 channel.stdout.on('data',raw=>{for(const line of String(raw).trim().split('\n'))if(JSON.parse(line).type==='protected_desktop_failure')p.stop(share);});
 try {
  child.send({type:'ready',resourceFences:true});
  for(const resource of ['control','clipboard','microphone'])expect(p.resources.acquire(share,channel,resource)).toBe(true);
  const epochs=['control','clipboard','microphone'].map(r=>p.resources.identity(share,r).epoch);
  child.send({type:'protected_desktop_failure',code:'source_changed'});
  expect(share.dead).toBe(true);expect(p.resources.faulted).toBe(false);expect(channel.fencing).toBe(true);
  if(kind==='known')for(const epoch of epochs)child.send({type:'resource_fence_ack',id:epoch,terminal:true});
  if(kind==='unknown')child.send({type:'resource_fence_ack',id:randomUUID(),terminal:true});
  if(kind==='old-source'){
   const old=new Child(),oldChannel=new DesktopResourceChannel(old,{ack:(s,id)=>p.resources.acknowledge(s,id),close:()=>{}});
   old.send({type:'ready',resourceFences:true});oldChannel.begin(epochs[0]);oldChannel.fence(randomUUID());old.send({type:'resource_fence_ack',id:epochs[0],terminal:true});oldChannel.kill();
  }
  child.kill();
  expect(p.resources.faulted).toBe(kind!=='known');
  if(kind==='known'){const freshChild=new Child(),fresh=new DesktopResourceChannel(freshChild,{ack:()=>{},close:()=>{}});freshChild.send({type:'ready',resourceFences:true});expect(p.resources.acquire({},fresh,'control')).toBe(true);freshChild.send({type:'resource_fence_ack',id:[...(fresh as any).epochs.values()][0],terminal:true});p.resources.sourceGone(fresh);fresh.kill();}
 } finally {provider.dispose();}
});
