import {afterEach,expect,it,vi} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {mkdtemp,mkdir,writeFile,appendFile,readFile,rm,lstat,symlink,link,readdir,truncate,rename} from "node:fs/promises";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {CursorChildRecords} from "./CursorChildRecord.js";
import {cursorChildStop,cursorChildTerminal} from "./CursorChildMetadata.js";
import * as MetadataQuery from "./CursorChildMetadataQuery.js";
const parent="12345678-1234-4234-8234-123456789012",child="12345678-1234-4234-8234-123456789013";
const dirs:string[]=[];afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
function metadata(extra:Record<string,unknown>={}){return{agentId:child,createdAt:1000,subagentInfo:{parentAgentId:parent,rootParentAgentId:parent,toolCallId:"generated-tool",typeName:"Explore"},lastUsedModel:"not-a-child-observation",blobEncryptionKey:"generated-private-not-returned",...extra};}
function db(file:string,value:unknown){const db=new DatabaseSync(file);try{db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");db.prepare("INSERT OR REPLACE INTO meta VALUES (?,?)").run("0",Buffer.from(JSON.stringify(value)).toString("hex"));}finally{db.close();}}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-cursor-child-fixture-"));dirs.push(root);
 const roots={home:root,cursorConfigHome:join(root,"config"),cursorDataHome:join(root,"data")};
 const group=join(roots.cursorConfigHome,"chats",createHash("md5").update("/generated/project").digest("hex"));
 const childDb=join(group,child,"store.db"),parentDb=join(group,parent,"store.db");
 const parentFile=join(roots.cursorDataHome,"projects","fixture-project","agent-transcripts",parent,`${parent}.jsonl`),childFile=join(dirname(parentFile),"subagents",`${child}.jsonl`);
 for(const file of [childDb,parentDb,parentFile,childFile])await mkdir(dirname(file),{recursive:true});
 db(parentDb,{agentId:parent,createdAt:1});db(childDb,metadata());
 await writeFile(parentFile,'{"role":"user","message":{"content":[{"type":"text","text":"Generated parent"}]}}\n');
 await writeFile(childFile,'{"role":"assistant","message":{"content":[{"type":"text","text":"Generated child"}]}}\n{"type":"turn_ended","status":"success"}\n');
 return{root,roots,group,childDb,parentDb,parentFile,childFile,reader:new CursorChildRecords(roots)};
}
it("reads generated official-schema lineage through a private copy, keeps original DB unchanged and does not expose other metadata",async()=>{
 const f=await fixture(),before=await lstat(f.childDb),bytes=await readFile(f.childDb);
 const record=await f.reader.open(parent,child,()=>true);expect(record).toBeDefined();
 try{expect(record?.lineage).toEqual({id:child,parentId:parent,rootParentId:parent,toolCallId:"generated-tool",type:"Explore",createdAt:1000});expect(record?.terminal).toBe("completed");expect(await record?.unchanged()).toBe(true);expect(record?.lineage).not.toHaveProperty("model");expect(JSON.stringify(record?.lineage)).not.toContain("generated-private-not-returned");}finally{await record?.fd.close();f.reader.close();}
 expect(await readFile(f.childDb)).toEqual(bytes);expect((await lstat(f.childDb)).mtimeMs).toBe(before.mtimeMs);expect((await readdir(dirname(f.childDb))).sort()).toEqual(["store.db"]);
});
it("requires direct parent/root/child identity, never attaches a sibling or nested lineage",async()=>{
 const f=await fixture();db(f.childDb,metadata({subagentInfo:{parentAgentId:parent,rootParentAgentId:child,toolCallId:"tool",typeName:"Explore"}}));
 expect(await f.reader.open(parent,child,()=>true)).toBeUndefined();f.reader.close();
});
it("rejects symlink/hardlink DB or child transcripts instead of following them",async()=>{
 for(const kind of ["db-link","transcript-link","hardlink"]){
  const f=await fixture(),path=kind==="transcript-link"?f.childFile:f.childDb,other=path+".copy";await writeFile(other,await readFile(path));await rm(path);
  if(kind==="hardlink")await link(other,path);else await symlink(other,path);
  expect(await f.reader.open(parent,child,()=>true)).toBeUndefined();f.reader.close();
 }
});
it("invalidates cached metadata on DB revision and rejects a duplicate parent directory",async()=>{
 const f=await fixture();const first=await f.reader.open(parent,child,()=>true);expect(first).toBeDefined();await first?.fd.close();
 db(f.childDb,metadata({subagentInfo:{parentAgentId:child,rootParentAgentId:parent,toolCallId:"other",typeName:"Explore"}}));expect(await f.reader.open(parent,child,()=>true)).toBeUndefined();
 const duplicate=join(dirname(f.group),"f".repeat(32),parent,"store.db");await mkdir(dirname(duplicate),{recursive:true});db(duplicate,{agentId:parent,createdAt:1});
 expect(await f.reader.open(parent,child,()=>true)).toBeUndefined();f.reader.close();
});
it("rejects parent scope loss/forget/close and invalidates a returned record after source mutation",async()=>{
 const f=await fixture();expect(await f.reader.open(parent,child,()=>false)).toBeUndefined();
 let current=true;const pending=f.reader.open(parent,child,()=>current);current=false;expect(await pending).toBeUndefined();
 const record=await f.reader.open(parent,child,()=>true);expect(record).toBeDefined();
 await appendFile(f.childFile,'{"role":"user","message":{"content":[{"type":"text","text":"next turn"}]}}\n');expect(await record?.unchanged()).toBe(false);await record?.fd.close();
 const next=await f.reader.open(parent,child,()=>true);expect(next?.terminal).toBeUndefined();await next?.fd.close();
 const forgotten=f.reader.open(parent,child,()=>true);f.reader.forget();expect(await forgotten).toBeUndefined();f.reader.close();expect(await f.reader.open(parent,child,()=>true)).toBeUndefined();
});
it("never promotes parent-common settings, even when Stop, DB lineage and child completion all match",async()=>{
 const f=await fixture(),record=await f.reader.open(parent,child,()=>true);
 const stop=cursorChildStop({hook_event_name:"subagentStop",parent_conversation_id:parent,child_conversation_id:child,conversation_id:parent,subagent_id:"logical",subagent_type:"Explore",status:"completed",model_id:"parent-model",model_params:[{id:"effort",value:"high"}]});
 expect(record?.terminal).toBe(stop?.status);expect(stop?.settings).toEqual({});expect(record?.lineage).not.toHaveProperty("model");await record?.fd.close();f.reader.close();
});
it("requires the actual last complete child turn marker, not old completion followed by new input",()=>{
 const end='{"type":"turn_ended","status":"success"}\n';expect(cursorChildTerminal(Buffer.from(end))).toBe("completed");
 for(const suffix of ['{"role":"user"}\n','{"partial":', '{"type":"turn_ended","status":"unknown"}\n'])expect(cursorChildTerminal(Buffer.from(end+suffix))).toBeUndefined();
});
it("reads a stable official WAL snapshot from private copies, leaving original DB/WAL bytes unchanged",async()=>{
 const f=await fixture(),writer=new DatabaseSync(f.childDb);
 try{
  writer.exec("PRAGMA journal_mode=WAL;");writer.prepare("UPDATE meta SET value=? WHERE key='0'").run(Buffer.from(JSON.stringify(metadata({createdAt:2000}))).toString("hex"));
  const dbBefore=await readFile(f.childDb),walBefore=await readFile(f.childDb+"-wal");
  const record=await f.reader.open(parent,child,()=>true);expect(record?.lineage.createdAt).toBe(2000);await record?.fd.close();
  expect(await readFile(f.childDb)).toEqual(dbBefore);expect(await readFile(f.childDb+"-wal")).toEqual(walBefore);
 }finally{writer.close();f.reader.close();}
});
it("reuses only identical DB/WAL revisions and avoids a database copy/query on every read",async()=>{
 const f=await fixture(),query=vi.spyOn(MetadataQuery,"queryCursorChildMetadata");
 const first=await f.reader.open(parent,child,()=>true);expect(first).toBeDefined();await first?.fd.close();
 const second=await f.reader.open(parent,child,()=>true);expect(second).toBeDefined();await second?.fd.close();expect(query).toHaveBeenCalledTimes(1);
 db(f.childDb,metadata({createdAt:2000}));const third=await f.reader.open(parent,child,()=>true);expect(third?.lineage.createdAt).toBe(2000);await third?.fd.close();expect(query).toHaveBeenCalledTimes(2);f.reader.close();
});
it("bounds whole database/WAL copy sizes before querying",async()=>{
 const f=await fixture();await truncate(f.childDb,32*1024*1024+1);expect(await f.reader.open(parent,child,()=>true)).toBeUndefined();f.reader.close();
});
it("rejects a pathological metadata view without executing its recursive query",async()=>{
 const f=await fixture(),dbFile=join(f.root,"private-malformed-copy.db"),sql=new DatabaseSync(dbFile);
 sql.exec("CREATE VIEW meta AS WITH RECURSIVE counter(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM counter) SELECT '0' AS key, CAST(sum(n) AS TEXT) AS value FROM counter;");sql.close();
 const start=performance.now(),query=await MetadataQuery.queryCursorChildMetadata(dbFile,1500);expect(query.value).toBeUndefined();await query.physicalClose;expect(query.closed()).toBe(true);expect(performance.now()-start).toBeLessThan(1500);f.reader.close();
});
it("kills only its own fixed metadata worker on deadline and confirms pipe close",async()=>{
 const f=await fixture(),start=performance.now(),query=await MetadataQuery.queryCursorChildMetadata(f.childDb,1);
 expect(query.value).toBeUndefined();await query.physicalClose;expect(query.closed()).toBe(true);expect(performance.now()-start).toBeLessThan(1500);f.reader.close();
});
it("does not inherit Node preload hooks or return encryption/provider metadata from its worker",async()=>{
 const f=await fixture(),preload=join(f.root,"preload.cjs"),marker=join(f.root,"preload-ran");
 await writeFile(preload,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`);
 const previous=process.env.NODE_OPTIONS;process.env.NODE_OPTIONS=`--require ${preload}`;
 try{const query=await MetadataQuery.queryCursorChildMetadata(f.childDb,1500);expect(query.closed()).toBe(true);expect(query.value).not.toContain("generated-private-not-returned");expect(query.value).not.toContain("not-a-child-observation");expect(await lstat(marker).catch(()=>undefined)).toBeUndefined();}
 finally{if(previous===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=previous;f.reader.close();}
});
it("preserves the installed config-root path instead of trimming significant trailing spaces",async()=>{
 const f=await fixture(),config=f.roots.cursorConfigHome+" space ";f.reader.close();await rename(f.roots.cursorConfigHome,config);vi.stubEnv("CURSOR_CONFIG_DIR",config);
 const reader=new CursorChildRecords({home:f.root,cursorDataHome:f.roots.cursorDataHome});
 const record=await reader.open(parent,child,()=>true);expect(record?.lineage.id).toBe(child);await record?.fd.close();reader.close();
});
function contextBlob(used:number,max:number){return Buffer.from([42,4,8,used,16,max]);}
function setRoot(file:string,blob:Buffer,extra:Record<string,unknown>={}){const rootId=createHash('sha256').update(blob).digest('hex'),sql=new DatabaseSync(file);try{sql.exec('CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, data BLOB);');sql.prepare('INSERT OR REPLACE INTO blobs VALUES (?,?)').run(rootId,blob);sql.prepare("UPDATE meta SET value=? WHERE key='0'").run(Buffer.from(JSON.stringify(metadata({...extra,latestRootBlobId:rootId}))).toString('hex'));}finally{sql.close();}return rootId;}
it("reads only child latest-root context via the fixed private SQLite worker and seals the DB generation",async()=>{
 const f=await fixture();setRoot(f.childDb,contextBlob(25,100));setRoot(f.parentDb,contextBlob(99,100),{agentId:parent});const bytes=await readFile(f.childDb);const opened=await f.reader.open(parent,child,()=>true);expect(opened?.context).toMatchObject({used:25,max:100});expect(opened?.snapshotSeal).toMatch(/^[a-f0-9]{64}$/);const seal=opened!.snapshotSeal;
 try{setRoot(f.childDb,contextBlob(50,100));expect(await opened!.unchanged()).toBe(false);}finally{await opened?.fd.close();}
 const fresh=await f.reader.open(parent,child,()=>true);try{expect(fresh?.context).toMatchObject({used:50,max:100});expect(fresh?.snapshotSeal).not.toBe(seal);expect(await readFile(f.childDb)).not.toEqual(bytes);}finally{await fresh?.fd.close();f.reader.close();}
});
it("keeps formal lineage when root numeric fields are absent, oversized, or hash-inconsistent",async()=>{
 for(const blob of [Buffer.from([42,2,16,100]),Buffer.alloc(2*1024*1024+1)]){const f=await fixture();setRoot(f.childDb,blob);const opened=await f.reader.open(parent,child,()=>true);try{expect(opened?.lineage.id).toBe(child);expect(opened?.context).toBeUndefined();}finally{await opened?.fd.close();f.reader.close();}}
 const f=await fixture();const rootId=setRoot(f.childDb,contextBlob(25,100));const sql=new DatabaseSync(f.childDb);try{sql.prepare('UPDATE blobs SET data=? WHERE id=?').run(contextBlob(50,100),rootId);}finally{sql.close();}const opened=await f.reader.open(parent,child,()=>true);try{expect(opened?.lineage.id).toBe(child);expect(opened?.context).toBeUndefined();}finally{await opened?.fd.close();f.reader.close();}
});
it("does not execute a view masquerading as the official blobs table",async()=>{
 const f=await fixture(),blob=contextBlob(25,100),rootId=createHash('sha256').update(blob).digest('hex'),sql=new DatabaseSync(f.childDb);try{sql.exec(`CREATE VIEW blobs AS SELECT '${rootId}' AS id, x'${blob.toString('hex')}' AS data`);sql.prepare("UPDATE meta SET value=? WHERE key='0'").run(Buffer.from(JSON.stringify(metadata({latestRootBlobId:rootId}))).toString('hex'));}finally{sql.close();}
 const opened=await f.reader.open(parent,child,()=>true);try{expect(opened?.lineage.id).toBe(child);expect(opened?.context).toBeUndefined();}finally{await opened?.fd.close();f.reader.close();}
});
it("includes the live WAL generation in a sealed context snapshot",async()=>{
 const f=await fixture(),writer=new DatabaseSync(f.childDb);writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');
 try{setRoot(f.childDb,contextBlob(25,100));const opened=await f.reader.open(parent,child,()=>true);expect(opened?.context?.used).toBe(25);const seal=opened?.snapshotSeal;setRoot(f.childDb,contextBlob(50,100));expect(await opened?.unchanged()).toBe(false);await opened?.fd.close();const fresh=await f.reader.open(parent,child,()=>true);try{expect(fresh?.context?.used).toBe(50);expect(fresh?.snapshotSeal).not.toBe(seal);}finally{await fresh?.fd.close();}}finally{writer.close();f.reader.close();}
});
