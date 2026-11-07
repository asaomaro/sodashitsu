import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {readCodexModelOptions} from './codex.js';
import type {openCodexControl} from '../CodexControlSocket.js';
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true})});
const live={id:'picker-model',model:'actual-model',displayName:'Generated Model',hidden:false,supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'},{reasoningEffort:'future'}]};
const cached={slug:'cached-model',display_name:'Cached Model',visibility:'list',supported_reasoning_levels:[{effort:'medium'}]};
async function fixture(reply?:(params:Record<string,unknown>)=>unknown){
 const home=await mkdtemp(join(tmpdir(),'soda-codex-model-options-'));dirs.push(home);const requests:Array<{method:string;params:unknown}>=[];
 const channel={request:vi.fn(async(method:string,params:Record<string,unknown>)=>{requests.push({method,params});return method==='initialize'?{userAgent:'fixture'}:reply?reply(params):{data:[live],nextCursor:null}}),initialized:vi.fn(),unchanged:vi.fn(async()=>true),close:vi.fn(async()=>true)};
 const open=vi.fn(async()=>channel) as unknown as typeof openCodexControl;
 return{home,channel,requests,open,cache:()=>writeFile(join(home,'models_cache.json'),JSON.stringify({identity:'must-not-return',models:[cached]}))};
}
it('uses a catalog-only allowlist and maps returned model/effort values without a session',async()=>{
 const f=await fixture();const result=await readCodexModelOptions(f);
 expect(result).toMatchObject({source:'cli',models:[{id:'actual-model',label:'Generated Model',efforts:['low','high']}]});
 expect(f.open).toHaveBeenCalledWith(expect.objectContaining({key:'models',maxRequests:5}),['initialize','model/list']);
 expect(f.requests.map(r=>r.method)).toEqual(['initialize','model/list']);expect(f.requests[1]!.params).toEqual({limit:128,includeHidden:false});expect(f.channel.close).toHaveBeenCalledOnce();
});
it('pages visible models with cursor validation and deduplication',async()=>{
 const f=await fixture(params=>params.cursor?{data:[live,{...live,model:'next-model'}],nextCursor:null}:{data:[live,{...live,hidden:true,model:'hidden-model'}],nextCursor:'next'});
 const result=await readCodexModelOptions(f);expect(result.source).toBe('cli');expect(result.models.map(m=>m.id)).toEqual(['actual-model','next-model']);
 expect(f.requests[2]!.params).toMatchObject({cursor:'next'});
});
it('does not replace an authoritative empty CLI list with old cache',async()=>{
 const f=await fixture(()=>({data:[],nextCursor:null}));await f.cache();expect(await readCodexModelOptions(f)).toMatchObject({source:'cli',models:[]});
});
it('labels unavailable socket fallback as local cache, never live',async()=>{
 const f=await fixture();await f.cache();f.open=vi.fn(async()=>{throw Error('socket unavailable')}) as never;
 const result=await readCodexModelOptions(f);expect(result).toMatchObject({source:'local-cache',models:[{id:'cached-model',efforts:['medium']}]});expect(JSON.stringify(result)).not.toContain('must-not-return');expect(result.message).toContain('最新');
});
it.each(['bad-row','cursor-loop','byte-limit','row-limit'] as const)('falls back honestly on %s rather than a partial catalog',async mode=>{
 const f=await fixture(()=>mode==='bad-row'?{data:[{model:'not valid model'}]}:mode==='cursor-loop'?{data:[live],nextCursor:'repeat'}:mode==='byte-limit'?{data:[live],padding:'x'.repeat(2*1024*1024)}:{data:Array.from({length:513},()=>live)});await f.cache();
 expect((await readCodexModelOptions(f)).source).toBe('local-cache');expect(f.requests.length).toBeLessThanOrEqual(5);
});
it('rejects changed daemon generation before calling a response live',async()=>{
 const f=await fixture();await f.cache();f.channel.unchanged=vi.fn(async()=>false);expect((await readCodexModelOptions(f)).source).toBe('local-cache');
});
it('refuses unsafe symlink or oversized cache when the daemon is unavailable',async()=>{
 const f=await fixture();f.open=vi.fn(async()=>{throw Error('unavailable')}) as never;
 const outside=join(f.home,'outside.json');await writeFile(outside,JSON.stringify({models:[cached]}));await symlink(outside,join(f.home,'models_cache.json'));
 expect(await readCodexModelOptions(f)).toMatchObject({source:'unavailable',models:[]});
 await rm(join(f.home,'models_cache.json'));await writeFile(join(f.home,'models_cache.json'),'x'.repeat(2*1024*1024+1));
 expect(await readCodexModelOptions(f)).toMatchObject({source:'unavailable',models:[]});
});
