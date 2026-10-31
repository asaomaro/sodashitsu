import {expect,it,vi} from "vitest";
import {LazyAssistantAudio} from "./LazyAssistantAudio.js";
const input={deviceId:"00000000-0000-4000-8000-000000000001",instanceId:"00000000-0000-4000-8000-000000000002",mime:"audio/wav",size:1,ttlMs:1000};
const target={paneId:"pane",instanceId:input.instanceId,threadId:"thread",projectDir:"/generated"};
function runtime(){return {begin:vi.fn((_owner:string,_input:unknown,prove:()=>unknown)=>{prove();return{uploadId:input.deviceId};}),chunk:vi.fn(),cancel:vi.fn(),commit:vi.fn(async()=>({sent:true as const,turnId:"turn"})),onClientGone:vi.fn(),suspend:vi.fn(async()=>{}),resume:vi.fn(),close:vi.fn(async()=>{})};}
it("unused lifecycle and invalid or unauthorized begin never load audio",async()=>{
 const load=vi.fn(async()=>()=>runtime()),audio=new LazyAssistantAudio("/unused",load);
 audio.onClientGone("owner");audio.cancel("owner",{uploadId:input.deviceId});await audio.suspend();audio.resume();
 await expect(audio.begin("owner",{...input,size:0},()=>target)).rejects.toThrow();
 await expect(audio.begin("owner",input,()=>{throw Error("denied");})).rejects.toThrow("denied");
 await audio.close();expect(load).not.toHaveBeenCalled();
});
it("simultaneous admitted callers share one runtime and retain the original deadline",async()=>{
 let now=0,release!:(value:()=>ReturnType<typeof runtime>)=>void;
 const host=runtime(),create=vi.fn(()=>host),load=vi.fn(()=>new Promise<()=>ReturnType<typeof runtime>>(resolve=>{release=resolve;}));
 const audio=new LazyAssistantAudio("/unused",load,()=>now);
 const first=audio.begin("a",input,()=>target),second=audio.begin("b",input,()=>target);
 await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());
 await expect(audio.begin("c",input,()=>target)).rejects.toThrow();
 now=100;release(create);await Promise.all([first,second]);
 expect(create).toHaveBeenCalledOnce();expect(host.begin).toHaveBeenCalledTimes(2);
 expect(host.begin.mock.calls[0]![1]).toMatchObject({ttlMs:900});await audio.close();
});
it.each(["disconnect","suspend","close","deadline","target"] as const)("does not construct after %s during loading",async mode=>{
 let now=0,release!:(value:()=>ReturnType<typeof runtime>)=>void;
 let current={...target};const create=vi.fn(()=>runtime()),load=vi.fn(()=>new Promise<()=>ReturnType<typeof runtime>>(resolve=>{release=resolve;}));
 const audio=new LazyAssistantAudio("/unused",load,()=>now),pending=audio.begin("a",input,()=>current);
 const failure=expect(pending).rejects.toThrow();await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());
 if(mode==="disconnect")audio.onClientGone("a");
 if(mode==="suspend"){await audio.suspend();audio.resume();}
 if(mode==="close")await audio.close();
 if(mode==="deadline")now=1000;
 if(mode==="target")current={...target,threadId:"other"};
 release(create);await failure;expect(create).not.toHaveBeenCalled();await audio.close();
});
it("cancelled pending callers retain their physical loading admission until completion",async()=>{
 let release!:(value:()=>ReturnType<typeof runtime>)=>void;
 const create=vi.fn(()=>runtime()),load=vi.fn(()=>new Promise<()=>ReturnType<typeof runtime>>(resolve=>{release=resolve;}));
 const audio=new LazyAssistantAudio("/unused",load),first=audio.begin("a",input,()=>target),second=audio.begin("b",input,()=>target);
 const failure1=expect(first).rejects.toThrow(),failure2=expect(second).rejects.toThrow();
 await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());audio.onClientGone("a");audio.onClientGone("b");
 await expect(audio.begin("c",input,()=>target)).rejects.toThrow();
 release(create);await Promise.all([failure1,failure2]);expect(create).not.toHaveBeenCalled();await audio.close();
});

it.each(["suspend","disconnect"] as const)("does not adopt an old request after initial proof reenters %s",async mode=>{
 const load=vi.fn(async()=>()=>runtime()),audio=new LazyAssistantAudio("/unused",load);
 let first=true;
 await expect(audio.begin("a",input,()=>{
  if(first){first=false;if(mode==="suspend"){void audio.suspend();audio.resume();}else audio.onClientGone("a");}
  return target;
 })).rejects.toThrow();
 expect(load).not.toHaveBeenCalled();await audio.close();
});
it("retires a runtime constructed while its factory synchronously invalidates the owner",async()=>{
 const host=runtime();let audio!:LazyAssistantAudio;
 const create=()=>{void audio.suspend();audio.resume();return host;};
 audio=new LazyAssistantAudio("/unused",async()=>create);
 await expect(audio.begin("a",input,()=>target)).rejects.toThrow();
 expect(host.begin).not.toHaveBeenCalled();expect(host.close).toHaveBeenCalledOnce();await audio.close();
});
