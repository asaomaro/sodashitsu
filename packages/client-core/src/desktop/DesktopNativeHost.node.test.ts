import {afterEach,expect,it} from "vitest";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {randomUUID,createHash} from "node:crypto";
import type {spawn,ChildProcessWithoutNullStreams} from "node:child_process";
import {DesktopNativeHost} from "./DesktopNativeHost.node.js";
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
function fixture(onEvent?:(value:any,host:DesktopNativeHost)=>void){
 class Child extends EventEmitter{stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();killed=false;kill(){this.killed=true;return true;}}
 const child=new Child(),packets:string[]=[],events:any[]=[];let now=100;child.stdin.on("data",bytes=>packets.push(bytes.toString("utf8")));
 const host=new DesktopNativeHost({origin:"https://example.test",executable:"fixed-generated-only",spawn:(()=>child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof spawn,now:()=>now,emit:value=>{events.push(value);onEvent?.(value,host);}});
 cleanup.push(async()=>{const closed=host.close();child.emit("close",3,null);await closed;});
 const gesture=randomUUID(),data=Buffer.alloc(70000);for(let i=0;i<data.length;i++)data[i]=i%251;
 const offer={lease:randomUUID(),generation:randomUUID(),entries:[{name:"generated.bin",directory:false,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")},{name:"generated-two.bin",directory:false,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")}]};
 host.receive({type:"arm",gesture});host.receive({type:"start",gesture,offer});const nonce=packets[0]!.trim(),send=(value:object)=>child.stdout.write(JSON.stringify({...value,nonce})+"\n");
 return {host,child,events,packets,nonce,gesture,data,offer,send,clock:(value:number)=>{now=value;},ready:()=>send({type:"ready",now:20})};
}
it("allows contiguous chunks under one native request and completes only on actual close zero",()=>{
 const f=fixture();f.ready();const request=randomUUID();f.send({type:"need",request,index:0,offset:0,length:65536});f.host.receive({type:"bytes",gesture:f.gesture,request,index:0,offset:0,data:f.data.subarray(0,65536).toString("base64")});
 f.send({type:"need",request,index:0,offset:65536,length:4464});expect(f.events.filter(v=>v.type==="need")).toHaveLength(2);f.host.receive({type:"bytes",gesture:f.gesture,request,index:0,offset:65536,data:f.data.subarray(65536).toString("base64")});expect(f.events.filter(v=>v.type==="need")).toHaveLength(2);
 f.send({type:"finished",copy:true});expect(f.events.filter(v=>v.type==="done")).toHaveLength(0);f.child.emit("close",0,null);expect(f.events.at(-1)).toEqual({type:"done",gesture:f.gesture,ok:true});
});
it("does not issue a later same-chunk read after synchronous running cancellation",()=>{
 const f=fixture((event,host)=>{if(event.type==="running")host.cancel(event.gesture);});const request=randomUUID();f.child.stdout.write(JSON.stringify({type:"ready",nonce:f.nonce,now:20})+"\n"+JSON.stringify({type:"need",nonce:f.nonce,request,index:0,offset:0,length:1})+"\n");
 expect(f.child.killed).toBe(true);expect(f.events.some(v=>v.type==="need")).toBe(false);
});
for(const kind of ["duplicate","gap","index"]){it(`rejects ${kind} native request changes`,()=>{
 const f=fixture();f.ready();const request=randomUUID();f.send({type:"need",request,index:0,offset:0,length:65536});
 if(kind!=="duplicate")f.host.receive({type:"bytes",gesture:f.gesture,request,index:0,offset:0,data:f.data.subarray(0,65536).toString("base64")});
 f.send({type:"need",request,index:kind==="index"?1:0,offset:kind==="gap"?65537:0,length:1});expect(f.child.killed).toBe(true);
});}
it("preserves the original host gesture remainder in the native clock domain",()=>{
 const f=fixture();f.clock(600);f.ready();const begin=f.packets.flatMap(p=>p.trim().split("\n")).filter(p=>p.startsWith("{")).map(p=>JSON.parse(p)).find(p=>p.type==="begin");expect(begin.deadline).toBe(260);expect(begin.gesture).toBe(f.gesture);
});
it("refuses late process ready without renewing admission",()=>{const f=fixture();f.clock(840);f.ready();expect(f.child.killed).toBe(true);expect(f.events.some(v=>v.type==="running")).toBe(false);});
it("never accepts a finished notification followed by nonzero process exit",()=>{const f=fixture();f.ready();f.send({type:"finished",copy:true});f.child.emit("close",3,null);expect(f.events.at(-1)).toMatchObject({type:"done",ok:false});});
it("waits child close after idle cancellation and exposes host terminal completion",async()=>{
 const f=fixture();let closed=false;void f.host.closed.then(()=>{closed=true;});f.clock(5100);expect(()=>f.host.receive({type:"beat"})).toThrow("expired");await Promise.resolve();expect(closed).toBe(false);expect(f.child.killed).toBe(true);f.child.emit("close",3,null);await f.host.closed;expect(closed).toBe(true);
});

it("rejects reuse of a completed native file request",()=>{
 const f=fixture();f.ready();const request=randomUUID();for(const [offset,length]of [[0,65536],[65536,4464]]){f.send({type:"need",request,index:0,offset,length});f.host.receive({type:"bytes",gesture:f.gesture,request,index:0,offset,data:f.data.subarray(offset!,offset!+length!).toString("base64")});}
 f.send({type:"need",request,index:0,offset:0,length:1});expect(f.child.killed).toBe(true);expect(f.events.filter(v=>v.type==="need")).toHaveLength(2);
});
