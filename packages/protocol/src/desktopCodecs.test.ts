import {expect,it} from 'vitest';
import {DesktopMediaStream,DesktopMediaSettings,DesktopNativeCodecString,RemoteDesktopViewerMessage,isDesktopNativeStream} from './index.js';
const id='22222222-2222-4222-8222-222222222222';
it.each([['h264','video/h264','avc1.42041f'],['h264-444','video/h264','avc1.f4001f'],['hevc','video/hevc','hev1.1.6.L63.B0'],['av1','video/av1','av01.0.08M.08']])('binds %s family, MIME and actual header string', (codecName,mime,codec)=>{
 const stream=DesktopMediaStream.parse({type:'media_stream',id,generation:1,codecName,mime,codec,width:640,height:360});expect(isDesktopNativeStream(stream)).toBe(true);
 expect(DesktopMediaStream.safeParse({...stream,mime:'video/garbage'}).success).toBe(false);
});
it('bounds format and fallback input and leaves the legacy defaults unchanged',()=>{
 expect(DesktopMediaSettings.parse({})).not.toHaveProperty('codec');expect(DesktopNativeCodecString.safeParse('av01.9.08M.08').success).toBe(false);
 expect(DesktopMediaStream.safeParse({type:'media_stream',id,generation:1,codecName:'hevc',mime:'video/hevc',codec:'avc1.42041f',width:640,height:360}).success).toBe(false);
 expect(RemoteDesktopViewerMessage.parse({type:'native_codec_fallback',id})).toEqual({type:'native_codec_fallback',id});expect(RemoteDesktopViewerMessage.safeParse({type:'native_codec_fallback',id,input:{}}).success).toBe(false);
});
