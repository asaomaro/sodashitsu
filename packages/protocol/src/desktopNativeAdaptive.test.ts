import {expect,it} from 'vitest';
import {DesktopNativeFrameNotice,DesktopNativeFormatAck,DesktopNativeProfilePending,DesktopMediaStream,RemoteDesktopViewerMessage} from './index.js';
const id='22222222-2222-4222-8222-222222222222';
it('strictly bounds format ACKs separately from draw ACKs and OS input',()=>{
 const ack={type:'native_format_ack',id,generation:2,baseSeq:17};expect(RemoteDesktopViewerMessage.parse(ack)).toEqual(ack);
 for(const wrong of [{...ack,generation:1},{...ack,baseSeq:-1},{...ack,baseSeq:0xffffffff},{...ack,seq:1},{...ack,nativeDraw:true}])expect(DesktopNativeFormatAck.safeParse(wrong).success).toBe(false);
 expect(DesktopNativeFrameNotice.parse({type:'native_frame_notice',id,generation:2,seq:18,bytes:100})).toMatchObject({generation:2});
 expect(DesktopNativeProfilePending.parse({type:'native_profile_pending',id,generation:2})).toMatchObject({generation:2});
 expect(DesktopMediaStream.parse({type:'media_stream',id,generation:2,baseSeq:17,mime:'video/h264',codec:'avc1.420420',width:960,height:600})).toMatchObject({baseSeq:17});
});
