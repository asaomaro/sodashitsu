import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect,it,vi } from "vitest";
import type { ChildProcess,spawn } from "node:child_process";
import { sendCodexAudio } from "./CodexAudio.js";

const target={threadId:"00000000-0000-4000-8000-000000000001",projectDir:"/generated/assistant",path:"/generated/reviewed.wav"};
function fixture(reply?:(method:string,params:Record<string,unknown>)=>unknown) {
 const child=new EventEmitter() as ChildProcess;child.stdin=new PassThrough();child.stdout=new PassThrough();
 const requests:{method:string;params:Record<string,unknown>}[]=[];
 child.kill=vi.fn(()=>{queueMicrotask(()=>child.emit("close",0));return true;});
 child.stdin.on("finish",()=>queueMicrotask(()=>child.emit("close",0)));
 child.stdin.on("data",chunk=>{
  const request=JSON.parse(chunk.toString()) as {id?:number;method:string;params:Record<string,unknown>};
  if(!request.id)return;requests.push(request);
  const value=reply?.(request.method,request.params);
  if(value==="hold")return;
  const result=value??(request.method==="thread/loaded/list"?{data:[target.threadId]}:request.method==="thread/read"?{thread:{id:target.threadId,cwd:target.projectDir,status:{type:"idle"}}}:request.method==="turn/start"?{turn:{id:"generated-turn"}}:{});
  queueMicrotask(()=>child.stdout!.emit("data",JSON.stringify({id:request.id,result})+"\n"));
 });
 const launch=vi.fn(()=>child) as unknown as typeof spawn;
 const options={launch,canonical:vi.fn(async(path: string)=>path) as never};
 return {child,requests,options};
}
it("sends localAudio only to an existing idle matching thread without changing model/effort",async()=>{
 const f=fixture(),guard=vi.fn();
 expect(await sendCodexAudio(target,new AbortController().signal,performance.now()+10000,guard,f.options)).toEqual({turnId:"generated-turn"});
 expect(f.requests.map(r=>r.method)).toEqual(["initialize","thread/loaded/list","thread/read","turn/start"]);
 expect(f.requests.at(-1)!.params).toMatchObject({threadId:target.threadId,input:[{type:"text"},{type:"localAudio",path:target.path}]});
 expect(f.requests.at(-1)!.params).not.toHaveProperty("model");expect(f.requests.at(-1)!.params).not.toHaveProperty("effort");
 expect(f.options.launch).toHaveBeenCalledWith("codex",["app-server","proxy"],expect.objectContaining({cwd:target.projectDir,shell:false}));
 expect(guard.mock.calls.length).toBeGreaterThan(5);
});
it.each(["notLoaded","working","wrongThread","wrongCwd"])("never sends audio for %s",async(kind)=>{
 const f=fixture(method=>{
  if(kind==="notLoaded"&&method==="thread/loaded/list")return{data:[]};
  if(method==="thread/read")return{thread:{id:kind==="wrongThread"?"other":target.threadId,cwd:kind==="wrongCwd"?"/other":target.projectDir,status:{type:kind==="working"?"active":"idle"}}};
 });
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{},f.options)).rejects.toThrow();
 expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("checks ownership again after metadata inspection and after async cwd verification",async()=>{
 const f=fixture(),controller=new AbortController();let changed=false;
 f.options.canonical=vi.fn(async(path:string)=>{if(f.requests.some(r=>r.method==="thread/read"))changed=true;return path;}) as never;
 await expect(sendCodexAudio(target,controller.signal,performance.now()+10000,()=>{if(changed)throw Error("generated replacement");},f.options)).rejects.toThrow("replacement");
 expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("cancellation releases a pending proxy without starting a turn",async()=>{
 const controller=new AbortController();const f=fixture(method=>method==="thread/read"?"hold":undefined);
 const sending=sendCodexAudio(target,controller.signal,performance.now()+10000,()=>{},f.options);
 await vi.waitFor(()=>expect(f.requests.some(r=>r.method==="thread/read")).toBe(true));controller.abort();
 await expect(sending).rejects.toThrow("取り消し");expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("does not retry when a turn submission loses its acknowledgement",async()=>{
 let f:ReturnType<typeof fixture>;
 f=fixture(method=>{if(method==="turn/start"){queueMicrotask(()=>f.child.emit("close",1));return"hold";}});
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{},f.options)).rejects.toThrow("再試行しません");
 expect(f.requests.filter(r=>r.method==="turn/start")).toHaveLength(1);
});
it.each(["expires","aborts"])("rechecks %s when the final target guard changes the budget",async(kind)=>{
 const f=fixture(),controller=new AbortController();let now=0,calls=0;
 f.options.canonical=vi.fn(async(path:string)=>path) as never;
 const options={...f.options,now:()=>now};
 const guard=()=>{
  if((f.options.canonical as ReturnType<typeof vi.fn>).mock.calls.length===2 && ++calls===2) {
   if(kind==="expires")now=10000;else controller.abort();
  }
 };
 await expect(sendCodexAudio(target,controller.signal,10000,guard,options)).rejects.toThrow();
 expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("retains an unclosed owned proxy in its quota and does not report successful delivery",async()=>{
 vi.useFakeTimers();const f=fixture(),owned=new Set<ChildProcess>();
 f.child.stdin!.removeAllListeners("finish");f.child.kill=vi.fn(()=>false);
 try {
  const sending=sendCodexAudio(target,new AbortController().signal,10000,()=>{},{...f.options,owned});
  const rejected=expect(sending).rejects.toThrow("終了を確認できません");
  await vi.advanceTimersByTimeAsync(1500);await rejected;
  expect(owned.has(f.child)).toBe(true);expect(f.child.kill).toHaveBeenCalledWith("SIGKILL");
  f.child.emit("close",0);expect(owned.size).toBe(0);
 } finally {vi.useRealTimers();}
});
