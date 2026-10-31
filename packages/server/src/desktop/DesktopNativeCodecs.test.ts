import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {DesktopNativeVideo} from './DesktopNativeVideo.js';
import {DesktopMediaStatus,DesktopMediaStream} from '@sodashitsu/protocol';
const fixtures=Object.fromEntries([['h264','h264-generated.json'],['h264-444','h264-444-software-generated.json'],['hevc','hevc-hardware-generated.json'],['av1','av1-software-generated.json']].map(([name,file])=>[name,JSON.parse(readFileSync(new URL(`../../../../scripts/remote-desktop/fixtures/${file}`,import.meta.url),'utf8'))]));
function fixture(codecs=true){
 const send=vi.fn((_value:unknown)=>true),write=vi.fn<(m:Record<string,unknown>)=>void>(),policy=vi.fn();
 const video=new DesktopNativeVideo({enabled:true,codecs,width:640,sourceWidth:640,sourceHeight:360,fps:30,send,write,policy,buffered:()=>0});
 const start=(codec='hevc')=>{video.fromViewer({type:'media',enabled:true,settings:{transport:'native',codec}});return write.mock.calls.filter(([m])=>m.type==='native_video'&&m.enabled).at(-1)![0].id as string;};
 const frame=(id:string,codec='hevc')=>{const f=fixtures[codec],p=f.packets[0];return {type:'native_frame',id,seq:1,timestamp:33333,key:p.key,codec:p.codec,width:640,height:360,data:p.data,...(codecs?{codecName:codec}:{})};};
 return {video,send,write,policy,start,frame};
}
it.each(['h264','h264-444','hevc','av1'])('sends the real %s format only after negotiated helper output',codec=>{
 const f=fixture(),id=f.start(codec);f.video.fromHelper(f.frame(id,codec));
 const stream=f.send.mock.calls.map(([v])=>v).find(v=>(v as any).type==='media_stream');expect(DesktopMediaStream.parse(stream)).toMatchObject({codecName:codec,mime:`video/${codec==="h264-444"?"h264":codec}`});
 expect(DesktopMediaStatus.parse(f.send.mock.calls.map(([v])=>v).find(v=>(v as any).state==='native'))).toMatchObject({codecRequested:codec,codec});f.video.stop();
});
it('retries H264 once with a fresh id, releases held input, and ignores retired decoder failure',()=>{
 const f=fixture(),first=f.start();f.video.fromHelper(f.frame(first));f.video.fromViewer({type:'native_codec_fallback',id:first});
 const starts=f.write.mock.calls.map(([m])=>m).filter(m=>m.type==='native_video'&&m.enabled);expect(starts).toHaveLength(2);const second=starts[1]!.id as string;expect(second).not.toBe(first);expect(starts[1]).toMatchObject({codec:'h264'});
 expect(f.write).toHaveBeenCalledWith({type:'release'});expect(f.send).toHaveBeenCalledWith({type:'native_codec_reset',id:first});
 f.video.fromViewer({type:'native_codec_fallback',id:first});f.video.fromHelper(f.frame(first));f.video.fromHelper(f.frame(second,'h264'));
 expect(f.send.mock.calls.map(([m])=>m)).toContainEqual(expect.objectContaining({state:'native',codecRequested:'hevc',codec:'h264',codecFallback:'decoder'}));
 f.video.fromViewer({type:'native_codec_fallback',id:second});expect(f.write.mock.calls.filter(([m])=>m.type==='native_video'&&m.enabled)).toHaveLength(2);
 const fresh=f.start('hevc');expect(fresh).not.toBe(first);expect(fresh).not.toBe(second);f.video.fromViewer({type:'native_codec_fallback',id:second});expect(f.write.mock.calls.filter(([m])=>m.type==='native_video'&&m.enabled)).toHaveLength(3);f.video.stop();
});
it('records encoder fallback without retrying the failed codec on later decoder failure',()=>{
 const f=fixture(),id=f.start('av1');f.video.fromHelper({...f.frame(id,'h264'),codecFallback:'encoder'});
 expect(f.send.mock.calls.map(([m])=>m)).toContainEqual(expect.objectContaining({codecRequested:'av1',codec:'h264',codecFallback:'encoder'}));f.video.fromViewer({type:'native_codec_fallback',id});
 expect(f.write.mock.calls.filter(([m])=>m.type==='native_video'&&m.enabled)).toHaveLength(1);f.video.stop();
});
it('keeps new codec commands/metadata out of an old helper request',()=>{
 const f=fixture(false),id=f.start('hevc');expect(f.write.mock.calls[0]![0]).not.toHaveProperty('codec');f.video.fromHelper(f.frame(id,'h264'));
 expect(f.send.mock.calls.map(([v])=>v).find(v=>(v as any).type==='media_stream')).not.toHaveProperty('codecName');
 expect(()=>f.video.fromHelper({...f.frame(id,'hevc'),seq:2,timestamp:66666})).toThrow();f.video.stop();
});

it('stops without opening a replacement stream when the input revocation fence cannot be delivered',()=>{
 const f=fixture(),id=f.start();f.video.fromHelper(f.frame(id));
 f.send.mockImplementation((m:unknown)=>(m as {type?:string}).type!=='native_codec_reset');
 f.video.fromViewer({type:'native_codec_fallback',id});
 expect(f.write.mock.calls.filter(([m])=>m.type==='native_video'&&m.enabled)).toHaveLength(1);
 expect(f.write).toHaveBeenCalledWith({type:'release'});
 expect(f.send.mock.calls.map(([m])=>m)).toContainEqual(expect.objectContaining({state:'images',reason:'congested'}));
 f.video.stop();
});
