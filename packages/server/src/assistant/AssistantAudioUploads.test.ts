import {mkdtemp,readFile,rm,readdir,mkdir,writeFile,truncate,lstat,unlink} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {existsSync,statSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect,it,vi} from "vitest";
import {AssistantAudioUploads} from "./AssistantAudioUploads.js";
import type {sendCodexAudio} from "./CodexAudio.js";
const deviceId="00000000-0000-4000-8000-000000000001",instanceId="00000000-0000-4000-8000-000000000002";
const target={instanceId,paneId:"00000000-0000-4000-8000-000000000003",threadId:"00000000-0000-4000-8000-000000000004",projectDir:"/generated"};
const begin={deviceId,instanceId,mime:"audio/wav",size:4,ttlMs:300000};
const chunk=(id:string,offset=0,data=Buffer.from([1,2,3,4]))=>({uploadId:id,offset,data:data.toString("base64")});
async function fixture(send=vi.fn<typeof sendCodexAudio>(async()=>({turnId:"generated"}))) {
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-audio-"));
 const uploads=new AssistantAudioUploads(dir,{send});
 return{dir,uploads,send,close:async()=>{await uploads.close();await rm(dir,{recursive:true,force:true});}};
}
it("writes only the declared reviewed bytes to a server-owned path on explicit commit",async()=>{
 const f=await fixture();
 f.send.mockImplementation(async(value)=>{expect([...await readFile(value.path)]).toEqual([1,2,3,4]);return{turnId:"generated"};});
 try {
  const {uploadId}=f.uploads.begin("owner",begin,()=>target);
  f.uploads.chunk("owner",chunk(uploadId));expect(f.send).not.toHaveBeenCalled();
  expect(await f.uploads.commit("owner",{uploadId})).toEqual({sent:true,turnId:"generated"});
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.send.mock.calls[0]![0].path).toBe(join(f.dir,"assistant-audio",`${uploadId}.wav`));
 } finally{await f.close();}
});
it("isolates ownership, validates offset/size/base64, and refuses incomplete commit",async()=>{
 const f=await fixture();
 try {
  const {uploadId}=f.uploads.begin("owner",begin,()=>target);
  expect(()=>f.uploads.chunk("other",chunk(uploadId))).toThrow();f.uploads.cancel("other",{uploadId});
  expect(()=>f.uploads.chunk("owner",chunk(uploadId,1))).toThrow();
  expect(()=>f.uploads.chunk("owner",chunk(uploadId,0,Buffer.alloc(5)))).toThrow();
  expect(()=>f.uploads.commit("owner",{uploadId})).toThrow();
  f.uploads.chunk("owner",chunk(uploadId));await f.uploads.commit("owner",{uploadId});expect(f.send).toHaveBeenCalledOnce();
 } finally{await f.close();}
});
it("cancellation and expiry never send stale audio or allocate unlimited slots",async()=>{
 let now=0;const dir=await mkdtemp(join(tmpdir(),"soda-assistant-audio-expire-")),send=vi.fn(async()=>({turnId:"generated"}));
 const uploads=new AssistantAudioUploads(dir,{send,now:()=>now});
 try {
  const a=uploads.begin("a",begin,()=>target),b=uploads.begin("b",begin,()=>target);
  expect(()=>uploads.begin("c",begin,()=>target)).toThrow();
  uploads.cancel("a",a);uploads.chunk("b",chunk(b.uploadId));now=300000;
  expect(()=>uploads.commit("b",b)).toThrow();expect(send).not.toHaveBeenCalled();
  uploads.onClientGone("b");expect(()=>uploads.begin("c",begin,()=>target)).not.toThrow();
 } finally{await uploads.close();await rm(dir,{recursive:true,force:true});}
});
it("rejects a replacement target after transfer and before any model submission",async()=>{
 const f=await fixture();let current=target;
 try {
  const id=f.uploads.begin("owner",begin,()=>current);f.uploads.chunk("owner",chunk(id.uploadId));
  current={...target,threadId:"00000000-0000-4000-8000-000000000005"};
  expect(()=>f.uploads.commit("owner",id)).toThrow();expect(f.send).not.toHaveBeenCalled();
 }finally{await f.close();}
});
it("keeps an in-flight cancellation in its physical slot until the sender settles",async()=>{
 const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};};
 const entered=deferred(),gate=deferred();
 const send=vi.fn<typeof sendCodexAudio>(async(_target,signal)=>{entered.resolve();await gate.promise;signal.throwIfAborted();return{turnId:"generated"};});
 const f=await fixture(send);
 try {
  const id=f.uploads.begin("owner",begin,()=>target);f.uploads.chunk("owner",chunk(id.uploadId));
  const sending=f.uploads.commit("owner",id);const rejected=expect(sending).rejects.toThrow();await entered.promise;
  f.uploads.cancel("owner",id);expect(()=>f.uploads.begin("owner",begin,()=>target)).toThrow();
  gate.resolve();await rejected;expect(()=>f.uploads.begin("owner",begin,()=>target)).not.toThrow();expect(send).toHaveBeenCalledOnce();
 }finally{gate.resolve();await f.close();}
});
it("suspends, drains physical work, and refuses new uploads until resumed",async()=>{
 const f=await fixture();
 try {
  const id=f.uploads.begin("owner",begin,()=>target);f.uploads.chunk("owner",chunk(id.uploadId));
  await f.uploads.suspend();expect(()=>f.uploads.begin("other",begin,()=>target)).toThrow();
  expect(f.send).not.toHaveBeenCalled();await expect(readdir(join(f.dir,"assistant-audio"))).rejects.toThrow();
  f.uploads.resume();expect(()=>f.uploads.begin("other",begin,()=>target)).not.toThrow();
 }finally{await f.close();}
});
it("never deletes an existing file when exclusive creation fails",async()=>{
 const f=await fixture();
 try {
  const id=f.uploads.begin("owner",begin,()=>target);f.uploads.chunk("owner",chunk(id.uploadId));
  const directory=join(f.dir,"assistant-audio");await mkdir(directory);const path=join(directory,`${id.uploadId}.wav`);await writeFile(path,"existing-user-file");
  await expect(f.uploads.commit("owner",id)).rejects.toThrow();
  await expect(readFile(path,"utf8")).resolves.toBe("existing-user-file");expect(f.send).not.toHaveBeenCalled();
 }finally{await f.close();}
});
it.each(["bytes","count"])("admits concurrent stores against the combined retained %s limit",async(kind)=>{
 const f=await fixture();
 try {
  const directory=join(f.dir,"assistant-audio");await mkdir(directory);
  if(kind==="bytes"){const path=join(directory,`${randomUUID()}.wav`);await writeFile(path,"");await truncate(path,200*1024*1024-4);}
  else await Promise.all(Array.from({length:63},()=>writeFile(join(directory,`${randomUUID()}.wav`),"x")));
  const a=f.uploads.begin("a",begin,()=>target),b=f.uploads.begin("b",begin,()=>target);
  f.uploads.chunk("a",chunk(a.uploadId));f.uploads.chunk("b",chunk(b.uploadId));
  const results=await Promise.allSettled([f.uploads.commit("a",a),f.uploads.commit("b",b)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(f.send).toHaveBeenCalledOnce();
 }finally{await f.close();}
});
it("tolerates a retention deletion between directory enumeration and stat",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-audio-race-")),directory=join(dir,"assistant-audio");await mkdir(directory);
 const old=join(directory,`${randomUUID()}.wav`);await writeFile(old,"old");
 const files={lstat:vi.fn(async(path:string)=>{if(path===old){await unlink(old);throw Object.assign(Error("gone"),{code:"ENOENT"});}return lstat(path);}),unlink};
 const send=vi.fn<typeof sendCodexAudio>(async()=>({turnId:"generated"})),uploads=new AssistantAudioUploads(dir,{send,files});
 try {
  const id=uploads.begin("owner",begin,()=>target);uploads.chunk("owner",chunk(id.uploadId));await expect(uploads.commit("owner",id)).resolves.toMatchObject({sent:true});expect(send).toHaveBeenCalledOnce();
 }finally{await uploads.close();await rm(dir,{recursive:true,force:true});}
});
it("drains a retention unlink before suspend can complete",async()=>{
 vi.useFakeTimers();let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(done=>{release=done;}),started=new Promise<void>(done=>{entered=done;});
 const dir=await mkdtemp(join(tmpdir(),"soda-audio-delete-"));
 const uploads=new AssistantAudioUploads(dir,{send:async()=>({turnId:"generated"}),files:{lstat,unlink:async(path)=>{entered();await gate;await unlink(path);}}});
 try {
  const id=uploads.begin("owner",begin,()=>target);uploads.chunk("owner",chunk(id.uploadId));await uploads.commit("owner",id);
  await vi.advanceTimersByTimeAsync(300100);await started;
  let paused=false;const pausing=uploads.suspend().then(()=>{paused=true;});
  for(let i=0;i<10;i++)await Promise.resolve();expect(paused).toBe(false);
  release();await pausing;expect(paused).toBe(true);
 }finally{release();await uploads.close();vi.useRealTimers();await rm(dir,{recursive:true,force:true});}
});
it("pauses retention writes during handoff and resumes the original remaining expiry",async()=>{
 vi.useFakeTimers();const f=await fixture();
 try {
  const id=f.uploads.begin("owner",begin,()=>target);f.uploads.chunk("owner",chunk(id.uploadId));await f.uploads.commit("owner",id);
  const path=join(f.dir,"assistant-audio",`${id.uploadId}.wav`);
  await f.uploads.suspend();await vi.advanceTimersByTimeAsync(300100);expect((await readFile(path)).length).toBe(4);
  f.uploads.resume();await vi.advanceTimersByTimeAsync(2);
  await vi.waitFor(async()=>{await expect(readFile(path)).rejects.toThrow();});
 }finally{await f.close();vi.useRealTimers();}
});
it("does not admit a new upload if its proof synchronously suspends the service",async()=>{
 const f=await fixture();
 try{expect(()=>f.uploads.begin("owner",begin,()=>{void f.uploads.suspend();return target;})).toThrow();expect(f.send).not.toHaveBeenCalled();}
 finally{await f.close();}
});
it("holds the physical upload slot until unsent file cleanup settles",async()=>{
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(done=>{release=done;}),started=new Promise<void>(done=>{entered=done;});
 const dir=await mkdtemp(join(tmpdir(),"soda-audio-cleanup-"));let path="",uploadId="";
 const uploads=new AssistantAudioUploads(dir,{send:async()=>{throw Error("must not send");},files:{lstat:async(value)=>{entered();await gate;return lstat(value);},unlink}});
 try {
  ({uploadId}=uploads.begin("owner",begin,()=>{if(path&&existsSync(path)&&statSync(path).size===4)uploads.cancel("owner",{uploadId});return target;}));
  path=join(dir,"assistant-audio",`${uploadId}.wav`);uploads.chunk("owner",chunk(uploadId));
  const sending=uploads.commit("owner",{uploadId}),rejected=expect(sending).rejects.toThrow();await started;
  expect(()=>uploads.begin("owner",begin,()=>target)).toThrow();
  uploads.begin("other",begin,()=>target);expect(()=>uploads.begin("third",begin,()=>target)).toThrow();
  release();await rejected;expect(()=>uploads.begin("owner",begin,()=>target)).not.toThrow();
 }finally{release();await uploads.close();await rm(dir,{recursive:true,force:true});}
});
