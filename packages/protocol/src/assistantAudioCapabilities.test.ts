import {expect,it} from 'vitest';
import {assistantAudioCapabilities,ASSISTANT_AGENT_KINDS,AssistantSessionGetParams} from './desktopAssistant.js';
it.each(ASSISTANT_AGENT_KINDS)('describes the existing %s integration without claiming the engine or model is ready',kind=>{
 const value=assistantAudioCapabilities(kind);
 expect(value).toMatchObject({kind,nativeAudio:kind==='codex',localTranscription:true});
 expect(value.nativeAudioReason.length).toBeGreaterThan(0);
 if(kind==='codex')expect(value.nativeAudioReason).toContain('待機中');
 else expect(value.nativeAudioReason).toContain('内容を確認');
});
it('keeps native audio disabled for missing and unimplemented agents',()=>{
 for(const kind of [null,'future-agent'])expect(assistantAudioCapabilities(kind)).toMatchObject({kind,nativeAudio:false,localTranscription:true});
});
it('keeps discovery parameters device-scoped without arbitrary CLI or model options',()=>{
 const value={deviceId:'00000000-0000-4000-8000-000000000001'};
 expect(AssistantSessionGetParams.safeParse(value).success).toBe(true);
 expect(AssistantSessionGetParams.safeParse({...value,command:'other-agent'}).success).toBe(false);
});
