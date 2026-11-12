import {afterEach,expect,it,vi} from "vitest";
import {DesktopNativeHelperRpc} from "./nativeHelperRpc.js";
const clean:Array<()=>void>=[];afterEach(()=>{for(const fn of clean.splice(0).reverse())fn();vi.useRealTimers();});
function fixture(){
 const sent:any[]=[],closed=vi.fn();const socket={readyState:0,bufferedAmount:0,onopen:null as (()=>void)|null,onclose:null as ((event:{code:number})=>void)|null,onerror:null,onmessage:null as ((event:{data:string})=>void)|null,send(value:string){sent.push(JSON.parse(value));},close(){this.readyState=3;this.onclose?.({code:1000});}};
 const open=vi.fn(()=>socket as unknown as WebSocket),rpc=new DesktopNativeHelperRpc(closed,open as any,async()=>new Response(null,{status:204}));clean.push(()=>rpc.close());const reply=(result:unknown,error?:unknown)=>socket.onmessage?.({data:JSON.stringify({id:sent.at(-1)!.id,...(error?{error}:{result})})});
 return {rpc,socket,sent,closed,open,reply,ready:async()=>{for(let i=0;i<4;i++)await Promise.resolve();socket.readyState=1;socket.onopen?.();reply({});for(let i=0;i<4;i++)await Promise.resolve();}};
}
it("uses only this page's direct origin and relies on socket lifetime without polling the helper",async()=>{
 vi.useFakeTimers();const f=fixture(),viewerId=crypto.randomUUID(),pending=f.rpc.start(viewerId);await f.ready();expect(f.open).toHaveBeenCalledWith(location.origin.replace(/^http/,"ws")+"/ws");expect(f.sent[0]).toMatchObject({method:"client.hello",params:{protocol:1,kind:"desktop"}});expect(f.sent.at(-1)).toMatchObject({method:"desktop.native_helper.start",params:{viewerId}});const id=crypto.randomUUID(),origin="http://n00000000000000000000000000000000.localhost:1234",descriptor={id,origin,url:`${origin}/bridge?id=${id}`};f.reply(descriptor);expect(await pending).toEqual(descriptor);
 await vi.advanceTimersByTimeAsync(30000);expect(f.sent).toHaveLength(2);expect(f.sent.filter(v=>v.method==="desktop.native_helper.start")).toHaveLength(1);f.rpc.close();expect(f.closed).toHaveBeenCalledOnce();
});
it("rejects work cancelled before hello and never reconnects implicitly",async()=>{
 const f=fixture(),pending=f.rpc.start(crypto.randomUUID());f.rpc.close();await expect(pending).rejects.toThrow();await expect(f.rpc.start(crypto.randomUUID())).rejects.toThrow();expect(f.open).not.toHaveBeenCalled();expect(f.sent).toEqual([]);
});
it("rejects a malformed locator and leaves it to the owner to stop that helper",async()=>{
 const f=fixture(),pending=f.rpc.start(crypto.randomUUID());await f.ready();f.reply({id:crypto.randomUUID(),origin:"https://remote.example",url:"https://remote.example/bridge"});await expect(pending).rejects.toThrow();
});

it("retires the ordinary connection on close without reconnecting or restarting its helper",async()=>{
 vi.useFakeTimers();const f=fixture(),pending=f.rpc.start(crypto.randomUUID());await f.ready();const id=crypto.randomUUID(),origin="http://n00000000000000000000000000000000.localhost:1234";f.reply({id,origin,url:`${origin}/bridge?id=${id}`});await pending;f.socket.close();await vi.advanceTimersByTimeAsync(60000);expect(f.closed).toHaveBeenCalledOnce();expect(f.open).toHaveBeenCalledOnce();expect(f.sent.filter(v=>v.method==="desktop.native_helper.start")).toHaveLength(1);
});
