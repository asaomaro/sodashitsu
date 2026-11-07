import {spawn} from 'node:child_process';
import {ASSISTANT_EFFORTS} from '@sodashitsu/protocol';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {windowsAgentExecutable} from '../windowsAgentLaunch.js';
import type {AssistantModelProviderResult} from './types.js';

const requestId='sodashitsu-model-options';
const MAX_BYTES=2*1024*1024;
const MAX_MODELS=512;
const validId=/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$/;
const EFFORTS=ASSISTANT_EFFORTS.claude;
/** Pure projection of the SDK initialize model metadata; never infers effort by model name. */
export function parseClaudeModelOptions(value:unknown):AssistantModelProviderResult['models'] {
 if(!Array.isArray(value)||value.length>MAX_MODELS)throw Error('invalid model metadata');
 const rows:AssistantModelProviderResult['models']=[];
 for(const raw of value){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid model metadata');
  const m=raw as Record<string,unknown>;
  if(typeof m.value!=='string'||!validId.test(m.value)||rows.some(row=>row.id===m.value))throw Error('invalid model metadata');
  const tiers=m.supportsEffort===true&&Array.isArray(m.supportedEffortLevels)?m.supportedEffortLevels:[];
  rows.push({id:m.value,label:typeof m.displayName==='string'?m.displayName.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,200)||m.value:m.value,
   efforts:[...new Set(tiers.filter((e):e is typeof EFFORTS[number]=>typeof e==='string'&&(EFFORTS as readonly string[]).includes(e)))]});
 }
 return rows;
}

/** A fresh owned CLI receives only initialize, never a user message or a resume/session-new operation. */
async function query():Promise<unknown>{
 const cwd=await mkdtemp(join(tmpdir(),'soda-claude-model-options-'));
 try{
  // Keep normal environment authentication, but never copy/read user credential files or let
  // startup write normal config/cache. These are CLI defaults, not verified account availability.
  const env={...process.env,HOME:cwd,USERPROFILE:cwd,CLAUDE_CONFIG_DIR:cwd,
   XDG_CONFIG_HOME:cwd,XDG_CACHE_HOME:cwd,XDG_DATA_HOME:cwd,XDG_STATE_HOME:cwd,
   ...(process.platform==='win32'?{APPDATA:cwd,LOCALAPPDATA:cwd}:{}),
   DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
  delete (env as NodeJS.ProcessEnv).CLAUDECODE;
  const target=process.platform==='win32'?await windowsAgentExecutable('claude',env):{file:'claude',prefix:[]};
  return await new Promise((resolve,reject)=>{
   const child=spawn(target.file,[...target.prefix,'--print','--input-format','stream-json','--output-format','stream-json','--verbose',
    '--no-session-persistence','--setting-sources','','--settings','{"disableAllHooks":true}',
    '--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--tools','','--disable-slash-commands','--no-chrome'],
    {cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'});
   let done=false,bytes=0,buffer='',result:unknown,failure:Error|undefined;
   const decoder=new StringDecoder('utf8');
   function kill(){
    if(process.platform==='win32'&&child.pid){
     const killer=spawn(join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
     killer.on('error',()=>child.kill('SIGKILL'));
    }else{try{if(!child.pid)throw Error('no pid');process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
   }
   function finish(value:unknown,error?:Error){if(done)return;done=true;result=value;failure=error;clearTimeout(timer);child.stdin.end();kill();}
   const timer=setTimeout(()=>finish(undefined,Error('model metadata timeout')),10000);
   child.on('error',()=>{clearTimeout(timer);reject(Error('model metadata unavailable'));});
   child.on('close',()=>{clearTimeout(timer);if(!done){done=true;failure=Error('model metadata unavailable');kill();}if(failure)reject(failure);else resolve(result);});
   child.stdin.on('error',()=>{});
   const budget=(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>MAX_BYTES){finish(undefined,Error('model metadata limit'));return false;}return!done;};
   child.stderr.on('data',(chunk:Buffer)=>{budget(chunk);});
   child.stdout.on('data',(chunk:Buffer)=>{
    if(!budget(chunk))return;buffer+=decoder.write(chunk);
    let end:number;
    while((end=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let row:any;
     try{row=JSON.parse(line);}catch{finish(undefined,Error('invalid model metadata'));return;}
     if(row?.type!=='control_response'||row.response?.request_id!==requestId)continue;
     if(row.response.subtype!=='success'){finish(undefined,Error('model metadata unavailable'));return;}
     finish(row.response.response?.models);return;
    }
   });
   child.stdin.write(JSON.stringify({type:'control_request',request_id:requestId,request:{subtype:'initialize'}})+'\n');
  });
 }finally{await rm(cwd,{recursive:true,force:true});}
}
export async function readClaudeModelOptions():Promise<AssistantModelProviderResult>{
 try{
  const models=parseClaudeModelOptions(await query());
  return{models,source:models.length?'cli':'unavailable',message:models.length?'CLIが提示したモデルとeffortです。契約上の利用可否やサーバ側の最新一覧を保証するものではありません。':'候補を取得できません。既定値または保存済みモデルを使用できます。'};
 }catch{return{models:[],source:'unavailable',message:'CLIのモデル候補を取得できません。既定値または保存済みモデルを使用できます。'};}
}
