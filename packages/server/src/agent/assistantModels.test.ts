import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import {readAssistantModels} from './assistantModels.js';
vi.mock('node:child_process',()=>({spawn:vi.fn()}));
const dirs:string[]=[];
afterEach(async()=>{vi.unstubAllEnvs();vi.useRealTimers();vi.mocked(spawn).mockReset();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
it('reads bounded Codex metadata and filters hidden/invalid models and unsupported effort tiers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-model-cache-'));dirs.push(dir);vi.stubEnv('CODEX_HOME',dir);
 await writeFile(join(dir,'models_cache.json'),JSON.stringify({models:[{slug:'gpt-test',display_name:'Generated GPT',supported_reasoning_levels:[{effort:'low'},{effort:'xhigh'},{effort:'unknown'}]},{slug:'private-hidden',visibility:'hide'},{slug:'--unsafe'}]}));
 expect(await readAssistantModels('codex')).toEqual({models:[{id:'gpt-test',label:'Generated GPT',efforts:['low','xhigh']}],message:''});
 await writeFile(join(dir,'models_cache.json'),' '.repeat(2*1024*1024+1));expect((await readAssistantModels('codex')).models).toEqual([]);
});
it('uses only MSP initialize and model/list, then terminates the reader',async()=>{
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true;})});
 const sent:any[]=[];child.stdin.on('data',chunk=>{const request=JSON.parse(chunk.toString());sent.push(request);if(request.id===1)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:1,result:{}})+'\n'));if(request.id===2)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:2,result:{models:[{modelId:'muse-generated',displayLabel:'Generated Muse',variants:['low','high'],reasoningEffortVariants:[]}]}})+'\n'));});
 vi.mocked(spawn).mockReturnValue(child as never);
 expect((await readAssistantModels('muse')).models).toEqual([{id:'muse-generated',label:'Generated Muse',efforts:['low','high']}]);
 expect(sent.map(r=>r.method)).toEqual(['initialize','initialized','model/list']);expect(child.kill).toHaveBeenCalledWith('SIGKILL');
});
it('kills a stalled model query and returns a safe fallback',async()=>{
 vi.useFakeTimers();const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{child.emit('close',null);return true;})});
 vi.mocked(spawn).mockReturnValue(child as never);const result=readAssistantModels('muse');await vi.advanceTimersByTimeAsync(10000);expect((await result).models).toEqual([]);expect(child.kill).toHaveBeenCalledOnce();
});

it('rejects a symlinked model cache rather than following it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-model-link-'));dirs.push(dir);vi.stubEnv('CODEX_HOME',dir);
 const target=join(dir,'target.json');await writeFile(target,JSON.stringify({models:[{slug:'secret-model'}]}));await symlink(target,join(dir,'models_cache.json'));
 expect((await readAssistantModels('codex')).models).toEqual([]);
});
it('cleans up the owned process group after a successful text catalog command',async()=>{
 const kill=vi.spyOn(process,'kill').mockReturnValue(true);
 try{
  const child=Object.assign(new EventEmitter(),{pid:987654321,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
  vi.mocked(spawn).mockReturnValue(child as never);const result=readAssistantModels('agy');
  queueMicrotask(()=>{child.stdout.write('gemini-generated-high\tGenerated model\n');child.emit('close',0);});
  expect((await result).models).toEqual([{id:'gemini-generated-high',label:'Generated model',efforts:['high']}]);expect(kill).toHaveBeenCalledWith(-987654321,'SIGKILL');
 }finally{kill.mockRestore();}
});
