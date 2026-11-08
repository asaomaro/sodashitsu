import{createHash,randomUUID}from'node:crypto';import{mkdtemp,mkdir,writeFile,rm,readFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join,dirname}from'node:path';import{DatabaseSync}from'node:sqlite';import{afterEach,expect,it,vi}from'vitest';import type{Pane}from'@sodashitsu/protocol';import{CursorChildRecords}from'./CursorChildRecord.js';import{CursorChildObservations}from'./CursorChildObservations.js';import{cursorTerminalBindings}from'./CursorTerminalBindings.js';import{SubagentHistoryService}from'./SubagentHistoryService.js';
const cleanups:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const c of cleanups.splice(0).reverse())await c();vi.restoreAllMocks();});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'soda-cursor-child-context-')),parent=randomUUID(),child=randomUUID(),config=join(root,'config'),data=join(root,'data'),group=join(config,'chats','0'.repeat(32)),childDb=join(group,child,'store.db'),parentDb=join(group,parent,'store.db'),parentFile=join(data,'projects','generated','agent-transcripts',parent,`${parent}.jsonl`),childFile=join(dirname(parentFile),'subagents',`${child}.jsonl`);
 const pane={id:randomUUID(),agent:{kind:'cursor',instanceId:randomUUID()},agentSession:{kind:'cursor',sessionId:parent}}as Pane;let verified=true;
 const session={getPane:(id:string)=>id===pane.id?pane:undefined,hasVerifiedAgentSession:()=>verified,usageReportVerdict:()=>({verdict:'accept'as const})};
 for(const p of [childDb,parentDb,parentFile,childFile])await mkdir(dirname(p),{recursive:true});
 const meta={agentId:child,createdAt:1000,subagentInfo:{parentAgentId:parent,rootParentAgentId:parent,toolCallId:'generated-tool',typeName:'Explore'},blobEncryptionKey:'private-generated-must-not-leave-worker'};
 for(const [path,value]of [[parentDb,{agentId:parent,createdAt:1}],[childDb,meta]]as const){const db=new DatabaseSync(path);db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT); CREATE TABLE blobs (id TEXT PRIMARY KEY,data BLOB);');db.prepare("INSERT INTO meta VALUES ('0',?)").run(Buffer.from(JSON.stringify(value)).toString('hex'));db.close();}
 const setRoot=(used:number,max=100)=>{const blob=Buffer.from([42,4,8,used,16,max]),rootId=createHash('sha256').update(blob).digest('hex'),db=new DatabaseSync(childDb);try{db.prepare('INSERT OR REPLACE INTO blobs VALUES (?,?)').run(rootId,blob);db.prepare("UPDATE meta SET value=? WHERE key='0'").run(Buffer.from(JSON.stringify({...meta,latestRootBlobId:rootId})).toString('hex'));}finally{db.close();}};setRoot(25);
 await writeFile(parentFile,'{"role":"user","message":{"content":[]}}\n');await writeFile(childFile,'{"role":"assistant","message":{"content":[]}}\n{"type":"turn_ended","status":"success"}\n');
 const observer=new CursorChildObservations({session,records:new CursorChildRecords({home:root,cursorConfigHome:config,cursorDataHome:data})});const history=new SubagentHistoryService({session,collect:s=>cursorTerminalBindings(observer,s)});
 cleanups.push(async()=>{history.close();observer.close();await rm(root,{recursive:true,force:true});});
 const stop={type:'cursor_child',phase:'stop',kind:'cursor',paneId:pane.id,sessionId:parent,parentId:parent,childId:child,contextSessionId:parent,logicalId:'generated-tool',childType:'Explore',status:'completed'};observer.offer(stop);await vi.waitFor(()=>expect(observer.terminals(pane.id).items).toHaveLength(1),{timeout:3000});
 const item=(await history.read({paneId:pane.id})).items[0]!;expect(item).toBeDefined();return{pane,child,childDb,observer,history,setRoot,selection:{paneId:pane.id,agentId:child,entryId:item.entryId},verify:(v:boolean)=>{verified=v;}};
}
it('reads only sealed terminal child context, without hooks, parent totals, time, or consumption',async()=>{
 const f=await fixture(),before=await readFile(f.childDb),r=await f.history.usageRead(f.selection);expect(r).toMatchObject({status:'ok',usage:{source:'cursor-db',consumptionScope:'self',contextTokens:25,contextWindowTokens:100,contextUsedPct:25,partial:true}});expect(r.usage).not.toHaveProperty('tokens');expect(r.usage).not.toHaveProperty('observedAt');expect(r.usage).not.toHaveProperty('costUsd');expect(await readFile(f.childDb)).toEqual(before);expect(f.pane.agent).not.toHaveProperty('subagents');f.verify(false);expect(await f.history.usageRead(f.selection)).toMatchObject({status:'unavailable'});
});
it.each([false,true])('never captures a later latest-root for an old entry, even before its first usage query: %s',async(readFirst)=>{
 const f=await fixture();if(readFirst)expect((await f.history.usageRead(f.selection)).status).toBe('ok');
 // New turn writes the child DB before any new self hook or Stop is received.
 f.setRoot(50);expect(await f.history.usageRead(f.selection)).toMatchObject({status:'unavailable'});const rows=await f.history.read({paneId:f.pane.id});expect(rows.items[0]?.entryId).toBe(f.selection.entryId);expect(await f.history.usageRead(f.selection)).not.toHaveProperty('usage');
});
it('does not return sealed context after the history service closes',async()=>{
 const f=await fixture();f.history.close();expect(await f.history.usageRead(f.selection)).toMatchObject({status:'unavailable'});
});
