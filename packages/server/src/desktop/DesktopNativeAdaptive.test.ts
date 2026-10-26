import {expect,it,vi} from 'vitest';
import {performance} from 'node:perf_hooks';
import {decodeDesktopMediaChunk} from '@sodashitsu/protocol';
import {DesktopNativeVideo} from './DesktopNativeVideo.js';
import {DesktopNativeResolution} from './DesktopNativeResolution.js';
function fixture(){
 const send=vi.fn((_value:unknown)=>true),write=vi.fn<(v:Record<string,unknown>)=>void>(),policy=vi.fn();
 const video=new DesktopNativeVideo({enabled:true,adaptive:true,cadence:true,window:3,width:1280,sourceWidth:1600,sourceHeight:1000,fps:30,send,write,policy,buffered:()=>0});
 video.fromViewer({type:'media',enabled:true,settings:{transport:'native'}});
 const id=write.mock.calls.find(([m])=>m.type==='native_video')![0].id as string;
 const frame=(seq:number,generation=1)=>({type:'native_frame',id,generation,seq,timestamp:seq*33333,key:seq===1||generation===2,...(generation===2?{width:960,height:600,codec:'avc1.420420'}:{width:1280,height:800,codec:'avc1.42041f'}),data:Buffer.from([0,0,0,1,0x65,1,2]).toString('base64')});
 const ack=(seq:number,generation=1)=>video.fromViewer({type:'native_video_ack',id,generation,seq});
 const profile=()=> (video as any).profile((video as any).active,{width:960,height:600});
 const applied=(baseSeq=3)=>video.fromHelper({type:'native_profile_applied',id,generation:2,baseSeq,width:960,height:600,codec:'avc1.420420'});
 return {video,send,write,policy,id,frame,ack,profile,applied};
}
it('drains frames made before the command was read, obtains actual SPS codec, then resumes only the matching format',()=>{
 const f=fixture();f.video.fromHelper(f.frame(1));f.video.fromHelper(f.frame(2));f.profile();f.video.fromHelper(f.frame(3));
 expect(()=>f.applied()).toThrow('barrier');for(let seq=1;seq<=3;seq++)f.ack(seq);
 f.applied();expect(f.send).toHaveBeenCalledWith(expect.objectContaining({type:'media_stream',generation:2,baseSeq:3,codec:'avc1.420420',width:960}));
 expect(()=>f.video.fromHelper(f.frame(4,2))).toThrow('order');
 f.video.fromViewer({type:'native_format_ack',id:f.id,generation:2,baseSeq:2});expect(f.write.mock.calls.filter(([m])=>m.type==='native_profile_resume')).toHaveLength(0);
 f.video.fromViewer({type:'native_format_ack',id:f.id,generation:2,baseSeq:3});
 expect(f.write).toHaveBeenLastCalledWith({type:'native_profile_resume',id:f.id,generation:2,baseSeq:3});
 f.video.fromHelper(f.frame(4,2));const packets=f.send.mock.calls.map(([v])=>v).filter(v=>v instanceof Uint8Array) as Uint8Array[];
 expect(decodeDesktopMediaChunk(packets.at(-1)!)).toMatchObject({generation:2,seq:4});
 f.ack(4,1);expect((f.video as any).active.pending).toHaveLength(1);f.ack(4,2);
 expect(f.policy.mock.calls).toEqual([[true]]);expect(f.write.mock.calls.filter(([m])=>m.type==='release')).toHaveLength(0);
 expect(f.send.mock.calls.filter(([m])=>(m as any).type==='media_status')).toHaveLength(2);
 f.video.stop();
});
it('does not renew input freshness from format ACK or the age of a retained IDR',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(1000);
 try{
 const f=fixture();f.video.fromHelper(f.frame(1));f.ack(1);f.profile();
 f.applied(1);clock.mockReturnValue(3800);f.video.fromViewer({type:'native_format_ack',id:f.id,generation:2,baseSeq:1});
 expect(f.video.hasFreshDraw()).toBe(false);f.video.fromHelper(f.frame(2,2));clock.mockReturnValue(3900);f.video.tick();expect(f.policy).toHaveBeenLastCalledWith(true);f.ack(2,2);expect(f.video.hasFreshDraw()).toBe(false);f.video.fromHelper(f.frame(3,2));f.ack(3,2);expect(f.video.hasFreshDraw()).toBe(true);f.video.stop();
 }finally{clock.mockRestore();}
});
it('bounds the whole barrier and ignores late ACK after a stopped session',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(1000);
 try{const f=fixture();f.video.fromHelper(f.frame(1));f.ack(1);f.profile();f.video.tick(4000);expect(f.policy).toHaveBeenLastCalledWith(false);const count=f.write.mock.calls.length;
 f.video.fromViewer({type:'native_format_ack',id:f.id,generation:2,baseSeq:1});expect(f.write.mock.calls).toHaveLength(count);
 }finally{clock.mockRestore();}
});
it('uses sustained pixel cost and slowly recovers within even original dimensions',()=>{
 const q=new DesktopNativeResolution({width:1280,height:800,fps:60});let now=0;const window=(cost:number)=>{let size;for(let i=0;i<12;i++){now+=200;size=q.sample(cost,now)??size;}return size;};
 expect(window(50)).toBeUndefined();expect(window(50)).toBeUndefined();expect(window(50)).toEqual({width:960,height:600});
 for(let i=0;i<3;i++)window(50);
 for(let i=0;i<7;i++)expect(window(1)).toBeUndefined();expect(window(1)).toEqual({width:960,height:600});
});

it('reduces resolution after sustained loss/queue even with cheap pixels, and does not react to an isolated event',()=>{
 const q=new DesktopNativeResolution({width:1280,height:800,fps:30});let now=0;
 const sample=(congested:boolean)=>{let size;for(let i=0;i<10;i++){now+=200;size=q.sample(1,now,congested)??size;}return size;};
 expect(sample(true)).toBeUndefined();expect(sample(false)).toBeUndefined();expect(sample(false)).toBeUndefined();
 expect(sample(true)).toBeUndefined();expect(sample(true)).toBeUndefined();expect(sample(true)).toEqual({width:960,height:600});
});
