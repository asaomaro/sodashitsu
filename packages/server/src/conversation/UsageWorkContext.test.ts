import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {ConversationService} from './ConversationService.js';import {usageWorkContext} from './UsageWorkContext.js';
import type {Pane,SessionSnapshot} from '@sodashitsu/protocol';
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{force:true,recursive:true})));});
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'soda-report-work-'));dirs.push(dir);const root=join(dir,'projects');await mkdir(join(root,'p'),{recursive:true});
 let pane={id:'pane-private-id',tabId:'t',agent:{instanceId:'instance',kind:'claude',name:'実装担当',state:'working'},agentSession:{kind:'claude',sessionId:'session-1'}} as unknown as Pane;
 const session={getPane:()=>pane,snapshot:()=>({panes:[pane],tabs:[{id:'t',workspaceId:'w'}],workspaces:[{id:'w',label:'操舵室',cwd:'/private/folder'}]}) as Pick<SessionSnapshot,'panes'|'tabs'|'workspaces'>};
 const conversations=new ConversationService(()=>pane,{claudeRoots:[root]});
 const file=join(root,'p','session-1.jsonl');return {dir,root,file,session,conversations,change:()=>{pane={...pane,agentSession:{...pane.agentSession!,sessionId:'changed'}};}};
}
const line=(role:string,text:string)=>JSON.stringify({message:{role,content:text},timestamp:'2026-11-02T01:00:00Z'})+'\n';
it('collects current goals, recent replies and uncompleted work without commands, paths or pane IDs',async()=>{
 const f=await fixture();await writeFile(f.file,line('user','利用ダッシュボードを改善して')+line('assistant','親子表示を実装しています')+JSON.stringify({message:{role:'assistant',content:[{type:'tool_use',name:'Bash',input:{command:'private-command'}},{type:'tool_use',name:'TodoWrite',input:{todos:[{content:'UIを調整する',status:'in_progress'},{content:'完了済み',status:'completed'}]}}]}})+'\n');
 const r=await usageWorkContext(f,()=>{});expect(r.items[0]).toMatchObject({workspace:'操舵室',agent:'実装担当',state:'working',available:true,todos:[{text:'UIを調整する',status:'in_progress'}]});
 expect(r.items[0]?.messages.map(m=>m.text)).toEqual(['利用ダッシュボードを改善して','親子表示を実装しています']);expect(JSON.stringify(r)).not.toMatch(/private-command|private\/folder|pane-private-id|完了済み/);
});
it('keeps unavailable context explicit and carries a cached summary with its stale marker',async()=>{
 const f=await fixture();await writeFile(f.file,'');const cached=vi.fn(async()=>({text:'音声合成の常駐化を調整',stale:true}));const r=await usageWorkContext({...f,summaries:{cached} as never},()=>{});
 expect(r.items[0]?.summary).toEqual({text:'音声合成の常駐化を調整',stale:true});expect(r.items[0]?.available).toBe(true);
 await rm(f.file);expect((await usageWorkContext(f,()=>{})).items[0]).toMatchObject({available:false,partial:true});
});
it('does not attribute an old conversation to a replacement pane, even when cached-summary retrieval fails',async()=>{
 const f=await fixture();await writeFile(f.file,line('user','古い作業'));const cached=async()=>{f.change();throw new Error('replaced');};expect((await usageWorkContext({...f,summaries:{cached} as never},()=>{})).items).toEqual([]);
});
it('propagates authorization expiry instead of silently reporting unavailable work',async()=>{const f=await fixture();await writeFile(f.file,line('user','作業'));let checks=0;await expect(usageWorkContext(f,()=>{if(++checks>=4)throw new Error('revoked');})).rejects.toThrow('revoked');});

it('revalidates earlier panes after a later pane finishes its asynchronous read',async()=>{
 const f=await fixture();await writeFile(f.file,line('user','進行中の作業'));
 const first=f.session.snapshot().panes[0]!,second={...first,id:'second',agent:{...first.agent!,instanceId:'second-instance',name:'後の担当'}};
 let changed=false;const session={snapshot:()=>({...f.session.snapshot(),panes:[first,second]}),getPane:(id:string)=>id===first.id?(changed?{...first,agent:{...first.agent!,instanceId:'replacement'}}:first):second};
 const conversations=new ConversationService(session.getPane,{claudeRoots:[f.root]});const cached=async(id:string)=>{if(id==='second')changed=true;return null;};
 const r=await usageWorkContext({session,conversations,summaries:{cached} as never},()=>{});expect(r.items).toHaveLength(1);expect(r.items[0]?.agent).toBe('後の担当');expect(r.omitted).toBe(1);
});

it('keeps a final-send guard so a replaced session cannot be sent as current work',async()=>{const f=await fixture();await writeFile(f.file,line('user','現在の作業'));const r=await usageWorkContext(f,()=>{});expect(()=>r.verify()).not.toThrow();f.change();expect(()=>r.verify()).toThrow('分析対象の作業が切り替わりました');});
