import {afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,chmod} from 'node:fs/promises';
import {join,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {prepareGrokCursorSummary,parseGrokCursorSummary} from './GrokCursorSummary.js';
import {SummaryService} from './SummaryService.js';
import {CursorSdkSummarySupervisor} from './cursorSdkSummary.js';
import {windowsAgentExecutable} from '../agent/windowsAgentLaunch.js';
const dirs:string[]=[];const services:SummaryService[]=[];
afterEach(async()=>{services.splice(0).forEach(s=>s.close());vi.unstubAllEnvs();vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'soda-gc-summary-'));dirs.push(dir);const original=join(dir,'original'),work=join(dir,'work');await mkdir(original);await mkdir(work);return {dir,original,work};}
for(const kind of ['grok'] as const)it(`${kind}: isolates roots and executes its own CLI without Codex fallback`,async()=>{
 if(process.platform==='win32')return;
 const {dir,original}=await fixture(),bin=join(dir,'bin'),receipt=join(dir,'receipt.json');await mkdir(bin);
 await writeFile(join(bin,'cursor'),`#!${process.execPath}\nprocess.exit(97);`);await chmod(join(bin,'cursor'),0o755);
 const exe=kind==='grok'?'grok':'cursor-agent';
 const value=kind==='grok'?{text:'generated summary',stopReason:'end_turn'}:{type:'result',subtype:'success',is_error:false,result:'generated summary'};
 await writeFile(join(bin,exe),`#!${process.execPath}\nconst fs=require('node:fs');let stdin='';process.stdin.on('data',b=>stdin+=b);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),home:process.env.HOME,stdin}));console.log(${JSON.stringify(JSON.stringify(value))});});`);await chmod(join(bin,exe),0o755);
 vi.stubEnv('PATH',bin+delimiter+process.env.PATH);vi.stubEnv('GROK_HOME',original);vi.stubEnv('XDG_CONFIG_HOME',original);
 const service=new SummaryService({isActive:()=>false} as any,join(dir,'state'));services.push(service);
 const result=await (service as any).runPrompt({kind,model:'fixture-model',effort:'',sessionId:''},'generated untrusted prompt');expect(result).toEqual({text:'generated summary',sessionId:null});
 const launched=JSON.parse(await readFile(receipt,'utf8'));expect(launched.stdin).toBe('');expect(launched.cwd).toBe(launched.home);expect(launched.cwd).not.toBe(original);
 expect(launched.args).not.toContain('exec');expect(launched.args).toContain('fixture-model');
 expect(launched.args).toContain('read_file,Agent,search_tool,use_tool');expect(launched.args).toContain('MCPTool');
 await expect(stat(launched.cwd)).rejects.toThrow(); // only own temporary state removed
});
it('copies auth-only data into private roots and drops config/hook/leader overrides',async()=>{
 const {original,work}=await fixture();await writeFile(join(original,'auth.json'),JSON.stringify({'xai::api_key':{key:'generated-not-real',auth_mode:'api_key',user_id:'fixture',create_time:'2026-01-01T00:00:00Z'}}));
 const env:NodeJS.ProcessEnv={HOME:original,GROK_HOME:original,GROK_AUTH_PATH:join(original,'auth.json'),GROK_CONFIG:'danger',GROK_LEADER_SOCKET:'danger',CURSOR_CONFIG_DIR:'danger',CURSOR_DATA_DIR:'danger',SAMPLE:'keep'};
 const out=await prepareGrokCursorSummary('grok',work,'generated prompt',{kind:'grok',model:'',sessionId:''},env);
 expect(env.GROK_HOME).toBe(join(work,'grok'));expect(env.GROK_CONFIG).toBeUndefined();expect(env.GROK_LEADER_SOCKET).toBeUndefined();expect(env.CURSOR_CONFIG_DIR).toBeUndefined();expect(env.SAMPLE).toBe('keep');
 expect(await readFile(join(env.GROK_HOME!,'auth.json'),'utf8')).toContain('generated-not-real');expect(await readFile(out.args[out.args.indexOf('--prompt-file')+1]!,'utf8')).toBe('generated prompt');
 expect(await readFile(join(env.GROK_HOME!,'requirements.toml'),'utf8')).toBe('allow_managed_hooks_only = true\n');
 if(process.platform!=='win32')expect((await stat(join(env.GROK_HOME!,'auth.json'))).mode&0o777).toBe(0o600);
 expect(await readFile(join(original,'auth.json'),'utf8')).toContain('generated-not-real');
});
it('Cursor CLI fails closed while SummaryService binds only the isolated SDK path',async()=>{
 const {work}=await fixture(),env:NodeJS.ProcessEnv={HOME:'original',CURSOR_CONFIG_DIR:'original'};
 await expect(prepareGrokCursorSummary('cursor',work,'fixture',{kind:'cursor',model:'',sessionId:''},env)).rejects.toThrow(/正式な経路/);
 expect(env).toEqual({HOME:'original',CURSOR_CONFIG_DIR:'original'});
 const bin=join(work,'bin');await mkdir(bin);for(const exe of ['cursor','cursor-agent']){await writeFile(join(bin,exe),`#!${process.execPath}\nprocess.exit(97);`);await chmod(join(bin,exe),0o755);}vi.stubEnv('PATH',bin+delimiter+process.env.PATH);
 const service=new SummaryService({isActive:()=>false} as any,join(work,'state'));services.push(service);
 const run=vi.spyOn(CursorSdkSummarySupervisor.prototype,'run').mockResolvedValue({text:'SDK fixture summary',sessionId:null});
 expect(await (service as any).runPrompt({kind:'cursor',model:'fixture-model',sessionId:''},'fixture')).toEqual({text:'SDK fixture summary',sessionId:null});
 expect(run).toHaveBeenCalledOnce();expect(run.mock.calls[0]?.[0]).toMatchObject({model:'fixture-model',prompt:'fixture',sessionId:''});
});
it('the Windows npm shim path keeps the empty tool whitelist as an actual argv element',async()=>{
 const {work}=await fixture(),script=join(work,'entry.cjs');await writeFile(script,'process.stdout.write(JSON.stringify(process.argv.slice(2)))');await writeFile(join(work,'cursor-agent.cmd'),'@echo off\n"%_prog%" "%dp0%\\entry.cjs" %*');
 const target=await windowsAgentExecutable('cursor-agent',{PATH:work});
 const result=await new Promise<string>((resolve,reject)=>{const c=spawn(target.file,[...target.prefix,'--allowed-tools','','next'],{shell:false});let text='';c.stdout.on('data',b=>text+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(text):reject(Error('fixture failed')));});
 expect(JSON.parse(result)).toEqual(['--allowed-tools','','next']);
});
it('provider result parsing rejects errors, truncated or foreign-provider success shapes',()=>{
 for(const kind of ['grok','cursor'] as const)for(const value of ['bad',JSON.stringify({result:'wrong provider'}),JSON.stringify({text:'partial',stopReason:'max_tokens'}),JSON.stringify({type:'result',subtype:'success',is_error:true,result:'error'})])expect(()=>parseGrokCursorSummary(kind,value)).toThrow();
});
