import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,appendFile,rm,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {UsageInsightsReader,classifyTool} from './UsageInsights.js';
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const now=Date.parse('2026-11-02T00:00:00Z'),range={from:'2026-10-10',to:'2026-10-20',timezone:'UTC'};
const json=(...rows:unknown[])=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
const usage=(id:string,at='2026-10-15T00:00:00Z')=>({type:'assistant',timestamp:at,cwd:'/workspaces/demo',message:{id,model:'sonnet',usage:{input_tokens:10,output_tokens:20,cache_read_input_tokens:30,cache_creation_input_tokens:40},content:[]}});
const tool=(id:string,name:string,input:unknown={})=>({type:'assistant',timestamp:'2026-10-15T00:00:00Z',message:{content:[{type:'tool_use',id,name,input}]}});
async function fixture(extra:Record<string,number>={}){
 const dir=await mkdtemp(join(tmpdir(),'soda-insights-'));dirs.push(dir);const root=join(dir,'claude','projects'),project=join(root,'demo'),codex=join(dir,'codex'),day=join(codex,'sessions','2026','10','15'),stateDir=join(dir,'state');await mkdir(project,{recursive:true});await mkdir(day,{recursive:true});
 const options={stateDir,claudeRoots:()=>[root],codexHome:()=>codex,now:()=>now,...extra};return {dir,project,day,stateDir,options,reader:new UsageInsightsReader(options)};
}
it('persists numbers, appends incrementally across restart, compares periods and excludes conversation/tool arguments',async()=>{
 const f=await fixture(),file=join(f.project,'main.jsonl');await writeFile(file,json(usage('old','2026-10-01T00:00:00Z'),usage('one'),tool('call','Bash',{command:'SUPER_SECRET_COMMAND'})));
 let r=await f.reader.read(range);expect(r.totals.total).toBe(100);expect(r.previous.total).toBe(100);expect(r.totals.tools).toBe(1);
 r=await new UsageInsightsReader(f.options).read(range);expect(r.totals.total).toBe(100);
 await appendFile(file,json(usage('two')));r=await f.reader.read(range);expect(r.totals.total).toBe(200);expect(r.byProject[0]?.label).toBe('demo');
 expect((await readFile(join(f.stateDir,'usage-insights.sqlite'))).includes(Buffer.from('SUPER_SECRET_COMMAND'))).toBe(false);
 expect(JSON.stringify(r)).not.toContain(f.dir);
});
it('deduplicates copies and response IDs; retains subagent tokens once with the same project and parent',async()=>{
 const f=await fixture();await writeFile(join(f.project,'main.jsonl'),json(usage('a'),usage('a')));await mkdir(join(f.project,'main','subagents'),{recursive:true});
 await writeFile(join(f.project,'main','subagents','agent-sub.jsonl'),json({...usage('b'),cwd:undefined}));
 const r=await f.reader.read(range);expect(r.totals.total).toBe(200);expect(r.byRole.map(r=>[r.key,r.total])).toEqual(expect.arrayContaining([['main',100],['sub',100]]));
 const child=r.sessions.find(s=>s.role==='sub')!;expect(child.parent).toBe(r.sessions.find(s=>s.role==='main')?.key);expect(child.project).toBe('demo');
 const filtered=await f.reader.read({...range,project:r.byProject[0]!.key});expect(filtered.totals.total).toBe(200);
});
it('classifies bash, skill, inferred skill reads and MCP; matches results and leaves unknown outcomes unknown',async()=>{
 const f=await fixture();await writeFile(join(f.project,'main.jsonl'),json(tool('a','Bash',{command:'hidden'}),tool('b','Skill',{skill:'review'}),tool('c','Read',{file_path:'/skills/planning/SKILL.md'}),tool('d','mcp__github__read'),{type:'user',timestamp:'2026-10-15T00:01:00Z',message:{content:[{type:'tool_result',tool_use_id:'a',is_error:true},{type:'tool_result',tool_use_id:'b',content:'never retain this'}]}}));
 const r=await f.reader.read(range);expect(r.totals).toMatchObject({tools:4,knownResults:2,errors:1});expect(r.tools).toEqual(expect.arrayContaining([expect.objectContaining({name:'Bash',category:'shell',failed:1}),expect.objectContaining({name:'review',category:'skill',basis:'direct',success:1}),expect.objectContaining({name:'planning',basis:'inferred'}),expect.objectContaining({name:'mcp__github__read',category:'mcp',unknown:1})]));
});
it('uses explicit Codex responses once instead of also adding cumulative samples, and reads the parent reference',async()=>{
 const f=await fixture(),id='11111111-1111-4111-8111-111111111111',file=join(f.day,`rollout-2026-10-15-${id}.jsonl`),timestamp='2026-10-15T01:00:00Z';
 await writeFile(file,json({type:'session_meta',payload:{cwd:'/workspace/demo',source:{subagent:{thread_spawn:{parent_thread_id:'parent-id'}}},thread_source:'subagent'}},{type:'turn_context',payload:{model:'gpt-6'}},{timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,output_tokens:20,cached_input_tokens:50}}}},{timestamp,type:'token_usage_record',payload:{response_id:'response',usage:{input_tokens:100,output_tokens:20,cached_input_tokens:50}}},{timestamp,type:'response_item',payload:{type:'function_call',call_id:'tool',name:'exec_command',arguments:'{"cmd":"secret"}'}},{timestamp,type:'response_item',payload:{type:'function_call_output',call_id:'tool',output:'{"exit_code":0}'}}));
 const r=await f.reader.read(range);expect(r.totals.total).toBe(120);expect(r.totals.knownResults).toBe(1);expect(r.sessions[0]).toMatchObject({role:'sub',parent:expect.stringContaining('parent-id')});expect(r.byModel[0]?.label).toBe('gpt-6');
});
it('resumes partially scanned lines and sources while reserving work for both kinds',async()=>{
 const f=await fixture({maxBytesPerKind:400});await writeFile(join(f.project,'main.jsonl'),json(usage('a'),usage('b'),usage('c')));
 await writeFile(join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl'),json({timestamp:'2026-10-15T00:00:00Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:50,output_tokens:10}}}}));
 let r=await f.reader.read(range);expect(r.collecting).toBe(true);expect(r.byKind.map(k=>k.key)).toContain('codex');
 for(let i=0;i<6&&r.collecting;i++)r=await f.reader.read(range);
 expect(r.collecting).toBe(false);expect(r.totals.total).toBe(360);
});
it('filters kind/model/role/session, validates timezone, and checks cancellation without leaking the reader lock',async()=>{
 const f=await fixture();await writeFile(join(f.project,'main.jsonl'),json(usage('a')));const r=await f.reader.read(range);
 expect((await f.reader.read({...range,kind:'codex'})).totals.total).toBe(0);expect((await f.reader.read({...range,session:r.sessions[0]!.key})).totals.total).toBe(100);
 await expect(f.reader.read({...range,timezone:'bad/zone'})).rejects.toThrow();
 await expect(f.reader.read(range,()=>{throw new Error('revoked');})).rejects.toThrow('revoked');expect((await f.reader.read(range)).totals.total).toBe(100);
});
it('excludes symlinked logs and rejects a linked numeric database',async()=>{
 const f=await fixture(),outside=join(f.dir,'secret');await writeFile(outside,json(usage('private')));await symlink(outside,join(f.project,'linked.jsonl'));
 const r=await f.reader.read(range);expect(r.totals.total).toBe(0);expect(r.partial).toBe(true);
 const other=join(f.dir,'other-state');await mkdir(other);await symlink(outside,join(other,'usage-insights.sqlite'));await expect(new UsageInsightsReader({...f.options,stateDir:other}).read(range)).rejects.toThrow('unsafe usage index');
});
it('recognizes only actual skill calls or SKILL.md reads',()=>{expect(classifyTool('Bash',{command:'read SKILL.md'}).category).toBe('shell');expect(classifyTool('Read',{file_path:'/tmp/foo.md'}).category).toBe('file');});
it('keeps earlier cumulative usage when a session later starts emitting response records',async()=>{
 const f=await fixture(),timestamp='2026-10-15T01:00:00Z';
 await writeFile(join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl'),json(
  {timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,output_tokens:20,cached_input_tokens:40}}}},
  {timestamp:'2026-10-16T00:00:00Z',type:'token_usage_record',payload:{response_id:'new',usage:{input_tokens:50,output_tokens:10,cached_input_tokens:10}}},
  {timestamp:'2026-10-16T00:00:01Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:150,output_tokens:30,cached_input_tokens:50}}}}
 ));
 const r=await f.reader.read(range);expect(r.totals.total).toBe(180);expect(r.totals.cacheRead).toBe(50);
});
it('does not let Claude discovery exhaust the Codex directory enumeration budget',async()=>{
 const f=await fixture({maxEntriesPerKind:8});for(let i=0;i<12;i++)await writeFile(join(f.project,`main-${i}.jsonl`),json(usage('a')));
 await writeFile(join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl'),json({timestamp:'2026-10-15T00:00:00Z',type:'token_usage_record',payload:{response_id:'new',usage:{input_tokens:50,output_tokens:10}}}));
 expect((await f.reader.read(range)).byKind.map(r=>r.key)).toContain('codex');
});
it('skips malformed content elements and excludes expired data on the first read',async()=>{
 const f=await fixture();await writeFile(join(f.project,'main.jsonl'),json({...usage('bad'),message:{content:[null,1,{type:'tool_use',id:'a',name:'Bash'}]}},usage('expired','2020-01-01T00:00:00Z'),usage('good')));
 const r=await f.reader.read(range);expect(r.totals.total).toBe(100);expect(r.totals.tools).toBe(1);expect(r.coverage.find(c=>c.kind==='claude')?.invalid).toBe(2);expect(r.coverage.find(c=>c.kind==='claude')?.firstAt).toBe(Date.parse('2026-10-15T00:00:00Z'));
});
it('marks comparisons outside numeric retention as partial',async()=>{const f=await fixture();const r=await f.reader.read({from:'2025-12-01',to:'2026-10-31',timezone:'UTC'});expect(r.partial).toBe(true);});
it('distinguishes wrapper-source inference from observed tool invocations',async()=>{
 const f=await fixture();await writeFile(join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl'),json({timestamp:'2026-10-15T00:00:00Z',type:'response_item',payload:{type:'custom_tool_call',call_id:'a',name:'exec',input:'await tools.exec_command({cmd:"private"}); await tools.mcp__github__read({});'}}));
 const r=await f.reader.read(range);expect(r.totals.tools).toBe(1);expect(r.tools.filter(t=>t.nested)).toEqual(expect.arrayContaining([expect.objectContaining({name:'exec_command',basis:'inferred'}),expect.objectContaining({name:'mcp__github__read',basis:'inferred'})]));
});
it('keeps metadata-only live sessions when usage is appended later',async()=>{
 const f=await fixture(),file=join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl');
 await writeFile(file,json({type:'session_meta',payload:{cwd:'/workspace/demo',source:{subagent:{thread_spawn:{parent_thread_id:'parent'}}}}}));
 await f.reader.read(range);await appendFile(file,json({timestamp:'2026-10-15T00:00:00Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:50,output_tokens:10}}}}));
 expect((await f.reader.read(range)).sessions[0]).toMatchObject({role:'sub',project:'demo',parent:expect.stringContaining('parent')});
});
it('recovers from page-capacity exhaustion and continues the file without a permanent RPC failure',async()=>{
 const f=await fixture({maxPages:32,maxBytesPerKind:4096}),file=join(f.project,'main.jsonl');
 await writeFile(file,json(...Array.from({length:500},(_,i)=>usage('response-'+i))));
 let r=await f.reader.read(range),limited=false;
 for(let i=0;i<150&&r.collecting;i++){r=await f.reader.read(range);limited||=r.partial;}
 expect(r.collecting).toBe(false);expect(r.totals.total).toBeGreaterThan(0);expect(limited).toBe(true);
});
it('returns a lower bound rather than double counting when response reconciliation reaches its limit',async()=>{
 const f=await fixture({maxReconcileEvents:2}),rows:unknown[]=[];
 for(let i=0;i<6;i++){const timestamp=`2026-10-15T00:00:0${i}Z`;rows.push({timestamp,type:'token_usage_record',payload:{response_id:'r'+i,usage:{input_tokens:10,output_tokens:0}}},{timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:(i+1)*10,output_tokens:0}}}});}
 await writeFile(join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl'),json(...rows));
 const r=await f.reader.read(range);expect(r.partial).toBe(true);expect(r.totals.total).toBe(60);
});
it('does not count Codex cache creation twice when explicit and cumulative samples overlap',async()=>{
 const f=await fixture(),timestamp='2026-10-15T00:00:00Z';
 await writeFile(join(f.day,'rollout-2026-10-15-11111111-1111-4111-8111-111111111111.jsonl'),json({timestamp,type:'token_usage_record',payload:{response_id:'response',usage:{input_tokens:100,output_tokens:20,cached_input_tokens:40,cache_write_input_tokens:10}}},{timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,output_tokens:20,cached_input_tokens:40}}}}));
 const r=await f.reader.read(range);expect(r.totals).toMatchObject({total:120,input:50,output:20,cacheRead:40,cacheWrite:10});
});
it('extracts a Windows project name without retaining its absolute path in numeric storage',async()=>{
 const f=await fixture();await writeFile(join(f.project,'main.jsonl'),json({...usage('a'),cwd:'C:\\Users\\private-user\\work\\demo'}));const r=await f.reader.read(range);
 expect(r.byProject[0]?.label).toBe('demo');expect((await readFile(join(f.stateDir,'usage-insights.sqlite'))).includes(Buffer.from('private-user'))).toBe(false);
 expect(classifyTool('Read',{file_path:'C:\\Users\\private-user\\skills\\review\\SKILL.md'})).toMatchObject({name:'review',category:'skill',basis:'inferred'});
});
