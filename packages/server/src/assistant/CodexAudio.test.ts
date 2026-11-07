import { expect,it,vi } from "vitest";
vi.mock("node:child_process",()=>({spawn:()=>{throw Error("legacy CLI proxy must not launch");}}));
import { sendCodexAudio } from "./CodexAudio.js";
import type {CodexChannelTarget,CodexControlChannel} from "../agent/CodexControlSocket.js";
const target={threadId:"00000000-0000-4000-8000-000000000001",projectDir:"/generated/assistant",path:"/generated/reviewed.wav"};
function fixture(reply?:(method:string,params:Record<string,unknown>)=>unknown) {
 const requests:{method:string;params:Record<string,unknown>}[]=[];
 let transport:CodexChannelTarget;
 const channel:CodexControlChannel<string>={
  request:async(method,params)=>{
   transport.check();requests.push({method,params:params as Record<string,unknown>});
   const value=reply?.(method,params as Record<string,unknown>);
   if(value==="hold")await new Promise((_,reject)=>{transport.signal.addEventListener("abort",()=>reject(Error("cancelled")),{once:true})});
   if(value==="lost")throw Error("送信は再試行しません");
   return value??(method==="initialize"?{userAgent:"fixture"}:method==="thread/loaded/list"?{data:[target.threadId]}:method==="thread/read"?{thread:{id:target.threadId,cwd:target.projectDir,status:{type:"idle"}}}:{turn:{id:"generated-turn"}});
  },initialized:vi.fn(),unchanged:vi.fn(async()=>true),close:vi.fn(async()=>true),
 };
 const open=vi.fn(async(input:CodexChannelTarget)=>{transport=input;input.check();return channel});
 const options={open,canonical:vi.fn(async(path:string)=>path) as never};return {channel,requests,options};
}
it("sends localAudio only to an existing idle matching thread, with no CLI or model/effort override",async()=>{
 const f=fixture(),guard=vi.fn();
 expect(await sendCodexAudio(target,new AbortController().signal,performance.now()+10000,guard,f.options)).toEqual({turnId:"generated-turn"});
 expect(f.requests.map(r=>r.method)).toEqual(["initialize","thread/loaded/list","thread/read","turn/start"]);
 expect(f.requests.at(-1)!.params).toMatchObject({threadId:target.threadId,input:[{type:"text"},{type:"localAudio",path:target.path}]});
 expect(f.requests.at(-1)!.params).not.toHaveProperty("model");expect(f.requests.at(-1)!.params).not.toHaveProperty("effort");
 expect(f.options.open).toHaveBeenCalledWith(expect.objectContaining({key:"audio:"+target.threadId,maxRequests:4}),["initialize","thread/loaded/list","thread/read","turn/start"]);
 expect(guard.mock.calls.length).toBeGreaterThan(5);expect(f.channel.close).toHaveBeenCalledOnce();
});
it.each(["notLoaded","working","wrongThread","wrongCwd"])("never sends audio for %s",async(kind)=>{
 const f=fixture(method=>{if(kind==="notLoaded"&&method==="thread/loaded/list")return{data:[]};if(method==="thread/read")return{thread:{id:kind==="wrongThread"?"other":target.threadId,cwd:kind==="wrongCwd"?"/other":target.projectDir,status:{type:kind==="working"?"active":"idle"}}};});
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{},f.options)).rejects.toThrow();expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("checks ownership after metadata and async cwd verification",async()=>{
 const f=fixture();let changed=false;
 f.options.canonical=vi.fn(async(path:string)=>{if(f.requests.some(r=>r.method==="thread/read"))changed=true;return path;}) as never;
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{if(changed)throw Error("generated replacement");},f.options)).rejects.toThrow("replacement");expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("rejects changed daemon generation before sending",async()=>{
 const f=fixture();f.channel.unchanged=vi.fn(async()=>false);
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{},f.options)).rejects.toThrow("世代");expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("cancellation releases a pending connection without starting a turn",async()=>{
 const controller=new AbortController(),f=fixture(method=>method==="thread/read"?"hold":undefined);
 const sending=sendCodexAudio(target,controller.signal,performance.now()+10000,()=>{},f.options);
 await vi.waitFor(()=>expect(f.requests.some(r=>r.method==="thread/read")).toBe(true));controller.abort();
 await expect(sending).rejects.toThrow("取り消し");expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("does not retry a lost turn acknowledgement",async()=>{
 const f=fixture(method=>method==="turn/start"?"lost":undefined);
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{},f.options)).rejects.toThrow("再試行しません");expect(f.requests.filter(r=>r.method==="turn/start")).toHaveLength(1);
});
it.each(["expires","aborts"])("rechecks %s on the final guard",async(kind)=>{
 const f=fixture(),controller=new AbortController();let now=0,calls=0;
 const guard=()=>{if((f.options.canonical as ReturnType<typeof vi.fn>).mock.calls.length===2&&++calls===2){if(kind==="expires")now=10000;else controller.abort();}};
 await expect(sendCodexAudio(target,controller.signal,10000,guard,{...f.options,now:()=>now})).rejects.toThrow();expect(f.requests.some(r=>r.method==="turn/start")).toBe(false);
});
it("does not report delivery until physical socket close is confirmed",async()=>{
 const f=fixture();f.channel.close=vi.fn(async()=>false);
 await expect(sendCodexAudio(target,new AbortController().signal,performance.now()+10000,()=>{},f.options)).rejects.toThrow("終了を確認できません");expect(f.requests.filter(r=>r.method==="turn/start")).toHaveLength(1);
});
