import {mkdtemp,mkdir,writeFile,rm,symlink,link,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {locateGrokSession,openGrokSessionRecord,grokHome} from './grokSession.js';
const flags=vi.hoisted(()=>({unsafeFollow:false}));
vi.mock('./safeFile.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('./safeFile.js')>();
 return{...actual,openVerified:async(path:string)=>{if(flags.unsafeFollow&&path.endsWith('.cwd')){const fd=await open(path,'r');return{fd,st:await fd.stat()}}return actual.openVerified(path)}};
});
const dirs:string[]=[];afterEach(async()=>{flags.unsafeFollow=false;for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true})});
async function fixture(){const home=await mkdtemp(join(tmpdir(),'soda-grok-locator-'));dirs.push(home);const id=randomUUID(),root=join(home,'.grok'),group=join(root,'sessions',encodeURIComponent('/generated/project')),dir=join(group,id);await mkdir(dir,{recursive:true});return{home,id,root,group,dir,opts:{grokHome:root},file:join(dir,'usage.json')}}
it('locates the exact UUID in the formal CWD group and opens only fixed leaves',async()=>{const f=await fixture();await writeFile(f.file,'{"sessionId":"'+f.id+'"}');expect(await locateGrokSession(f.id,f.opts)).toEqual({kind:'grok',id:f.id,dir:f.dir,cwd:'/generated/project'});const opened=await openGrokSessionRecord(f.id,'usage.json',f.opts);expect(opened?.st.size).toBeGreaterThan(0);await opened?.fd.close();expect(await openGrokSessionRecord(f.id,'../auth.json' as 'usage.json',f.opts)).toBeNull()});
it('reads bounded .cwd metadata for hashed long-path groups',async()=>{const f=await fixture();await rm(f.group,{recursive:true});const group=join(f.root,'sessions','project-0123456789abcdef'),dir=join(group,f.id);await mkdir(dir,{recursive:true});await writeFile(join(group,'.cwd'),'/generated/long-project');expect((await locateGrokSession(f.id,f.opts))?.cwd).toBe('/generated/long-project')});
it('refuses latest guessing, traversal and ambiguous duplicate UUID directories',async()=>{const f=await fixture();expect(await locateGrokSession(randomUUID(),f.opts)).toBeNull();expect(await locateGrokSession('../auth',f.opts)).toBeNull();await mkdir(join(f.root,'sessions','second',f.id),{recursive:true});expect(await locateGrokSession(f.id,f.opts)).toBeNull()});
it('rejects session/group symlinks and hardlinked record files',async()=>{const f=await fixture(),outside=join(f.home,'outside');await mkdir(outside);await writeFile(join(outside,'usage.json'),'private');await rm(f.dir,{recursive:true});await symlink(outside,f.dir);expect(await locateGrokSession(f.id,f.opts)).toBeNull();await rm(f.dir);await mkdir(f.dir);await link(join(outside,'usage.json'),f.file);expect(await openGrokSessionRecord(f.id,'usage.json',f.opts)).toBeNull()});
it('coalesces concurrent exact-session reads without caching a later relocation',async()=>{const f=await fixture();const values=await Promise.all(Array.from({length:8},()=>locateGrokSession(f.id,f.opts)));expect(values.every(v=>v?.dir===f.dir)).toBe(true);await rm(f.dir,{recursive:true});expect(await locateGrokSession(f.id,f.opts)).toBeNull()});
it('honors the explicit Grok home instead of choosing a recent global session',()=>{expect(grokHome({grokHome:'/generated/isolated'})).toBe('/generated/isolated')});

it('rejects cwd leaf links even when the OS open primitive would follow them',async()=>{
 const f=await fixture();await rm(f.group,{recursive:true});const group=join(f.root,'sessions','hashed-group');await mkdir(join(group,f.id),{recursive:true});
 const external=join(f.home,'external-cwd');await writeFile(external,'/generated/external');await symlink(external,join(group,'.cwd'));flags.unsafeFollow=true;
 expect((await locateGrokSession(f.id,f.opts))?.cwd).toBeNull();
});
it.each(['relative/path','/generated/line\nprivate','/generated/zero\0private'])('rejects invalid cwd metadata %j',async value=>{
 const f=await fixture();await rm(f.group,{recursive:true});const group=join(f.root,'sessions','hashed-group');await mkdir(join(group,f.id),{recursive:true});await writeFile(join(group,'.cwd'),value);
 expect((await locateGrokSession(f.id,f.opts))?.cwd).toBeNull();
});
