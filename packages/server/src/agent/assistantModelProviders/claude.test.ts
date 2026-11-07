import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('node:child_process',()=>({spawn:mocks.spawn}));
import {parseClaudeModelOptions,readClaudeModelOptions} from './claude.js';
import {readCopilotModelOptions} from './copilot.js';

describe('read-only model providers',()=>{
 let child:EventEmitter&{stdin:PassThrough;stdout:PassThrough;stderr:PassThrough;kill:ReturnType<typeof vi.fn>};
 beforeEach(()=>{
  child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true;})});
  mocks.spawn.mockReset().mockReturnValue(child);
 });
 afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
 it('projects only explicit model efforts and sanitizes labels',()=>{
  expect(parseClaudeModelOptions([
   {value:'opus',displayName:'Opus\nname',supportsEffort:true,supportedEffortLevels:['low','xhigh','max','max','future']},
   {value:'haiku',displayName:'Haiku',supportsEffort:false,supportedEffortLevels:['high']},
   {value:'sonnet',displayName:'Sonnet'},
  ])).toEqual([{id:'opus',label:'Opus name',efforts:['low','xhigh','max']},{id:'haiku',label:'Haiku',efforts:[]},{id:'sonnet',label:'Sonnet',efforts:[]}]);
 });
 it.each([null,{},[{value:'../bad id'}],[{value:'opus'},{value:'opus'}],Array.from({length:513},(_,i)=>({value:`m${i}`}))])('rejects malformed, duplicate or unbounded catalog',value=>{
  expect(()=>parseClaudeModelOptions(value)).toThrow();
 });
 it('accepts up to 512 distinct options',()=>expect(parseClaudeModelOptions(Array.from({length:512},(_,i)=>({value:`m${i}`})))).toHaveLength(512));
 it('sends only SDK initialize to owned CLI and closes it after metadata',async()=>{
  const start=readClaudeModelOptions();
  await vi.waitFor(()=>expect(mocks.spawn).toHaveBeenCalledOnce());
  const [file,args,options]=mocks.spawn.mock.calls[0]!;
  expect(file).toBe('claude');
  expect(args).toEqual(expect.arrayContaining(['--no-session-persistence','--setting-sources','','--settings','{"disableAllHooks":true}','--strict-mcp-config','--tools','--no-chrome']));
  expect(args).not.toContain('--resume');expect(args).not.toContain('--continue');
  expect(options.cwd).toContain('soda-claude-model-options-');
  expect(options.env.HOME).toBe(options.cwd);expect(options.env.CLAUDE_CONFIG_DIR).toBe(options.cwd);
  const sent=child.stdin.read()?.toString();
  expect(JSON.parse(sent)).toEqual({type:'control_request',request_id:'sodashitsu-model-options',request:{subtype:'initialize'}});
  child.stdout.write(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:'other',response:{models:[]}}})+'\n');
  child.stdout.write(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:'sodashitsu-model-options',response:{models:[{value:'opus',displayName:'Opus',supportsEffort:true,supportedEffortLevels:['high']}]}}})+'\n');
  expect(await start).toMatchObject({source:'cli',models:[{id:'opus',efforts:['high']}]});
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  // Its temporary working directory is removed; regular authentication files are never copied.
  const {stat}=await import('node:fs/promises');await expect(stat(options.cwd)).rejects.toThrow();
 });
 it.each(['malformed','rejected','output-limit','exit'])('returns unavailable on %s without leaking raw provider output',async mode=>{
  const start=readClaudeModelOptions();await vi.waitFor(()=>expect(mocks.spawn).toHaveBeenCalled());
  if(mode==='malformed')child.stdout.write('provider secret raw text\n');
  if(mode==='rejected')child.stdout.write(JSON.stringify({type:'control_response',response:{subtype:'error',request_id:'sodashitsu-model-options',error:'secret'}})+'\n');
  if(mode==='output-limit')child.stderr.write(Buffer.alloc(2*1024*1024+1));
  if(mode==='exit')child.emit('close',1);
  expect(await start).toMatchObject({source:'unavailable',models:[]});
  expect(JSON.stringify(await start)).not.toContain('secret');
 });
 it('times out an unresponsive owned process',async()=>{
  vi.useFakeTimers();const start=readClaudeModelOptions();
  await vi.waitFor(()=>expect(mocks.spawn).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await start).toMatchObject({source:'unavailable',models:[]});expect(child.kill).toHaveBeenCalledWith('SIGKILL');
 });
 it('marks Copilot installed schema references rather than fabricating account models or efforts',async()=>{
  const result=await readCopilotModelOptions();expect(result.source).toBe('reference');
  expect(result.models).toHaveLength(8);expect(result.models.every(m=>m.efforts.length===0)).toBe(true);
  expect(result.message).toContain('未取得');expect(mocks.spawn).not.toHaveBeenCalled();
 });
});
