import {afterEach,expect,it,vi} from 'vitest';
import {Writable} from 'node:stream';
import {performance} from 'node:perf_hooks';
import {DesktopMicrophone} from './DesktopMicrophone.js';
const id='22222222-2222-4222-8222-222222222222';
const cleanup:Array<()=>void>=[];
afterEach(()=>{for(const stop of cleanup.splice(0))stop();vi.restoreAllMocks();vi.useRealTimers();});
function fixture(immediate=false){
 let now=0,allowed=true;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const packets:Buffer[]=[],copies:Buffer[]=[],callbacks:Array<(error?:Error)=>void>=[],events:any[]=[];
 const socket=immediate?new Writable({write(packet,_encoding,done){packets.push(packet);copies.push(Buffer.from(packet));done();}}):{destroy:vi.fn(),write(packet:Buffer,done:(error?:Error)=>void){packets.push(packet);copies.push(Buffer.from(packet));callbacks.push(done);}};
 const mic=new DesktopMicrophone({synthetic:true,allowed:()=>allowed,write(){},send(value){events.push(value);return true;}});
 const state:any={id,name:'generated',seq:0,ready:true,busy:false,header:Buffer.alloc(0),at:0,tokens:12,rateAt:0,socket,queue:[]};
 (mic as any).current=state;
 cleanup.push(()=>{mic.stop();for(const copy of copies)copy.fill(0);});
 return{mic,state,packets,copies,callbacks,events,at(value:number){now=value;},revoke(){allowed=false;},send(seq:number){const pcm=Buffer.alloc(1920);for(let n=0;n<960;n++)pcm.writeInt16LE(seq,n*2);mic.fromViewer({type:'microphone_frame',id,seq,data:pcm.toString('base64')});pcm.fill(0);},get written(){return copies.map(b=>b.readUInt32LE());},get acked(){return events.filter(e=>e.type==='microphone_ack').map(e=>e.seq);}};
}
it('preserves a legal same-turn burst with an immediately completing real Writable',async()=>{
 const f=fixture(true);for(let seq=1;seq<=6;seq++)f.send(seq);await new Promise<void>(r=>setImmediate(r));
 expect(f.written).toEqual([1,2,3,4,5,6]);expect(f.acked).toEqual([1,2,3,4,5,6]);expect(f.state.queue).toHaveLength(0);
 expect(f.copies.map(b=>b.readInt16LE(12))).toEqual([1,2,3,4,5,6]);
 expect(f.events.some(e=>e.state==='unavailable')).toBe(false);
});
it('retains legal sub100ms jitter/backpressure in order with the unchanged100ms packet deadline',()=>{
 const f=fixture();f.send(1);f.at(20);f.send(2);f.at(40);f.send(3);
 expect(f.state.queue).toHaveLength(2);f.at(60);f.callbacks.shift()!();f.at(80);f.callbacks.shift()!();f.callbacks.shift()!();
 expect(f.written).toEqual([1,2,3]);expect(f.acked).toEqual([1,2,3]);for(const packet of f.copies)expect(packet.readDoubleLE(4)).toBeLessThanOrEqual(Date.now()+100);
 expect(f.packets.every(b=>b.every(n=>n===0))).toBe(true);
});
it('ACKs an expired queued frame without writing it, then drains a fresh successor',()=>{
 const f=fixture();f.send(1);f.at(1);f.send(2);const expired=f.state.queue[0].pcm as Buffer;f.at(70);f.send(3);f.at(102);f.callbacks.shift()!();
 expect(f.written).toEqual([1,3]);expect(expired.every(n=>n===0)).toBe(true);f.callbacks.shift()!();expect(f.acked).toEqual([1,2,3]);
 expect(f.events.some(e=>e.state==='unavailable')).toBe(false);
});
it('bounds inflight plus queued PCM at12 and zeroes everything on overflow',()=>{
 const f=fixture();for(let seq=1;seq<=12;seq++)f.send(seq);expect(f.state.queue).toHaveLength(11);const queued=f.state.queue.map((x:any)=>x.pcm as Buffer);
 f.at(20);f.send(13);expect((f.mic as any).current).toBeUndefined();expect(f.events.at(-1).state).toBe('unavailable');expect(queued.every((b:Buffer)=>b.every(n=>n===0))).toBe(true);expect(f.packets[0]!.every(n=>n===0)).toBe(true);
 f.callbacks.shift()!();expect(f.written).toEqual([1]);expect(f.acked).toEqual([]);
});
it.each(['stop','revoke','write-error'] as const)('zeroes waiting/inflight PCM and suppresses late writes on %s',mode=>{
 const f=fixture();for(let seq=1;seq<=3;seq++)f.send(seq);const queued=f.state.queue.map((x:any)=>x.pcm as Buffer);
 if(mode==='stop')f.mic.stop();else{if(mode==='revoke')f.revoke();f.callbacks.shift()!(mode==='write-error'?Error('generated-write-error'):undefined);}
 expect((f.mic as any).current).toBeUndefined();expect(queued.every((b:Buffer)=>b.every(n=>n===0))).toBe(true);expect(f.packets[0]!.every(n=>n===0)).toBe(true);
 if(mode==='stop')f.callbacks.shift()!();expect(f.written).toEqual([1]);expect(f.acked).toEqual([]);
});
it('keeps the existing100ms inflight timeout and zeroes all queued PCM',()=>{
 vi.useFakeTimers();const f=fixture();f.send(1);f.send(2);const pending=f.state.queue[0].pcm as Buffer;vi.advanceTimersByTime(100);
 expect((f.mic as any).current).toBeUndefined();expect(pending.every(n=>n===0)).toBe(true);f.callbacks.shift()!();expect(f.written).toEqual([1]);expect(f.acked).toEqual([]);
});
it('a synchronous pipe failure also retires and zeroes the packet',()=>{
 const f=fixture();f.state.socket.write=(packet:Buffer)=>{f.packets.push(packet);throw Error('generated-sync-error');};expect(()=>f.send(1)).not.toThrow();expect((f.mic as any).current).toBeUndefined();expect(f.packets[0]!.every(n=>n===0)).toBe(true);expect(f.events.at(-1).state).toBe('unavailable');
});
