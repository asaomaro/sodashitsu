import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {afterEach,expect,it,vi} from "vitest";
import {DesktopSigninSource,type DesktopSigninSourceDependencies} from "./DesktopSigninSource.js";
const ownerSid="S-1-5-21-1-2-3-1001",context={type:"signin_context" as const,ownerSid,packageRoot:"C:\\fixed",stateDir:"C:\\fixed-runtime"};
const record={version:1,purpose:"desktop-signin",revision:"11111111-1111-4111-8111-111111111111",ownerSid,origin:"https://root.invalid",machineId:"a".repeat(32),token:"t".repeat(43),provider:"1".repeat(64),allowSignin:true,peers:[{fingerprint:"2".repeat(64),label:"generated"}]};
const sources:{source:DesktopSigninSource;child:EventEmitter}[]=[];
afterEach(()=>{for(const f of sources){f.source.close();f.child.emit("close",0);}sources.length=0;vi.useRealTimers();});
function fixture(options:{platform?:NodeJS.Platform;active?:()=>boolean;onSpawn?:()=>void;now?:()=>number}={}){
 const abort=new AbortController(),closed=vi.fn(),child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>true)}),sent:string[]=[];
 child.stdin.on("data",bytes=>sent.push(bytes.toString()));
 const spawn=vi.fn<DesktopSigninSourceDependencies["spawn"]>(()=>{options.onSpawn?.();return child as never;});
 const source=new DesktopSigninSource(context,{active:options.active??(()=>true),signal:abort.signal,closed},{platform:options.platform??"win32",now:options.now??(()=>performance.now()),shell:()=>"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",spawn});
 const f={source,child,spawn,closed,abort,sent,ready:()=>child.stdout.emit("data",Buffer.from('{"ready":true}\n')),reply:(seq:number,data:Buffer)=>child.stdout.emit("data",Buffer.from(JSON.stringify({seq,data:data.toString("base64")})+"\n"))};sources.push(f);return f;
}
it("uses one hidden private readonly child for fresh repeated enrollment reads",async()=>{
 const f=fixture();expect(f.spawn).toHaveBeenCalledOnce();expect(f.spawn.mock.calls[0]![2]).toMatchObject({windowsHide:true,stdio:["pipe","pipe","pipe"]});
 expect(f.spawn.mock.calls[0]![1]).toContain("-ReadonlySource");
 expect(f.spawn.mock.calls[0]![1].join(" ")).not.toContain(record.token);f.ready();await f.source.ready();
 const first=f.source.enrollment(),second=f.source.enrollment();expect(f.sent).toHaveLength(1);f.reply(1,Buffer.from(JSON.stringify(record)));expect((await first).publicStatus().provider).toBe(record.provider);
 expect(f.sent).toHaveLength(2);f.reply(2,Buffer.from(JSON.stringify({...record,allowInput:true})));expect((await second).publicStatus().allowInput).toBe(true);expect(f.spawn).toHaveBeenCalledOnce();
});
it.each(['{"ready":true,"extra":1}\n','{"seq":1,"data":""}\n','not json\n','{"ready":false}\n'])("rejects invalid startup framing %s",async line=>{
 const f=fixture(),raw=Buffer.from(line);f.child.stdout.emit("data",raw);await expect(f.source.ready()).rejects.toThrow("Signin readonly source is unavailable");expect(f.closed).toHaveBeenCalledOnce();expect(raw.every(byte=>byte===0)).toBe(true);
});
it.each(["sequence","base64","extra","oversize","utf8"])("closes all authority on invalid response: %s",async mode=>{
 const f=fixture();f.ready();await f.source.ready();const read=f.source.enrollment(),outcome=read.catch(error=>error);
 const raw=mode==="utf8"?Buffer.from([255]):Buffer.from(mode==="oversize"?"x".repeat(90001):JSON.stringify(mode==="sequence"?{seq:2,data:""}:mode==="base64"?{seq:1,data:"not base64"}:{seq:1,data:"",extra:true})+"\n");
 f.child.stdout.emit("data",raw);expect(await outcome).toBeInstanceOf(Error);expect(f.closed).toHaveBeenCalledOnce();expect(raw.every(byte=>byte===0)).toBe(true);
});
it("bounds warmup without authorizing reads",async()=>{
 vi.useFakeTimers();const f=fixture();await expect(f.source.enrollment()).rejects.toThrow();expect(f.sent).toHaveLength(0);await vi.advanceTimersByTimeAsync(10000);await expect(f.source.ready()).rejects.toThrow();expect(f.closed).toHaveBeenCalledOnce();
});
it("bounds queued requests from their enqueue time and confirms child exit",async()=>{
 vi.useFakeTimers();const f=fixture();f.ready();await f.source.ready();const a=f.source.enrollment().catch(error=>error);await vi.advanceTimersByTimeAsync(4000);const b=f.source.enrollment().catch(error=>error);f.reply(1,Buffer.from(JSON.stringify(record)));await a;
 await vi.advanceTimersByTimeAsync(5000);expect(await b).toBeInstanceOf(Error);expect(f.closed).toHaveBeenCalledOnce();let done=false;void f.source.settled().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);f.child.emit("close",1);await f.source.settled();expect(done).toBe(true);
});
it("reports unconfirmed child exit after graceful and kill deadlines",async()=>{
 vi.useFakeTimers();const f=fixture();f.ready();f.abort.abort();const settled=f.source.settled().catch(error=>error);await vi.advanceTimersByTimeAsync(2000);expect(f.child.kill).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(2000);expect(await settled).toBeInstanceOf(Error);
});
it("refuses foreign platforms and inactive scopes before spawning",async()=>{
 for(const options of [{platform:"linux" as const},{active:()=>false}]){const f=fixture(options);await expect(f.source.ready()).rejects.toThrow();expect(f.spawn).not.toHaveBeenCalled();await f.source.settled();}
});
it("refuses store initialization even after readiness",async()=>{
 const f=fixture();f.ready();await f.source.ready();await expect(f.source.store.initialize()).rejects.toThrow();expect(f.sent).toHaveLength(0);
});
it("reaps a worker returned after synchronous ownership loss during spawn",async()=>{
 let active=true;const f=fixture({active:()=>active,onSpawn:()=>{active=false;}});await expect(f.source.ready()).rejects.toThrow();expect(f.closed).toHaveBeenCalledOnce();
 let settled=false;void f.source.settled().then(()=>{settled=true;});await Promise.resolve();expect(settled).toBe(false);f.child.emit("close",1);await f.source.settled();expect(settled).toBe(true);
});
it("fails pending reads and stops the epoch immediately on unexpected worker exit",async()=>{
 const f=fixture();f.ready();await f.source.ready();const pending=f.source.enrollment().catch(error=>error);f.child.emit("close",1);expect(await pending).toBeInstanceOf(Error);expect(f.closed).toHaveBeenCalledOnce();await f.source.settled();
});
it("bounds queued reads without sending more than one private request at a time",async()=>{
 const f=fixture();f.ready();await f.source.ready();const reads=Array.from({length:16},()=>f.source.enrollment().catch(error=>error));await expect(f.source.enrollment()).rejects.toThrow();expect(f.sent).toHaveLength(1);f.abort.abort();expect((await Promise.all(reads)).every(value=>value instanceof Error)).toBe(true);
});
it("discards a reply if ownership is lost before its promise continuation",async()=>{
 const f=fixture();f.ready();await f.source.ready();const outcome=f.source.enrollment().catch(error=>error);f.reply(1,Buffer.from(JSON.stringify(record)));f.abort.abort();expect(await outcome).toBeInstanceOf(Error);
});

it("rejects late readiness and data before delayed timeout callbacks run",async()=>{
 let now=0;const first=fixture({now:()=>now});now=10000;first.ready();await expect(first.source.ready()).rejects.toThrow();
 now=0;const f=fixture({now:()=>now});f.ready();await f.source.ready();const outcome=f.source.enrollment().catch(error=>error);now=5000;f.reply(1,Buffer.from(JSON.stringify(record)));expect(await outcome).toBeInstanceOf(Error);expect(f.closed).toHaveBeenCalledOnce();
});
