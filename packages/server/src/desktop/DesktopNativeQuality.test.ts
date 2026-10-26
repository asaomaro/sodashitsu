import {expect,it} from 'vitest';
import {DesktopNativeQuality} from './DesktopNativeQuality.js';
const clean={ack:20,cost:5,decode:2,lost:false,buffered:0};
function step(q:DesktopNativeQuality,start:number,value=clean,count=16){let result;for(let i=1;i<=count;i++){const v=q.sample(value,start+i*200);if(v)result=v;}return result;}
it('caps cadence by window capacity without treating fixed WAN latency as bitrate loss',()=>{
 const q=new DesktopNativeQuality({fps:60,kbps:2500,window:3},0);
 const v=step(q,0,{...clean,ack:120});expect(v).toEqual({fps:21,kbps:2500});
 expect(step(q,4000,{...clean,ack:120})).toBeUndefined();
});
it('distinguishes source cost, congestion and hysteretic recovery within original limits',()=>{
 const q=new DesktopNativeQuality({fps:60,kbps:2500,window:3},0);
 expect(step(q,0,{...clean,cost:50})).toEqual({fps:17,kbps:2500});
 expect(step(q,4000)).toBeUndefined();
 expect(step(q,15000)).toEqual({fps:23,kbps:2500});
 for(let now=30000;now<200000;now+=15000)step(q,now);
 expect(step(q,200000)).toBeUndefined();
 const c=new DesktopNativeQuality({fps:30,kbps:128,window:1},0);
 for(let now=0;now<100000;now+=4000){const v=step(c,now,{...clean,lost:true,ack:1000});if(v){expect(v.fps).toBeGreaterThanOrEqual(5);expect(v.kbps).toBe(128);}}
});
it('does not raise low user caps or react to codec startup outliers',()=>{
 const q=new DesktopNativeQuality({fps:1,kbps:128,window:1},0);
 for(let i=0;i<3;i++)expect(q.sample({...clean,cost:60000,ack:60000},i)).toBeUndefined();
 expect(step(q,3000)).toBeUndefined();
});

it.each([1,5])('never lowers cadence in recovery near a low cap (%s)',fps=>{
 const q=new DesktopNativeQuality({fps,kbps:2500,window:1},0);
 const edge={...clean,ack:850/(fps*.98)};
 for(let now=0;now<50000;now+=4000)expect(step(q,now,edge)).toBeUndefined();
});
