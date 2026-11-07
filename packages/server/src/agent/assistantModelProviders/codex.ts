import {homedir} from 'node:os';
import {join,sep} from 'node:path';
import {realpath} from 'node:fs/promises';
import {ASSISTANT_EFFORTS,type AssistantModelCatalog} from '@sodashitsu/protocol';
import {openCodexControl,type CodexControlChannel} from '../CodexControlSocket.js';
import {openVerified,readRange} from '../safeFile.js';
import type {AssistantModelProviderResult} from './types.js';
const METHODS=['initialize','model/list'] as const;
const MAX=2*1024*1024;
const validId=/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$/;
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
type Models=AssistantModelCatalog['models'];
const efforts=(values:unknown):Models[number]['efforts']=>Array.isArray(values)?[...new Set(values.filter((v):v is Models[number]['efforts'][number]=>typeof v==='string'&&(ASSISTANT_EFFORTS.codex as readonly string[]).includes(v)))]:[];
function rows(values:unknown,cache=false):Models {
 if(!Array.isArray(values)||values.length>512)throw Error('Invalid bounded model rows');
 const models:Models=[];
 for(const value of values){
  const row=object(value);if(!row)throw Error('Invalid model row');
  if(cache?row.visibility==='hide':row.hidden===true)continue;
  const id=cache?row.slug:row.model,label=cache?row.display_name:row.displayName,levels=cache?row.supported_reasoning_levels:row.supportedReasoningEfforts;
  if(typeof id!=='string'||!validId.test(id)||typeof label!=='string'||!Array.isArray(levels))throw Error('Invalid model metadata');
  if(models.some(m=>m.id===id))continue;
  models.push({id,label:label.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,200)||id,efforts:efforts(levels.map(v=>object(v)?.[cache?'effort':'reasoningEffort']))});
 }
 return models;
}
async function localCache(home:string):Promise<Models>{
 const root=await realpath(home),path=join(root,'models_cache.json');
 if(await realpath(path)!==path||!path.startsWith(root+sep))throw Error('Cache path unavailable');
 const opened=await openVerified(path);if(!opened)throw Error('Cache unavailable');
 try{
  const before=opened.st;
  if(before.size>MAX||(process.getuid&&before.uid!==process.getuid()))throw Error('Cache ownership/size unavailable');
  const bytes=await readRange(opened.fd,0,MAX+1),after=await opened.fd.stat();
  if(bytes.length!==before.size||bytes.length>MAX||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('Cache changed');
  return rows(object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))?.models,true);
 }finally{await opened.fd.close()}
}
interface Options{home?:string;open?:typeof openCodexControl}
/** Global catalog read: no conversation proof, thread/session creation, prompt,
 * config write or CLI/daemon launch. Cache fallback is explicitly not a live read. */
export async function readCodexModelOptions(options:Options={}):Promise<AssistantModelProviderResult>{
 const home=options.home??process.env.CODEX_HOME??join(homedir(),'.codex');
 let channel:CodexControlChannel<typeof METHODS[number]>|undefined;
 try{
  channel=await(options.open??openCodexControl)({home,key:'models',signal:new AbortController().signal,expires:performance.now()+10000,check:()=>{},requestMs:3000,maxRequests:5},METHODS);
  const init=object(await channel.request('initialize',{clientInfo:{name:'sodashitsu-models',version:'0.1.0'},capabilities:{experimentalApi:true}}));
  if(typeof init?.userAgent!=='string')throw Error('Initialize metadata unavailable');channel.initialized();
  const models:Models=[],cursors=new Set<string>();let cursor:string|undefined,total=0,seenRows=0;
  for(let page=0;page<4;page++){
   const result=await channel.request('model/list',{limit:128,includeHidden:false,...(cursor?{cursor}:{})});
   total+=Buffer.byteLength(JSON.stringify(result));if(total>MAX)throw Error('Model catalog byte limit');
   const row=object(result);if(Array.isArray(row?.data))seenRows+=row.data.length;if(seenRows>512)throw Error("Model row budget");const part=rows(row?.data);
   for(const model of part)if(!models.some(m=>m.id===model.id))models.push(model);
   if(models.length>512)throw Error('Model catalog row limit');
   const next=row?.nextCursor;
   if(next===null||next===undefined){if(!await channel.unchanged())throw Error('Model daemon changed');return{models,source:'cli',message:models.length?'既存Codex CLIのモデル一覧から取得しました。':'既存Codex CLIはモデル候補を返しませんでした。'};}
   if(typeof next!=='string'||!next||next.length>4096||cursors.has(next))throw Error('Model pagination invalid');
   cursors.add(next);cursor=next;
  }
  throw Error('Model catalog page limit');
 }catch{
  try{return{models:await localCache(home),source:'local-cache',message:'既存Codex CLIへ直接確認できなかったため、ローカルキャッシュを表示しています。最新・現在の利用可否は未確認です。'};}
  catch{return{models:[],source:'unavailable',message:'既存Codex CLIとローカルキャッシュからモデル候補を取得できません。保存済みの値または既定値を使用できます。'};}
 }finally{await channel?.close()}
}
