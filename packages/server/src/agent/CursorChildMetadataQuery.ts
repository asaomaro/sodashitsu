import { spawn } from "node:child_process";
import { dirname } from "node:path";

/** Fixed query in an owned, non-provider Node process. SQLite never opens an
 * original CLI database here. No SDK/auth, plugins, shell, model, or child spawn. */
const WORKER = String.raw`
const {DatabaseSync}=require('node:sqlite');
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',v=>{input+=v;if(input.length>8192)process.exit(2)});
process.stdin.on('end',()=>{let db;try{
 const file=JSON.parse(input).file;if(typeof file!=='string'||file.length>4096)throw Error();
 db=new DatabaseSync(file,{readOnly:true,timeout:20,allowExtension:false});
 db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
 const schema=db.prepare("SELECT type, substr(sql,1,4097) AS sql, length(sql) AS size FROM sqlite_schema WHERE name = 'meta'").get();
 // A view/generated column must not turn this fixed metadata query into
 // attacker-supplied SQL work or allocate arbitrary native SQLite blobs.
 if(!schema||schema.type!=='table'||schema.size>4096||typeof schema.sql!=='string'||
  !(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?meta\s*\(\s*key\s+TEXT\s+PRIMARY\s+KEY\s*,\s*value\s+TEXT\s*\)\s*;?\s*$/i).test(schema.sql))throw Error();
 const row=db.prepare("SELECT length(value) AS size, substr(value,1,262145) AS value FROM meta WHERE key = '0'").get();
 if(!row||!Number.isSafeInteger(row.size)||row.size>262144||typeof row.value!=='string'||!(/^(?:[a-f0-9]{2})+$/i).test(row.value))throw Error();
 const meta=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(row.value,'hex'))),s=meta.subagentInfo;
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!(/[\x00-\x1f\x7f-\x9f]/).test(v);
 if(!text(meta.agentId,128)||!Number.isSafeInteger(meta.createdAt)||meta.createdAt<0||!s||
  !text(s.parentAgentId,128)||!text(s.rootParentAgentId,128)||!text(s.toolCallId,128)||!text(s.typeName,200))throw Error();
 // Do not return encryption keys, credential metadata, or conversation blobs.
 process.stdout.write(JSON.stringify({agentId:meta.agentId,createdAt:meta.createdAt,subagentInfo:{parentAgentId:s.parentAgentId,rootParentAgentId:s.rootParentAgentId,toolCallId:s.toolCallId,typeName:s.typeName}}));
 }catch{}finally{try{db?.close()}catch{}}});
`;
export interface CursorMetadataQuery { value?: string; physicalClose: Promise<void>; closed: () => boolean }

/** Hard timeout kills only this fixed Node worker. If OS pipe close cannot be
 * confirmed, the caller retains the private files/slot until physicalClose. */
export function queryCursorChildMetadata(file:string,timeoutMs:number):Promise<CursorMetadataQuery> {
  // No inherited provider credentials, SODA routing or Node preload options.
  const env:NodeJS.ProcessEnv={};
  for(const key of ["SystemRoot","WINDIR","TEMP","TMP","TMPDIR"])if(process.env[key])env[key]=process.env[key];
  let physical=false,closeResolve!:()=>void;
  const physicalClose=new Promise<void>(resolve=>{closeResolve=resolve;});
  return new Promise(resolve=>{
    const child=spawn(process.execPath,["--input-type=commonjs","-e",WORKER],{stdio:["pipe","pipe","pipe"],windowsHide:true,cwd:dirname(file),env});
    let output="",invalid=false,settled=false,forced:ReturnType<typeof setTimeout>|undefined;
    const result=(value?:string)=>{if(settled)return;settled=true;clearTimeout(timer);if(forced)clearTimeout(forced);resolve({...(value?{value}:{}),physicalClose,closed:()=>physical});};
    const stop=()=>{if(physical)return;invalid=true;try{child.kill("SIGKILL");}catch{}if(!forced)forced=setTimeout(()=>result(),500);};
    const timer=setTimeout(stop,Math.max(1,Math.min(2000,timeoutMs)));
    child.stdout.setEncoding("utf8");child.stdout.on("data",(chunk:string)=>{if(output.length+chunk.length>8192){output="";stop();}else if(!invalid)output+=chunk;});
    child.stderr.resume();child.stdin.on("error",()=>stop());
    child.on("error",()=>{invalid=true;});
    child.on("close",code=>{physical=true;closeResolve();result(code===0&&!invalid?output:undefined);});
    try{child.stdin.end(JSON.stringify({file}));}catch{stop();}
  });
}
