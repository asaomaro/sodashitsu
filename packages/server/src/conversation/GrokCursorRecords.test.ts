import {afterEach,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {extraRecord,locateExtra,discoverExtra,openExtra} from './ExtraAgentRecords.js';
import {readAssistantConversation} from '../assistant/AssistantConversation.js';
import {ConversationService} from './ConversationService.js';
import {conversationResumeArgs} from '../agent/conversationResume.js';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const id='12345678-1234-4234-8234-123456789012';
const lines=(rows:unknown[])=>rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
async function fixture(){const home=await mkdtemp(join(tmpdir(),'soda-seven-kind-records-'));dirs.push(home);const roots={home,grokHome:join(home,'grok'),cursorDataHome:join(home,'cursor')};return {home,roots};}
for(const kind of ['grok','cursor'] as const){
 it(`${kind}: reads exact formal human/assistant text, excludes tools/system and discovers past sessions`,async()=>{
  const {roots}=await fixture();
  const file=kind==='grok'?join(roots.grokHome,'sessions',encodeURIComponent('/fixture 作業'),id,'chat_history.jsonl'):join(roots.cursorDataHome,'projects','fixture-work','agent-transcripts',id,id+'.jsonl');
  const rows=kind==='grok'?[
   {type:'system',content:'secret system'},
   {type:'user',content:[{type:'text',text:'hello 世界'},{type:'image',url:'not text'}]},
   {type:'user',synthetic_reason:'system_reminder',content:[{type:'text',text:'not human'}]},
   {type:'reasoning',text:'secret reasoning'},
   {type:'tool_result',content:'secret tool'},
   {type:'assistant',content:'fixture answer',tool_calls:[{name:'tool'}]},
  ]:[
   {role:'system',message:{content:[{type:'text',text:'secret system'}]}},
   {role:'user',message:{content:[{type:'text',text:'hello 世界'}]}},
   {role:'tool',message:{content:[{type:'text',text:'secret tool'}]}},
   {role:'assistant',message:{content:[{type:'tool_use',name:'tool',input:{}},{type:'text',text:'fixture answer'}]}},
   {type:'turn_ended'},
  ];
  await mkdir(dirname(file),{recursive:true});await writeFile(file,lines(rows));
  expect(await locateExtra(kind,id,roots)).toBe(file);
  const page=await readAssistantConversation(kind,id,roots);
  expect(page.messages.map(m=>[m.role,m.text])).toEqual([['user','hello 世界'],['assistant','fixture answer']]);
  const service=new ConversationService(()=>undefined,{extraRoots:roots,claudeRoots:[],codexHome:join(roots.home,'codex')});
  const past=await service.sessions({kind});expect(past.sessions.map(s=>[s.kind,s.sessionId,s.title])).toEqual([[kind,id,'hello 世界']]);
  expect(conversationResumeArgs(kind,id,'/fixture')).toEqual(['--resume',id]);
  const opened=await openExtra(kind,id,roots);expect(opened).not.toBeNull();await opened?.fd.close();
  expect((await discoverExtra(kind,roots)).files).toHaveLength(1);
 });
 it(`${kind}: rejects symlinked leaf/group, ambiguous IDs and arbitrary IDs`,async()=>{
  const {home,roots}=await fixture(),base=kind==='grok'?join(roots.grokHome,'sessions'):join(roots.cursorDataHome,'projects');
  const leaf=(group:string)=>kind==='grok'?join(base,group,id,'chat_history.jsonl'):join(base,group,'agent-transcripts',id,id+'.jsonl');
  const file=leaf('first');await mkdir(dirname(file),{recursive:true});await writeFile(file,'{}\n');
  const outside=join(home,'outside.jsonl');await writeFile(outside,'{}\n');await rm(file);await symlink(outside,file);
  expect(await locateExtra(kind,id,roots)).toBeNull();expect(await openExtra(kind,id,roots)).toBeNull();
  await rm(file);await writeFile(file,'{}\n');const copy=leaf('second');await mkdir(dirname(copy),{recursive:true});await writeFile(copy,'{}\n');
  expect(await locateExtra(kind,id,roots)).toBeNull();expect(await openExtra(kind,id,roots)).toBeNull();
  expect(await locateExtra(kind,'../outside',roots)).toBeNull();
 });
}
it('Cursor current transcript wins over legacy in the same workspace, children are not parent sessions',async()=>{
 const {roots}=await fixture(),base=join(roots.cursorDataHome,'projects','fixture','agent-transcripts');
 const current=join(base,id,id+'.jsonl');await mkdir(dirname(current),{recursive:true});await writeFile(current,'{}\n');await writeFile(join(base,id+'.jsonl'),'{}\n');
 const child='12345678-1234-4234-8234-123456789013';await mkdir(join(base,id,'subagents'),{recursive:true});await writeFile(join(base,id,'subagents',child+'.jsonl'),'{}\n');
 expect(await locateExtra('cursor',id,roots)).toBe(current);expect(await locateExtra('cursor',child,roots)).toBeNull();
 const found=await discoverExtra('cursor',roots);expect(found.files.every(f=>f.id===id)).toBe(true);
});
it('malformed and non-human provider records do not leak into chat',()=>{
 for(const kind of ['grok','cursor'] as const)for(const row of [{type:'user',content:'wrongshape'},{role:'assistant',message:{content:'wrongshape'}},{type:'new_unknown',content:'secret'}])expect(extraRecord(row,kind)).toBeNull();
});
