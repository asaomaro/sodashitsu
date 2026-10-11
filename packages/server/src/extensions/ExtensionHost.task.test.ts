import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { afterEach,expect,it,vi } from 'vitest';
import { makeHost,ext,type HostHarness } from './hostHarness.js';
import { instanceKey,entryDigest } from './approval.js';
import type { TaskAgentDeps } from './TaskAgentLauncher.js';
let h:HostHarness|undefined;afterEach(async()=>{await h?.cleanup();h=undefined;});
function taskDeps(){const split=vi.fn(),start=vi.fn();const kinds=vi.fn(async()=>({kinds:[{kind:'codex',label:'Codex',available:true}]}));return {split,start,kinds,deps:{session:{splitPane:split,getPane:()=>undefined,getTab:()=>undefined},starter:{start,isShellAvailable:async()=>true},kinds} as unknown as TaskAgentDeps};}
it('does not expose or execute task launches without agent-start permission',async()=>{
 const t=taskDeps();h=await makeHost({tasks:t.deps,tabPlugins:{w1:{extensionKey:'user:studio',display:'main'}}});await h.writeConfig([ext('studio')]);await h.host.start();const child=h.children[0]!;
 expect((child.lines()[0]?.['methods'] as string[])).not.toContain('task.start');child.say({id:1,method:'task.start',params:{paneId:'p1',kind:'codex',taskFile:'task.md'}});await h.until(()=>child.lines().some(l=>l['id']===1));expect(child.lines().find(l=>l['id']===1)).toMatchObject({ok:false});expect(t.split).not.toHaveBeenCalled();expect(t.start).not.toHaveBeenCalled();
});
it('refuses another extensions app anchor even with agent-start permission',async()=>{
 const t=taskDeps();h=await makeHost({tasks:t.deps,tabPlugins:{w1:{extensionKey:'user:other',display:'main'}}});await h.writeConfig([ext('studio',{allow:['agent-start']})]);await h.host.start();const child=h.children[0]!;child.say({id:1,method:'task.start',params:{paneId:'p1',kind:'codex',taskFile:'task.md'}});await h.until(()=>child.lines().some(l=>l['id']===1));expect(child.lines().find(l=>l['id']===1)).toMatchObject({ok:false,error:{code:'not_found'}});expect(t.split).not.toHaveBeenCalled();
});
it('rechecks PJ scope after asynchronous agent discovery before creating a task pane',async()=>{
 const t=taskDeps();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});t.kinds.mockImplementation(async()=>{await gate;return {kinds:[{kind:'codex',label:'Codex',available:true}]};});
 const plugins:Record<string,{extensionKey:string;display:string}>={};h=await makeHost({tasks:t.deps,tabPlugins:plugins});const entry=ext('studio',{allow:['agent-start'],tabView:{title:'Studio',display:'main'}});const root=await h.makeRepo('video',[entry]);await writeFile(join(root,'task.md'),'video task');const key=instanceKey('project',root,'studio');plugins['w1']={extensionKey:key,display:'main'};h.workspaces.set('w1',{cwd:root,projectDir:root});
 await h.approvalStore.decideApproved(root,'studio',entryDigest(root,{id:'studio',command:'node studio.mjs',description:null,enabled:true,allow:['agent-start'],onUnresponsive:'pass',cwd:null,tabView:{title:'Studio',display:'main'}}),{id:'studio',command:'node studio.mjs',description:null,enabled:true,allow:['agent-start'],onUnresponsive:'pass',cwd:null});await h.host.start();const child=h.children[0]!;child.say({id:1,method:'task.start',params:{paneId:'p1',kind:'codex',taskFile:'task.md'}});await h.until(()=>t.kinds.mock.calls.length>0);h.workspaces.set('w1',{cwd:root,projectDir:'/other'});release();await h.until(()=>child.lines().some(l=>l['id']===1));expect(child.lines().find(l=>l['id']===1)).toMatchObject({ok:false,error:{code:'not_found'}});expect(t.split).not.toHaveBeenCalled();expect(t.start).not.toHaveBeenCalled();
});
