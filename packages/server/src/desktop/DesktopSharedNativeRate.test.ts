import {expect,it,vi} from "vitest";
import {performance} from "node:perf_hooks";
import {readFileSync} from "node:fs";
import {DesktopSharedNative} from "./DesktopSharedNative.js";
import {DesktopNativeVideo} from "./DesktopNativeVideo.js";
const generated=JSON.parse(readFileSync(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url),"utf8"));
it("routes viewer ACK cost into one common cadence without restarting video or audio",()=>{
 const clock=vi.spyOn(performance,"now").mockReturnValue(0),commands:any[]=[],members=[{},{}],videos:DesktopNativeVideo[]=[],ids:string[]=[],delivered=[0,0],audioStops=[0,0],audioHooks:any[]=[];
 const pool=new DesktopSharedNative<object>({window:3,write:value=>commands.push(value),policy:()=>{},send:(member,value)=>videos[members.indexOf(member)]!.fromHelper(value)});
 try{
  for(const[index,member]of members.entries()){
   const video=new DesktopNativeVideo({enabled:true,cadence:true,sharedRate:true,audioEnabled:true,audioFactory:hooks=>{audioHooks.push(hooks);return {stop:()=>{audioStops[index]!++;}}},window:3,width:generated.width,sourceWidth:generated.width,sourceHeight:generated.height,fps:30,send:value=>{if(value instanceof Uint8Array)delivered[index]!++;return true;},write:value=>{if((value as any).type==="native_video"&&(value as any).enabled)ids[index]=(value as any).id;pool.command(member,value);},policy:()=>{},buffered:()=>0});videos.push(video);video.fromViewer({type:"media",enabled:true,settings:{transport:"native",audio:true,adaptive:true,maxBitrateKbps:2500}});
  }
  const source=commands.find(m=>m.type==="native_video"&&m.enabled).id;
  for(let seq=1;seq<=24;seq++){
   clock.mockReturnValue(seq*200);const packet=generated.packets[seq===1?0:1];pool.receive({type:"native_frame",id:source,seq,timestamp:seq*33333,key:seq===1,...(seq===1?{codec:packet.codec}:{}),width:generated.width,height:generated.height,data:packet.data,captureMs:80});
   for(const[index,video]of videos.entries())video.fromViewer({type:"native_video_ack",id:ids[index],seq,generation:1});
  }
  expect(audioHooks).toHaveLength(2);expect(audioStops).toEqual([0,0]);expect(audioHooks.map(hooks=>hooks.active())).toEqual([true,true]);expect(audioHooks.map(hooks=>hooks.videoTimestamp())).toEqual([24*33333,24*33333]);
  expect(delivered).toEqual([24,24]);const rates=commands.filter(m=>m.type==="native_rate");expect(rates.length).toBeGreaterThan(0);expect(rates.every(m=>m.id===source&&m.fps<30&&m.fps>=5&&m.kbps<=2500)).toBe(true);expect(commands.filter(m=>m.type==="native_video"&&m.enabled)).toHaveLength(1);expect(commands.some(m=>m.type==="native_audio"||m.type==="release")).toBe(false);
 }finally{for(const video of videos)video.stop();pool.dispose();clock.mockRestore();}
});
