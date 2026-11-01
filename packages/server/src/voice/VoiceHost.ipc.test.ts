import {expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const fixture=vi.hoisted(()=>({instances:[] as Array<{close:ReturnType<typeof vi.fn>;finish:()=>void}>}));
vi.mock('./VoiceResident.js',()=>({VoiceResidentService:class{
 start=vi.fn(async()=>{});finish!:()=>void;close=vi.fn(()=>new Promise<void>(resolve=>{this.finish=resolve;}));
 constructor(){fixture.instances.push(this);}
}}));
import {VoiceHost,writeVoiceConfig,VoiceConfig} from './VoiceHost.js';
it('drains the same IPC shutdown when replacement and server close race',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'voice-stop-')),host=new VoiceHost(dir);
 try{
  await writeVoiceConfig(dir,VoiceConfig.parse({enabled:true,transport:'ipc',python:'/python',runtimeDir:'/one'}));host.start();await vi.waitFor(()=>expect(fixture.instances).toHaveLength(1));
  await writeVoiceConfig(dir,VoiceConfig.parse({enabled:true,transport:'ipc',python:'/python',runtimeDir:'/two'}));
  await vi.waitFor(()=>expect(fixture.instances[0]!.close).toHaveBeenCalled(),{timeout:4000});
  let done=false;const closing=host.close().then(()=>{done=true;});await new Promise(resolve=>setImmediate(resolve));expect(done).toBe(false);
  fixture.instances[0]!.finish();await closing;expect(fixture.instances).toHaveLength(1);
 }finally{fixture.instances[0]?.finish?.();await host.close();await rm(dir,{recursive:true,force:true});}
});
