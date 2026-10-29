import {afterEach,expect,it,vi} from "vitest";
import {DesktopNativeDrag} from "./nativeDrag.js";
import type {DesktopFileClient} from "./fileClient.js";
const clean:Array<()=>void>=[];afterEach(()=>{for(const fn of clean.splice(0).reverse())fn();});
const point={x:0.3,y:0.4,clientX:100,clientY:100},moved={...point,x:0.4,clientX:110};
function fixture(){
 let now=100,allowed=true;const offer={lease:crypto.randomUUID(),generation:crypto.randomUUID(),entries:[{name:"generated.txt",directory:false,bytes:70000,sha256:"a".repeat(64)}]},sent:any[]=[],calls:any[]=[],fallback=vi.fn(),handoff=vi.fn(),release=vi.fn(),status=vi.fn();
 const request=vi.fn(async(value:any):Promise<any>=>{calls.push(value);if(value.action==="native_prepare")return {native:offer};if(value.action==="native_activate")return {id:offer.lease};if(value.action==="native_read")return {data:"YQ==",offset:value.offset};return {};});
 const core=new DesktopNativeDrag({files:{request}as unknown as DesktopFileClient,origin:location.origin,send:value=>sent.push(value),valid:()=>allowed,fallback,handoff,release,status,now:()=>now});clean.push(()=>core.stop());
 const arm=()=>{expect(core.begin(point)).toBe(true);const gesture=sent.at(-1).gesture;core.sent(7);core.event({type:"armed",gesture});core.ack(7);return gesture;};
 return {core,offer,sent,calls,request,fallback,handoff,release,status,arm,clock:(value:number)=>{now=value;},revoke:()=>{allowed=false;}};
}
async function turn(){for(let i=0;i<8;i++)await Promise.resolve();}
it("falls back to normal input when the admission clock is invalid",()=>{const f=fixture();f.clock(NaN);expect(f.core.begin(point)).toBe(false);expect(f.sent).toEqual([]);expect(f.core.pending).toBe(false);});
it("leaves ordinary clicks alone and prepares only after a moved applied down",async()=>{
 const f=fixture(),gesture=f.arm();await turn();expect(f.request).not.toHaveBeenCalled();expect(f.core.pointer(point,"up",0)).toBe(false);expect(f.fallback).toHaveBeenCalledWith(undefined);expect(f.calls).toEqual([{action:"native_abort",gesture}]);
});
it("hands off only after the exact release result and uses unique B ids for contiguous native chunks",async()=>{
 const f=fixture(),gesture=f.arm();expect(f.core.pointer(moved,"move",1)).toBe(true);await turn();expect(f.calls.slice(0,2).map(v=>v.action)).toEqual(["native_prepare","native_activate"]);expect(f.handoff).toHaveBeenCalledOnce();expect(f.sent.find(v=>v.type==="start")).toEqual({type:"start",gesture,offer:f.offer});
 const request=crypto.randomUUID();for(const offset of [0,65536]){f.core.event({type:"need",gesture,request,index:0,offset,length:1});await turn();}
 const reads=f.calls.filter(v=>v.action==="native_read");expect(reads.map(v=>v.offset)).toEqual([0,65536]);expect(new Set(reads.map(v=>v.request)).size).toBe(2);expect(reads.every(v=>v.request!==request)).toBe(true);expect(f.sent.filter(v=>v.type==="bytes").map(v=>v.request)).toEqual([request,request]);
 f.core.event({type:"done",gesture,ok:true});expect(f.status).toHaveBeenLastCalledWith("Explorerへのコピーが完了しました");expect(f.core.pending).toBe(false);
});
it("does not forward a buffered move until a failed preparation falls back",async()=>{
 const f=fixture();f.request.mockImplementation(async(value:any)=>{f.calls.push(value);if(value.action==="native_prepare")throw Error("not Explorer");return {};});f.arm();f.core.pointer(moved,"move",1);expect(f.fallback).not.toHaveBeenCalled();await turn();expect(f.fallback).toHaveBeenCalledWith(moved);expect(f.handoff).not.toHaveBeenCalled();expect(f.sent.some(v=>v.type==="start")).toBe(false);
});
it("does not start native work if handoff reentrantly cancels its scope",async()=>{
 const f=fixture();f.handoff.mockImplementation(()=>f.core.stop());f.arm();f.core.pointer(moved,"move",1);await turn();expect(f.sent.some(v=>v.type==="start")).toBe(false);expect(f.calls.filter(v=>v.action==="native_abort").length).toBeGreaterThan(0);
});
it("blocks another gesture until the cancelled native process actually closes",async()=>{
 const f=fixture(),gesture=f.arm();f.core.pointer(moved,"move",1);await turn();f.core.cancel();expect(f.release).toHaveBeenCalledOnce();expect(f.core.begin(point)).toBe(false);f.core.event({type:"done",gesture,ok:false});expect(f.core.begin(point)).toBe(true);
});
it("does not revive a selection returned after its pointer was released",async()=>{
 const f=fixture();let complete!:(v:unknown)=>void;f.request.mockImplementation(async(value:any)=>{f.calls.push(value);if(value.action==="native_prepare")return new Promise(resolve=>{complete=resolve;});return {};});f.arm();f.core.pointer(moved,"move",1);await Promise.resolve();f.core.pointer(moved,"up",0);complete({native:f.offer});await turn();expect(f.sent.some(v=>v.type==="start")).toBe(false);expect(f.calls.some(v=>v.action==="native_activate")).toBe(false);
});
for(const mode of ["deadline","revoked","wrong-release"]){it(`does not admit a ${mode} selection`,async()=>{
 const f=fixture();f.arm();if(mode==="deadline")f.clock(850);if(mode==="revoked")f.revoke();if(mode==="wrong-release")f.request.mockImplementation(async(value:any)=>value.action==="native_prepare"?{native:f.offer}:{id:crypto.randomUUID()});f.core.pointer(moved,"move",1);await turn();expect(f.sent.some(v=>v.type==="start")).toBe(false);
});}
