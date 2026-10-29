import {afterEach,expect,it,vi} from "vitest";
import {request} from "node:http";
import {WebSocket} from "ws";
import {DesktopNativeGateway,type NativeFactory} from "./DesktopNativeGateway.node.js";
import {DesktopNativeHost} from "./DesktopNativeHost.node.js";
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
async function fixture(options:{prepare?:()=>Promise<void>;factory?:NativeFactory}={}){
 const binary={prepare:vi.fn(options.prepare??(async()=>{})),executable:"fixed-memory-test-only",close:vi.fn(async()=>{})};
 const gateway=await DesktopNativeGateway.listen("https://browser.example",{binary,...(options.factory?{nativeFactory:options.factory}:{})});cleanup.push(()=>gateway.close());const descriptor=gateway.descriptor(),url=new URL(descriptor.origin),port=Number(url.port);
 const get=(host=url.host,path=`/bridge?id=${descriptor.id}`,method="GET")=>new Promise<{status:number;headers:Record<string,unknown>;body:string}>((resolve,reject)=>{const req=request({hostname:"127.0.0.1",port,method,path,headers:{host}},res=>{let body="";res.on("data",chunk=>{body+=chunk;});res.on("end",()=>resolve({status:res.statusCode!,headers:res.headers,body}));});req.on("error",reject);req.end();});
 const open=async(origin=descriptor.origin,host=url.host)=>{const client=new WebSocket(`ws://127.0.0.1:${port}/channel`,{headers:{origin,host}});client.on("error",()=>{});const messages:any[]=[];client.on("message",bytes=>messages.push(JSON.parse(bytes.toString())));await new Promise<void>((resolve,reject)=>{client.once("open",resolve);client.once("error",reject);});cleanup.push(async()=>client.terminate());return {client,messages};};
 const claim=async()=>{const page=await get(),secret=page.body.match(/secret:"([A-Za-z0-9_-]{43})"/)?.[1];expect(secret).toBeTruthy();const channel=await open();channel.client.send(JSON.stringify({type:"claim",secret}));return channel;};
 return {gateway,binary,descriptor,get,open,claim};
}
it("requires the exact loopback Host/path/method and keeps the proof out of descriptors",async()=>{
 const f=await fixture();for(const [host,path,method]of [["127.0.0.1","/bridge","GET"],[new URL(f.descriptor.origin).host,"/other","GET"],[new URL(f.descriptor.origin).host,`/bridge?id=${f.descriptor.id}`,"POST"]])expect((await f.get(host,path,method)).status).toBe(403);
 const page=await f.get();expect(page.status).toBe(200);expect(page.headers["cache-control"]).toBe("no-store");expect(page.headers["content-security-policy"]).toContain("frame-ancestors https://browser.example");expect(page.body).toContain("event.source!==parent");expect(page.body).toContain("event.origin!==origin");expect(JSON.stringify(f.descriptor)).not.toContain("secret");expect(f.binary.prepare).not.toHaveBeenCalled();
});
it("rejects a foreign WebSocket origin before reserving or compiling",async()=>{
 const f=await fixture();await expect(f.open("https://foreign.example")).rejects.toThrow();expect(f.binary.prepare).not.toHaveBeenCalled();const channel=await f.claim();await expect.poll(()=>channel.messages.some(value=>value.type==="ready")).toBe(true);
});
it("closes a claimed helper on the wrong secret without compiling",async()=>{
 const f=await fixture(),channel=await f.open();channel.client.send(JSON.stringify({type:"claim",secret:"wrong"}));await expect.poll(()=>f.binary.prepare.mock.calls.length+(channel.client.readyState===WebSocket.CLOSED?1:0)).toBeGreaterThan(0);expect(f.binary.prepare).not.toHaveBeenCalled();expect(await f.gateway.done).toBe(true);expect(f.binary.prepare).not.toHaveBeenCalled();expect(f.binary.close).toHaveBeenCalledOnce();
});
it("owns a deferred preparation through shutdown and never constructs a late host",async()=>{
 const gate=deferred(),factory=vi.fn((options:Parameters<NativeFactory>[0])=>new DesktopNativeHost(options)),f=await fixture({prepare:()=>gate.promise,factory});await f.claim();await expect.poll(()=>f.binary.prepare.mock.calls.length).toBe(1);let done=false;void f.gateway.done.then(()=>{done=true;});const closing=f.gateway.close();await Promise.resolve();expect(done).toBe(false);expect(f.binary.close).not.toHaveBeenCalled();gate.resolve();await closing;expect(await f.gateway.done).toBe(true);expect(factory).not.toHaveBeenCalled();expect(f.binary.close).toHaveBeenCalledOnce();
});
it("catches a factory exception and drains the gateway and generated binary",async()=>{
 const f=await fixture({factory:()=>{throw Error("generated factory failure");}});await f.claim();expect(await f.gateway.done).toBe(true);expect(f.binary.close).toHaveBeenCalledOnce();
});
it("waits a late host returned after factory reentrant shutdown before binary cleanup",async()=>{
 const gate=deferred(),entered=deferred(),closed=deferred();let f!:Awaited<ReturnType<typeof fixture>>;const native={closed:closed.promise,receive(){},close:vi.fn(async()=>{entered.resolve();await gate.promise;closed.resolve();})};
 f=await fixture({factory:()=>{void f.gateway.close();return native;}});await f.claim();await entered.promise;let done=false;void f.gateway.done.then(()=>{done=true;});await new Promise<void>(resolve=>setImmediate(resolve));expect(done).toBe(false);expect(f.binary.close).not.toHaveBeenCalled();gate.resolve();expect(await f.gateway.done).toBe(true);expect(native.close).toHaveBeenCalledOnce();expect(f.binary.close).toHaveBeenCalledOnce();
});
for(const mode of ["idle","absolute"]){it(`closes the whole gateway on native ${mode} expiry with its WS still open`,async()=>{
 let now=0,native!:DesktopNativeHost;const f=await fixture({factory:options=>native=new DesktopNativeHost({...options,now:()=>now})}),channel=await f.claim();await expect.poll(()=>channel.messages.some(value=>value.type==="ready")).toBe(true);expect(channel.client.readyState).toBe(WebSocket.OPEN);
 if(mode==="absolute"){for(now=4999;now<900000;now+=4999)native.receive({type:"beat"});now=900000;}else now=5000;
 let closed=false;void f.gateway.done.then(()=>{closed=true;});await expect.poll(()=>closed).toBe(true);expect(await f.gateway.done).toBe(true);await expect.poll(()=>channel.client.readyState).toBe(WebSocket.CLOSED);expect(f.binary.close).toHaveBeenCalledOnce();await expect(f.get()).rejects.toThrow();
});}
