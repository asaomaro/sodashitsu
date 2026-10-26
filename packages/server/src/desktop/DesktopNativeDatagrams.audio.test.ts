import {afterEach,expect,it,vi} from "vitest";
import {DESKTOP_AUDIO_CHANNEL,DESKTOP_CONTROL_CHANNEL,DESKTOP_VIDEO_CHANNEL} from "@sodashitsu/protocol";
const state=vi.hoisted(()=>({channels:[] as any[]}));
vi.mock("werift",()=>({RTCPeerConnection:class{
 onDataChannel={subscribe:vi.fn()};connectionStateChange={subscribe:vi.fn()};onIceCandidate={subscribe:vi.fn()};localDescription={sdp:"generated"};
 createDataChannel(label:string){let event!:(s:string)=>void;const channel={label,readyState:"connecting",bufferedAmount:0,stateChanged:{subscribe:(fn:typeof event)=>event=fn},onMessage:{subscribe:vi.fn()},send:vi.fn(),change:(s:string)=>{channel.readyState=s;event(s);}};state.channels.push(channel);return channel;}
 async createOffer(){return{};}async setLocalDescription(){}async close(){}
}}));
import {DesktopNativeDatagrams} from "./DesktopNativeDatagrams.js";
afterEach(()=>{state.channels.length=0;});
it("starts video without waiting for optional audio and keeps it alive when that channel closes",async()=>{
 const ready=vi.fn(),fail=vi.fn(),audioFailed=vi.fn(),peer=new DesktopNativeDatagrams({id:"22222222-2222-4222-8222-222222222222",audio:true,audioFailed,iceServers:[],send:()=>true,ready,ack:()=>{},keyframe:()=>{},fail});
 try{await vi.waitFor(()=>expect(state.channels).toHaveLength(3));const channel=(label:string)=>state.channels.find(c=>c.label===label);channel(DESKTOP_VIDEO_CHANNEL).change("open");channel(DESKTOP_CONTROL_CHANNEL).change("open");expect(ready).toHaveBeenCalledOnce();expect(peer.sendAudio(new Uint8Array([1]))).toBe(false);channel(DESKTOP_AUDIO_CHANNEL).change("closed");expect(audioFailed).toHaveBeenCalledOnce();expect(fail).not.toHaveBeenCalled();expect(ready).toHaveBeenCalledOnce();}finally{peer.close();}
});
