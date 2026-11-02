import {createHash} from 'node:crypto';
import {mkdir,chmod,opendir,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {UsageInsightsParams,type UsageInsights,type InsightGroup,type InsightSession,type InsightTool,type InsightCoverage,RpcError} from '@sodashitsu/protocol';
import {openVerified,readRange} from '../agent/safeFile.js';
import {claudeRoots} from './claudeSource.js';
import {safeModel} from './claudeScan.js';
const displayBase=(value:string)=>basename(value.replaceAll('\\','/'));
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,24);
const label=(v:unknown,fallback='不明')=>typeof v==='string'&&v.length<=1024?v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,128)||fallback:fallback;
const number=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1e12?n:0;
const blank=(key:string,text=key):InsightGroup=>({key,label:text,input:0,output:0,cacheRead:0,cacheWrite:0,total:0,calls:0,tools:0,errors:0,knownResults:0});
export function classifyTool(name:string,input:unknown):{name:string;category:string;basis:'direct'|'inferred'}{
 const n=label(name),o=typeof input==='object'&&input!==null?input as Record<string,unknown>:{};
 if(/^mcp__/.test(n)){return {name:n,category:'mcp',basis:'direct'};}
 if(/^(Skill|skill)$/i.test(n))return {name:label(o.skill,n),category:'skill',basis:'direct'};
 const path=o.file_path??o.path;
 if(/^(Read|read_file)$/i.test(n)&&typeof path==='string'&&/[\\/]SKILL\.md$/.test(path))return {name:label(displayBase(dirname(path.replaceAll('\\','/')))),category:'skill',basis:'inferred'};
 const category=/^(bash|shell|exec_command|run_command|terminal)$/i.test(n)?'shell':/read|write|edit|patch|file/i.test(n)?'file':/search|grep|glob|find|web/i.test(n)?'search':/spawn|agent|task|delegate/i.test(n)?'agent':'other';
 return {name:n,category,basis:'direct'};
}
interface Cursor {offset:number;dev:string;ino:string;model:string;previous:{input:number;output:number;cached:number;at?:number}|null;invalid:number;oversized:number;}
interface File {path:string;kind:'claude'|'codex';session:string;parent:string|null;role:'main'|'sub'|'unknown';account:string;accountLabel:string;project:string;projectLabel:string;}
interface EventRow {id:string;session:string;at:number;model:string;input:number;output:number;cacheRead:number;cacheWrite:number;eventType:string;name:string;category:string;basis:string;status:string;intervalStart:number;}
export interface InsightsOptions {stateDir:string;claudeRoots?:()=>string[];codexHome?:()=>string;now?:()=>number;maxBytesPerKind?:number;maxFilesPerKind?:number;maxEntriesPerKind?:number;maxPages?:number;maxReconcileEvents?:number;workspaces?:()=>{cwd:string;label:string}[];}
/** Numeric index only. No messages, commands, tool arguments or full paths are retained. */
export class UsageInsightsReader {
 private active=false;
 private retentionFloor=0;
 constructor(private readonly options:InsightsOptions){}
 async read(raw:UsageInsightsParams,check:()=>void=()=>{}):Promise<UsageInsights>{
  check();const params=UsageInsightsParams.parse(raw);
  try{new Intl.DateTimeFormat('en-US',{timeZone:params.timezone});}catch{throw new RpcError('invalid_params','タイムゾーンが不正です');}
  if(this.active)throw new RpcError('agent_pane_busy','利用分析を集計中です');
  this.active=true;let db:DatabaseSync|undefined;const coverage:InsightCoverage[]=[];const now=(this.options.now??Date.now)();
  try{
   await mkdir(this.options.stateDir,{recursive:true,mode:0o700});check();
   const dbPath=join(this.options.stateDir,'usage-insights.sqlite');
   // A numeric index has a fixed, server-owned name. Never accept client paths.
   const {lstat}=await import('node:fs/promises');const st=await lstat(dbPath).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(st&&(st.isSymbolicLink()||!st.isFile()||st.nlink!==1))throw new Error('unsafe usage index');
   db=new DatabaseSync(dbPath);await chmod(dbPath,0o600);
   db.exec(`PRAGMA journal_mode=DELETE; PRAGMA max_page_count=${Math.max(32,Math.min(32768,this.options.maxPages??32768))};
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,kind TEXT,parent TEXT,role TEXT,project TEXT,projectLabel TEXT,account TEXT,accountLabel TEXT);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session TEXT,at REAL,model TEXT,input REAL,output REAL,cacheRead REAL,cacheWrite REAL,eventType TEXT,name TEXT,category TEXT,basis TEXT,status TEXT,intervalStart REAL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS events_at ON events(at);
    CREATE INDEX IF NOT EXISTS events_session ON events(session);
    CREATE TABLE IF NOT EXISTS cursors(id TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,value TEXT);`);
   this.retentionFloor=now-400*86400000;
   db.prepare('DELETE FROM events WHERE at < ?').run(now-400*86400000);
   const discovery=await this.discover(check);
   let collecting=false;
   for(const kind of ['claude','codex'] as const){
    check();const files=discovery.files.filter(f=>f.kind===kind),cov:InsightCoverage={kind,files:files.length,pending:0,missing:0,invalid:0,oversized:0,firstAt:null,lastAt:null,limited:discovery.limited};
    coverage.push(cov);let budget=this.options.maxBytesPerKind??32*1024*1024,processed=0;
    const maxFiles=this.options.maxFilesPerKind??64,deadline=performance.now()+1800;
    const setting=db.prepare('SELECT value FROM settings WHERE id=?').get(`next:${kind}`) as {value:string}|undefined;
    const start=number(Number(setting?.value))%Math.max(1,files.length);let next=start;
    for(let i=0;i<files.length;i++){
     check();if(performance.now()>=deadline){cov.pending+=files.length-i;next=(start+i)%files.length;break;}
     const index=(start+i)%files.length,f=files[index]!;
     const key=hash(f.path),saved=db.prepare('SELECT value FROM cursors WHERE id=?').get(key) as {value:string}|undefined;
     let cursor:Cursor=saved?JSON.parse(saved.value):{offset:0,dev:'',ino:'',model:'不明',previous:{input:0,output:0,cached:0},invalid:0,oversized:0};
     const opened=await openVerified(f.path).catch(()=>null);
     if(!opened){cov.missing++;continue;}
     try{
      if(cursor.dev!==String(opened.st.dev)||cursor.ino!==String(opened.st.ino)||opened.st.size<cursor.offset)cursor={offset:0,dev:String(opened.st.dev),ino:String(opened.st.ino),model:'不明',previous:{input:0,output:0,cached:0},invalid:0,oversized:0};
      if(opened.st.size>cursor.offset){
       if(budget<=0||processed>=maxFiles||performance.now()>=deadline){cov.pending++;continue;}
       processed++;next=(index+1)%files.length;
       db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(f.session,f.kind,f.parent,f.role,f.project,f.projectLabel,f.account,f.accountLabel);
       const size=Math.min(opened.st.size-cursor.offset,budget,Math.min(2*1024*1024,Math.max(4096,(this.options.maxPages??32768)*256))),buf=await readRange(opened.fd,cursor.offset,size);check();budget-=buf.length;
       let end=buf.lastIndexOf(10);
       if(end<0&&buf.length===2*1024*1024){cursor.oversized++;cursor.offset+=buf.length;cursor.invalid++;}
       else if(end>=0){
        const lines=buf.subarray(0,end).toString('utf8').split('\n');
        db.exec('BEGIN');
        try{for(const line of lines){check();if(!line.trim())continue;try{this.consume(db,f,cursor,JSON.parse(line));}catch(e){if(e instanceof SyntaxError)cursor.invalid++;else throw e;}}db.exec('COMMIT');}
        catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}
        cursor.offset+=end+1;
       }
       if(cursor.offset<opened.st.size)cov.pending++;
       db.prepare('INSERT OR REPLACE INTO cursors VALUES(?,?)').run(key,JSON.stringify(cursor));
      }
      cov.invalid+=cursor.invalid;cov.oversized+=cursor.oversized;
     }finally{await opened.fd.close();}
    }
    db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(`next:${kind}`,String(next));
    cov.limited||=cov.pending>0;collecting||=cov.pending>0;
   }
   const currentSessions=new Set(discovery.files.map(f=>f.session));
   for(const row of db.prepare('SELECT id FROM sessions WHERE NOT EXISTS(SELECT 1 FROM events WHERE events.session=sessions.id)').all() as {id:string}[])if(!currentSessions.has(row.id))db.prepare('DELETE FROM sessions WHERE id=?').run(row.id);
   if(!discovery.limited){const known=new Set(discovery.files.map(f=>hash(f.path)));for(const cursor of db.prepare('SELECT id FROM cursors').all() as {id:string}[])if(!known.has(cursor.id))db.prepare('DELETE FROM cursors WHERE id=?').run(cursor.id);}
   // Child files do not repeat cwd; inherit only from their verified, same-config parent.
   db.exec(`UPDATE sessions AS child SET project=(SELECT project FROM sessions WHERE id=child.parent),projectLabel=(SELECT projectLabel FROM sessions WHERE id=child.parent) WHERE role='sub' AND projectLabel='不明' AND EXISTS(SELECT 1 FROM sessions WHERE id=child.parent);`);
   check();return this.aggregate(db,params,now,coverage,collecting);
  }catch(e){
   if(db&&(e as {errcode?:number}).errcode===13){
    if(db.isTransaction)db.exec('ROLLBACK');
    const cutoff=db.prepare('SELECT max(at) at FROM (SELECT at FROM events ORDER BY at LIMIT 10000)').get() as {at:number|null};
    if(cutoff.at===null)throw new Error('分析用DBの空き容量を確保できません');
    db.prepare('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY at LIMIT 10000)').run();
    const old=db.prepare('SELECT value FROM settings WHERE id=?').get('evictedBefore') as {value:string}|undefined;
    db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('evictedBefore',String(Math.max(cutoff.at,Number(old?.value)||0)));
    for(const cov of coverage){cov.pending++;cov.limited=true;}check();
    return this.aggregate(db,params,now,coverage,true);
   }
   throw e;
  }finally{db?.close();this.active=false;}
 }
 private async discover(check:()=>void){
  const files:File[]=[];let entries=0,limited=false;
  const walk=async(root:string,kind:File['kind'],depth:number,account:string,accountLabel:string,parent:string|null=null)=>{
   if(depth<0)return;
   const dir=await opendir(root).catch(()=>null);if(!dir)return;
   for await(const entry of dir){check();if(++entries>(this.options.maxEntriesPerKind??10000)){limited=true;break;}if(entry.isSymbolicLink()){limited=true;continue;}
    const path=join(root,entry.name);
    if(entry.isDirectory()){
     const sub=entry.name==='subagents'?`${kind}:${account}:${basename(root)}`:parent;
     await walk(path,kind,depth-1,account,accountLabel,sub);
    }else if(entry.isFile()&&entry.name.endsWith('.jsonl')){
     if(kind==='claude'&&!(depth===2||parent))continue;
     const name=entry.name.slice(0,-6);if(kind==='claude'?!/^[\w-]{1,160}$/.test(name):!/^rollout-[\w.-]+$/.test(name))continue;
     const id=kind==='codex'?name.match(/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i)?.[1]:name;
     if(!id)continue;const session=`${kind}:${account}:${id}`;
     const projectLabel=kind==='claude'&&!parent?label(basename(root)):'不明';
     files.push({path,kind,session,parent,role:parent?'sub':kind==='claude'?(name.startsWith('agent-')?'sub':'main'):'unknown',account,accountLabel,project:hash(projectLabel),projectLabel});
    }
   }
  };
  for(const root of [...new Set((this.options.claudeRoots??claudeRoots)())]){
   const resolved=await realpath(root).catch(()=>null);if(resolved)await walk(resolved,'claude',3,hash(dirname(resolved)),`Claude 設定 ${hash(dirname(resolved)).slice(0,6)}`);
  }
  const codex=(this.options.codexHome??(()=>process.env.CODEX_HOME||join(homedir(),'.codex')))();
  entries=0;
  for(const directory of ['sessions','archived_sessions']){const root=await realpath(join(codex,directory)).catch(()=>null);if(root)await walk(root,'codex',4,hash(codex),`Codex 設定 ${hash(codex).slice(0,6)}`);}
  return {files,limited};
 }
 private projectLabel(cwd:string){return label(this.options.workspaces?.().find(w=>w.cwd===cwd)?.label??displayBase(cwd));}
 private consume(db:DatabaseSync,f:File,c:Cursor,row:any){
  if(!row||typeof row!=='object')return;const at=typeof row.timestamp==='string'?Date.parse(row.timestamp):NaN,p=row.payload;
  if(f.kind==='codex'&&row.type==='session_meta'&&p){
   const source=p.source?.subagent?.thread_spawn;const candidate=source?.parent_thread_id??p.parent_thread_id;const parent=typeof candidate==='string'&&/^[\w-]{1,160}$/.test(candidate)?candidate:null;
   const isSub=!!parent||p.thread_source==='subagent'||!!p.source?.subagent;
   const cwd=typeof p.cwd==='string'?p.cwd:undefined;
   db.prepare('UPDATE sessions SET parent=?,role=?,project=?,projectLabel=?,accountLabel=? WHERE id=?').run(typeof parent==='string'?`codex:${f.account}:${parent}`:null,isSub?'sub':p.source==='cli'||p.thread_source==='cli'||p.thread_source==='user'?'main':'unknown',cwd?hash(cwd):f.project,cwd?this.projectLabel(cwd):f.projectLabel,`Codex 設定 ${f.account.slice(0,6)}`,f.session);
   return;
  }
  if(f.kind==='claude'&&typeof row.cwd==='string')db.prepare('UPDATE sessions SET project=?,projectLabel=? WHERE id=?').run(hash(row.cwd),this.projectLabel(row.cwd),f.session);
  if(f.kind==='codex'&&row.type==='turn_context'){c.model=safeModel(p?.model)??'不明';return;}
  const put=(id:string,type:string,t:{input:number;output:number;cacheRead:number;cacheWrite:number},name='',category='',basis='direct',status='unknown',eventAt=at,intervalStart=0)=>{
   if(!Number.isFinite(eventAt)){c.invalid++;return;}if(eventAt<this.retentionFloor)return;
   db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET input=max(input,excluded.input),output=max(output,excluded.output),cacheRead=max(cacheRead,excluded.cacheRead),cacheWrite=max(cacheWrite,excluded.cacheWrite)').run(hash(`${f.session}:${id}`),f.session,eventAt,c.model,t.input,t.output,t.cacheRead,t.cacheWrite,type,name,category,basis,status,intervalStart);
  };
  const zero={input:0,output:0,cacheRead:0,cacheWrite:0};
  const tool=(id:unknown,name:unknown,input:unknown)=>{
   if(typeof id!=='string'||typeof name!=='string')return;const t=classifyTool(name,input);put(`tool:${id}`,'tool',zero,t.name,t.category,t.basis);
   if(/^(exec|functions\.exec)$/.test(name)&&typeof input==='string'){
    let count=0;for(const match of input.matchAll(/\b(?:tools|functions)\.([A-Za-z_][\w]*)\s*\(/g)){
     if(count++>=64)break;const inner=classifyTool(match[1]!,{});put(`nested:${id}:${match.index}`,'inferred_tool',zero,inner.name,inner.category,'inferred');
    }
   }
  };
  const outcome=(id:unknown,status:string)=>{if(typeof id==='string')db.prepare('UPDATE events SET status=? WHERE id=?').run(status,hash(`${f.session}:tool:${id}`));};
  if(f.kind==='claude'){
   if(row.isSidechain&&f.role!=='sub')return;
   const m=row.message;
   if(row.type==='assistant'&&m){
    c.model=safeModel(m.model)??c.model;const u=m.usage;
    if(u&&typeof m.id==='string'&&number(u.input_tokens)===u.input_tokens&&number(u.output_tokens)===u.output_tokens)put(`usage:${m.id}`,'usage',{input:number(u.input_tokens),output:number(u.output_tokens),cacheRead:number(u.cache_read_input_tokens),cacheWrite:number(u.cache_creation_input_tokens)});
   }
   if(Array.isArray(m?.content))for(const part of m.content){if(!part||typeof part!=='object'){c.invalid++;continue;}if(part.type==='tool_use')tool(part.id,part.name,part.input);if(part.type==='tool_result')outcome(part.tool_use_id,part.is_error===true?'failed':'success');}
  }else{
   // New per-response usage records supersede the corresponding cumulative samples.
   if(row.type==='token_usage_record'&&p?.usage&&typeof p.response_id==='string'){
    const u=p.usage;if(number(u.input_tokens)!==u.input_tokens||number(u.output_tokens)!==u.output_tokens||number(u.cached_input_tokens)+number(u.cache_write_input_tokens)>u.input_tokens){c.invalid++;return;}
    put(`usage:${p.response_id}`,'response_usage',{input:Math.max(0,number(u.input_tokens)-number(u.cached_input_tokens)-number(u.cache_write_input_tokens)),output:number(u.output_tokens),cacheRead:number(u.cached_input_tokens),cacheWrite:number(u.cache_write_input_tokens)});
   }
   if(row.type==='event_msg'&&p?.type==='token_count'){
    const u=p.info?.total_token_usage;if(u&&number(u.input_tokens)===u.input_tokens&&number(u.output_tokens)===u.output_tokens){
     const current={input:number(u.input_tokens),output:number(u.output_tokens),cached:number(u.cached_input_tokens),at},before=c.previous;c.previous=current;
     if(before){const input=current.input-before.input,output=current.output-before.output,cached=current.cached-before.cached;
      if(input>=0&&output>=0&&cached>=0&&cached<=input&&(input+output)>0)put(`cumulative:${at}:${current.input}:${current.output}`,'cumulative_usage',{input:input-cached,output,cacheRead:cached,cacheWrite:0},'','','direct','unknown',at,before.at??0);
      else if(input<0||output<0||cached<0)c.invalid++;
     }
    }
   }
   if(row.type==='event_msg'&&p&&['task_started','task_complete','turn_aborted','task_failed'].includes(p.type))put(`activity:${p.type}:${p.turn_id??at}`,'activity',zero,p.type);
   if(row.type==='response_item'&&p){
    if(p.type==='function_call'||p.type==='custom_tool_call'){
     let input:unknown=p.arguments??p.input;try{input=typeof p.arguments==='string'?JSON.parse(p.arguments):p.arguments??p.input;}catch{}
     tool(p.call_id,p.name,input);
    }
    if(p.type==='function_call_output'||p.type==='custom_tool_call_output'){
     let result:any;try{result=typeof p.output==='string'?JSON.parse(p.output):p.output;}catch{}
     const code=result?.exit_code??result?.metadata?.exit_code;
     outcome(p.call_id,typeof code==='number'?(code===0?'success':'failed'):result?.isError===true?'failed':'unknown');
    }
   }
  }
 }
 private aggregate(db:DatabaseSync,p:UsageInsightsParams,now:number,coverage:InsightCoverage[],collecting:boolean):UsageInsights{
  const eviction=db.prepare('SELECT value FROM settings WHERE id=?').get('evictedBefore') as {value:string}|undefined;
  const retainedFloor=Math.max(this.retentionFloor,Number(eviction?.value)||0);
  // UTC date filters are kept stable across exports; chart buckets can use the local time zone.
  const from=Date.parse(p.from+'T00:00:00Z'),until=Date.parse(p.to+'T00:00:00Z')+86400000,length=until-from;
  const source=db.prepare('SELECT e.*,s.kind,s.parent,s.role,s.project,s.projectLabel,s.account,s.accountLabel FROM events e JOIN sessions s ON s.id=e.session WHERE e.at>=? AND e.at<? ORDER BY e.at LIMIT 200001').all(from-length,until) as unknown as (EventRow&File)[];
  const rows=source.slice(0,200000);
  const models=new Set<string>(),kinds=new Set<string>(),projects=new Map<string,string>(),accounts=new Map<string,string>();
  // Prefer explicit response records per session, avoiding cumulative + response double counting.
  // Prefix sums make mixed-format reconciliation O(N log N), including intervals
  // which begin before the selected comparison period.
  const fields=['input','output','cacheRead','cacheWrite'] as const;
  const explicit=new Map<string,{at:number;sum:number[]}[]>(),ranges=new Map<string,{from:number;to:number}>(),incomplete=new Map<string,number>();
  for(const row of rows)if(row.eventType==='cumulative_usage'){const range=ranges.get(row.session)??{from:row.intervalStart,to:row.at};range.from=Math.min(range.from,row.intervalStart);range.to=Math.max(range.to,row.at);ranges.set(row.session,range);}
  let remaining=this.options.maxReconcileEvents??200000,reconcileLimited=false,scannedSessions=0;
  const responseQuery=db.prepare("SELECT at,input,output,cacheRead,cacheWrite FROM events WHERE session=? AND eventType='response_usage' AND at>? AND at<=? ORDER BY at DESC LIMIT ?");
  for(const [session,range] of ranges){
   if(remaining<=0||scannedSessions++>=512){incomplete.set(session,Infinity);reconcileLimited=true;continue;}
   const selected=responseQuery.all(session,range.from,range.to,remaining+1) as unknown as EventRow[];
   const kept=selected.slice(0,remaining).reverse();
   if(selected.length>remaining){incomplete.set(session,kept[0]?.at??Infinity);reconcileLimited=true;}
   remaining-=kept.length;const list:{at:number;sum:number[]}[]=[];
   for(const row of kept){const before=list.at(-1)?.sum??[0,0,0,0];list.push({at:row.at,sum:fields.map((key,i)=>(before[i]??0)+row[key]+(key==='input'?row.cacheWrite:0))});}
   explicit.set(session,list);
  }
  const prefixAt=(list:{at:number;sum:number[]}[],at:number)=>{let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;if(list[mid]!.at<=at)lo=mid+1;else hi=mid;}return list[lo-1]?.sum??[0,0,0,0];};
  for(const row of rows)if(row.eventType==='cumulative_usage'){
   if(row.intervalStart<(incomplete.get(row.session)??-Infinity)){fields.forEach(key=>{row[key]=0;});continue;}
   const list=explicit.get(row.session)??[],end=prefixAt(list,row.at),start=prefixAt(list,row.intervalStart);
   fields.forEach((key,i)=>{row[key]=Math.max(0,row[key]-((end[i]??0)-(start[i]??0)));});
  }
  let dimensionLimited=false;
  const filtered=rows.filter(r=>{
   kinds.add(r.kind);if(r.model!=='不明'){if(models.size<256)models.add(r.model);else dimensionLimited=true;}if(projects.size<512)projects.set(r.project,r.projectLabel);else dimensionLimited=true;if(accounts.size<128)accounts.set(r.account,r.accountLabel);else dimensionLimited=true;
   return (!p.kind||r.kind===p.kind)&&(!p.model||r.model===p.model)&&(!p.project||r.project===p.project)&&(!p.account||r.account===p.account)&&(!p.role||r.role===p.role)&&(!p.session||r.session===p.session)&&!(r.eventType==='cumulative_usage'&&r.input+r.output+r.cacheRead+r.cacheWrite===0);
  });
  const maps={byDay:new Map<string,InsightGroup>(),byDayRole:new Map<string,InsightGroup>(),previousByDay:new Map<string,InsightGroup>(),byKind:new Map<string,InsightGroup>(),byModel:new Map<string,InsightGroup>(),byProject:new Map<string,InsightGroup>(),byAccount:new Map<string,InsightGroup>(),byRole:new Map<string,InsightGroup>(),byHour:new Map<string,InsightGroup>()};
  const activity={started:0,completed:0,aborted:0,failed:0};
  const totals=blank('total'),previous=blank('previous'),sessions=new Map<string,InsightSession>(),tools=new Map<string,InsightTool>();
  const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}),hourFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:p.timezone,hour:'2-digit',hourCycle:'h23'});
  const sum=(g:InsightGroup,r:EventRow)=>{if(r.eventType==='inferred_tool')return;if(r.eventType==='tool'){g.tools++;if(r.status==='failed')g.errors++;if(r.status!=='unknown')g.knownResults++;}else{g.input+=r.input;g.output+=r.output;g.cacheRead+=r.cacheRead;g.cacheWrite+=r.cacheWrite;g.total+=r.input+r.output+r.cacheRead+r.cacheWrite;g.calls++;}};
  const group=(map:Map<string,InsightGroup>,key:string,r:EventRow,text=key)=>{if(map!==maps.byDay&&map!==maps.previousByDay&&map!==maps.byDayRole&&map.size>=256&&!map.has(key)){key='__other';text='その他（分類上限）';dimensionLimited=true;}const g=map.get(key)??blank(key,text);sum(g,r);map.set(key,g);};
  for(const r of filtered){
   const current=r.at>=from;if(r.eventType==='activity'){if(current){const key={task_started:'started',task_complete:'completed',turn_aborted:'aborted',task_failed:'failed'}[r.name] as keyof typeof activity|undefined;if(key)activity[key]++;}continue;}sum(current?totals:previous,r);group(current?maps.byDay:maps.previousByDay,dateFormatter.format(r.at),r);
   if(!current)continue;group(maps.byDayRole,`${dateFormatter.format(r.at)}:${r.role}`,r);
   group(maps.byKind,r.kind,r);group(maps.byModel,`${r.kind}:${r.model}`,r,r.model);group(maps.byProject,r.project,r,r.projectLabel);group(maps.byAccount,r.account,r,r.accountLabel);group(maps.byRole,r.role,r);group(maps.byHour,hourFormatter.format(r.at),r);
   const session=sessions.get(r.session)??{...blank(r.session,r.session.split(':').at(-1)!.slice(0,8)),kind:r.kind,parent:r.parent,role:r.role,project:r.projectLabel,account:r.accountLabel,firstAt:r.at,lastAt:r.at};sum(session,r);session.lastAt=Math.max(session.lastAt,r.at);sessions.set(r.session,session);
   if(r.eventType==='tool'||r.eventType==='inferred_tool'){
    const key=`${r.basis}:${r.category}:${r.name}`,tool=tools.get(key)??{name:r.name,category:r.category,basis:r.basis as InsightTool['basis'],nested:r.eventType==='inferred_tool',calls:0,success:0,failed:0,unknown:0};tool.calls++;if(r.status==='success')tool.success++;else if(r.status==='failed')tool.failed++;else tool.unknown++;tools.set(key,tool);
   }
  }
  for(const cov of coverage){const bounds=db.prepare('SELECT min(at) firstAt,max(at) lastAt FROM events JOIN sessions ON sessions.id=events.session WHERE kind=?').get(cov.kind) as {firstAt:number|null;lastAt:number|null};cov.firstAt=bounds.firstAt;cov.lastAt=bounds.lastAt;}
  const sorted=(map:Map<string,InsightGroup>)=>[...map.values()].sort((a,b)=>b.total-a.total||b.tools-a.tools);
  const timeSorted=(map:Map<string,InsightGroup>)=>[...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
  return {from:p.from,to:p.to,asOf:now,timezone:p.timezone,partial:from-length<retainedFloor||collecting||source.length>200000||reconcileLimited||dimensionLimited||sessions.size>500||tools.size>200||coverage.some(c=>c.limited||c.missing>0||c.invalid>0||c.oversized>0),collecting,retainedFrom:new Date(retainedFloor).toISOString().slice(0,10),totals,previous,activity,...Object.fromEntries(Object.entries(maps).map(([key,map])=>[key,key==='byDay'||key==='previousByDay'||key==='byHour'?timeSorted(map):sorted(map)])) as Pick<UsageInsights,keyof typeof maps>,tools:[...tools.values()].sort((a,b)=>b.calls-a.calls).slice(0,200),sessions:[...sessions.values()].sort((a,b)=>b.total-a.total).slice(0,500),coverage,options:{kinds:[...kinds].sort(),models:[...models].sort(),projects:[...projects].map(([key,label])=>({key,label})),accounts:[...accounts].map(([key,label])=>({key,label}))}};
 }
}
