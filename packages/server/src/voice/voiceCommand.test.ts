import {expect,it} from 'vitest';import {Readable} from 'node:stream';
import {readVoiceInput,runVoiceCommand} from './voiceCommand.js';
it('decodes Japanese stdin split inside UTF-8 characters',async()=>{
 const data=Buffer.from('あいう'),parts=[data.subarray(0,1),data.subarray(1,5),data.subarray(5)];
 expect(await readVoiceInput(Readable.from(parts))).toBe('あいう');
});
it('rejects startup options on synthesis rather than silently using another device',async()=>{
 await expect(runVoiceCommand(['synthesize','--acceleration-mode','GPU','--text','x','--output','out.wav'],'/unused')).rejects.toThrow('指定できません');
 await expect(runVoiceCommand(['status','--transport','ipc'],'/unused')).rejects.toThrow('指定できません');
});
