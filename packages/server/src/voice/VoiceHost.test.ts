import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import type {spawn} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it,vi} from "vitest";
import {VoiceHost,VoiceConfig,readVoiceConfig,writeVoiceConfig} from "./VoiceHost.js";
it("persists a version-independent runtime selection and rejects injected options",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-voice-"));
 try{expect(await readVoiceConfig(dir)).toBeNull();await writeVoiceConfig(dir,VoiceConfig.parse({enabled:true,python:"/usr/bin/python3",runtimeDir:"/runtime-v1",port:50022,threads:2}));expect(await readVoiceConfig(dir)).toMatchObject({runtimeDir:"/runtime-v1"});
 await writeFile(join(dir,"voice-core.json"),JSON.stringify({enabled:true,python:"relative",runtimeDir:"/x",command:"arbitrary"}));await expect(readVoiceConfig(dir)).rejects.toThrow();}
 finally{await rm(dir,{recursive:true,force:true});}
});
it("drains the same stopping child when shutdown races a runtime replacement",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-voice-race-"));
 const children:Array<EventEmitter&{stdout:PassThrough;stderr:PassThrough;kill:ReturnType<typeof vi.fn>}>=[];
 const launch=vi.fn(()=>{const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>true)});children.push(child);return child;});
 const host=new VoiceHost(dir,vi.fn(),launch as unknown as typeof spawn);
 try{
 await writeVoiceConfig(dir,VoiceConfig.parse({enabled:true,python:"/usr/bin/python3",runtimeDir:"/runtime-v1",port:50022,threads:2}));host.start();await vi.waitFor(()=>expect(children).toHaveLength(1));
 children[0]!.stdout.write('{"ready": true}\n');
 await writeVoiceConfig(dir,VoiceConfig.parse({enabled:true,python:"/usr/bin/python3",runtimeDir:"/runtime-v2",port:50022,threads:2}));
 await vi.waitFor(()=>expect(children[0]!.kill).toHaveBeenCalled(),{timeout:4000});
 let done=false;const closing=host.close().then(()=>{done=true;});await new Promise(r=>setImmediate(r));expect(done).toBe(false);
 children[0]!.emit("close",0);await closing;expect(children).toHaveLength(1);
 }finally{for(const child of children)child.emit("close",0);await host.close();await rm(dir,{recursive:true,force:true});}
});
