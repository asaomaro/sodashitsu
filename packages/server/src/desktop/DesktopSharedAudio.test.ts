import {expect,it,vi} from "vitest";
import {DesktopSharedAudio} from "./DesktopSharedAudio.js";
import type {DesktopNativeAudioHooks} from "./DesktopNativeAudio.js";
function setup(){
 let now=1,active=true;const sources:{hooks:DesktopNativeAudioHooks;stop:ReturnType<typeof vi.fn>}[]=[];
 const pool=new DesktopSharedAudio<object>({id:"22222222-2222-4222-8222-222222222222",synthetic:true,active:()=>active,timestamp:()=>0,write:()=>{},now:()=>now,create:hooks=>{const source={hooks,stop:vi.fn()};sources.push(source);return source;}});
 const listener=()=>({id:crypto.randomUUID(),synthetic:true,active:()=>true,videoTimestamp:()=>0,write:()=>{},send:vi.fn(()=>true),state:vi.fn()});
 return {pool,sources,listener,advance:()=>now++,end:()=>active=false};
}
it("captures/encodes once and gives each viewer independent live-only delivery and teardown",()=>{
 const f=setup(),a={},b={},ah=f.listener(),bh=f.listener(),la=f.pool.attach(a,ah);f.sources[0]!.hooks.state("running");f.advance();const lb=f.pool.attach(b,bh);
 expect(f.sources).toHaveLength(1);expect(bh.state).toHaveBeenCalledWith("running");f.sources[0]!.hooks.send(new Uint8Array([1]),1);expect(ah.send).toHaveBeenCalledOnce();expect(bh.send).not.toHaveBeenCalled();
 f.sources[0]!.hooks.send(new Uint8Array([2]),2);expect(bh.send).toHaveBeenCalledOnce();la.stop();expect(f.sources[0]!.stop).not.toHaveBeenCalled();f.sources[0]!.hooks.send(new Uint8Array([3]),3);expect(ah.send).toHaveBeenCalledTimes(2);expect(bh.send).toHaveBeenCalledTimes(2);lb.stop();expect(f.sources[0]!.stop).toHaveBeenCalledOnce();f.pool.dispose();
});
it("does not mark late viewers running before the source handshake and isolates a blocked sender",()=>{
 const f=setup(),ah=f.listener(),bh=f.listener();ah.send.mockReturnValue(false);f.pool.attach({},ah);f.pool.attach({},bh);expect(bh.state).toHaveBeenLastCalledWith("starting");f.sources[0]!.hooks.state("running");f.sources[0]!.hooks.send(new Uint8Array([1]),2);expect(bh.send).toHaveBeenCalledOnce();expect(f.sources[0]!.stop).not.toHaveBeenCalled();f.pool.dispose();expect(f.sources[0]!.stop).toHaveBeenCalledOnce();expect(bh.state).toHaveBeenLastCalledWith("unavailable");
});
it("source failure retires old leases and an old stop cannot remove a new lease",()=>{
 const f=setup(),a={},old=f.listener(),lease=f.pool.attach(a,old);f.sources[0]!.hooks.state("unavailable");const next=f.listener();f.pool.attach(a,next);expect(f.sources).toHaveLength(2);lease.stop();f.sources[1]!.hooks.send(new Uint8Array([1]),2);expect(next.send).toHaveBeenCalledOnce();f.pool.dispose();
});
it("never captures after source ownership ends",()=>{
 const f=setup();f.end();const hooks=f.listener();f.pool.attach({},hooks);expect(f.sources).toHaveLength(0);expect(hooks.state).toHaveBeenCalledWith("unavailable");f.pool.dispose();
});
