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

it('reads Grok ACP model menus without a new session or prompt',async()=>{
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true;})});
 const sent:any[]=[];child.stdin.on('data',chunk=>{const r=JSON.parse(chunk.toString());sent.push(r);if(r.id===1)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:1,result:{}})+'\n'));if(r.id===2)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:2,result:{result:{availableModels:[{modelId:'grok-generated',name:'Generated Grok',_meta:{supportsReasoningEffort:true,reasoningEfforts:[{id:'deep',value:'high'},'low','unsupported']}},{modelId:'grok-no-effort',name:'No effort',_meta:{supportsReasoningEffort:false,reasoningEfforts:['high']}}]}}})+'\n'));});
 vi.mocked(spawn).mockReturnValue(child as never);const result=await readAssistantModels('grok');
 expect(result.models).toEqual([{id:'grok-generated',label:'Generated Grok',efforts:['high','low']},{id:'grok-no-effort',label:'No effort',efforts:[]}]);
 expect(result.message).toContain('Grok CLIから取得');expect(result.message).toContain('5分');
 expect(sent.map(r=>r.method)).toEqual(['initialize','_x.ai/models/list']);expect(sent[0].params.protocolVersion).toBe(1);
 expect(vi.mocked(spawn).mock.calls[0]!.slice(0,2)).toEqual(['grok',['agent','--no-leader','stdio']]);expect(child.kill).toHaveBeenCalledWith('SIGKILL');
});
it('does not substitute fixed models when Grok rejects model discovery',async()=>{
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true;})});
 child.stdin.on('data',chunk=>{const r=JSON.parse(chunk.toString());queueMicrotask(()=>child.stdout.write(JSON.stringify(r.id===1?{id:1,result:{}}:{id:2,error:{code:-32601}})+'\n'));});vi.mocked(spawn).mockReturnValue(child as never);
 expect((await readAssistantModels('grok')).models).toEqual([]);
});
