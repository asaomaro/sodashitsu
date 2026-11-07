import {spawn} from 'node:child_process';
import {openVerified,readRange} from './safeFile.js';
import {windowsAgentExecutable} from './windowsAgentLaunch.js';
import {StringDecoder} from 'node:string_decoder';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {ASSISTANT_EFFORTS,type AssistantModelCatalog,type AssistantAgentKind} from '@sodashitsu/protocol';
type Kind=keyof typeof ASSISTANT_EFFORTS;
type Effort=AssistantModelCatalog["models"][number]["efforts"][number];
const validId=/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$/;
const efforts=(kind:Kind,values:unknown)=>Array.isArray(values)?[...new Set(values.filter((v):v is Effort=>typeof v==='string'&&(ASSISTANT_EFFORTS[kind] as readonly string[]).includes(v)))]:[];
/** Fixed read-only CLI operations; no renderer-supplied executable, path, prompt or arguments. */
async function query(command:string,args:string[],msp:boolean|"grok"=false):Promise<unknown>{
 const env={...process.env,MUSE_NO_AUTO_UPDATE:'1',MUSE_LOGIN:'0'};
 const target=process.platform==='win32'?await windowsAgentExecutable(command,env):{file:command,prefix:[]};
 return new Promise((resolve,reject)=>{
  const child=spawn(target.file,[...target.prefix,...args],{cwd:tmpdir(),env,stdio:['pipe','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'});
  let buffer='',text='',bytes=0,result:unknown,error:Error|undefined;const decoder=new StringDecoder('utf8');
  const timer=setTimeout(()=>finish(undefined,Error('モデル候補の取得が時間切れです')),10000);
  let done=false;
  function finish(value?:unknown,failure?:Error){
   if(done)return;done=true;result=value;error=failure;clearTimeout(timer);child.stdin.end();
   if(process.platform==='win32'&&child.pid){const killer=spawn(join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.on('error',()=>child.kill('SIGKILL'));}
   else {try{if(!child.pid)throw Error('no pid');process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
  }
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',code=>{if(process.platform!=='win32'&&child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{}}clearTimeout(timer);if(error)reject(error);else if(msp&&result===undefined)reject(Error('モデル候補を取得できません'));else if(!msp&&code!==0&&!done)reject(Error('モデル候補を取得できません'));else resolve(msp?result:text);});
  child.stderr.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2*1024*1024)finish(undefined,Error('モデル候補が大きすぎます'));});
  const send=(value:unknown)=>child.stdin.write(JSON.stringify(value)+'\n');child.stdin.on('error',()=>{});
  child.stdout.on('data',(chunk:Buffer)=>{
   bytes+=chunk.length;if(bytes>2*1024*1024){finish(undefined,Error('モデル候補が大きすぎます'));return;}
   if(!msp){text+=decoder.write(chunk);return;}buffer+=decoder.write(chunk);
   let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let row:any;try{row=JSON.parse(line);}catch{continue;}
    if(row.id===1){if(row.error){finish(undefined,Error('モデル候補を取得できません'));return;}if(msp!=="grok")send({jsonrpc:'2.0',method:'initialized',params:{}});send({jsonrpc:'2.0',id:2,method:msp==="grok"?'_x.ai/models/list':'model/list',params:{}});}
    if(row.id===2){finish(row.result,row.error?Error('モデル候補を取得できません'):undefined);return;}
   }
  });
  if(msp)send({jsonrpc:'2.0',id:1,method:'initialize',params:msp==="grok"?{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'sodashitsu',version:'1'}}:{clientInfo:{name:'sodashitsu',version:'1'}}});else child.stdin.end();
 });
}
export async function readAssistantModels(kind:Kind):Promise<AssistantModelCatalog>{
 const rows:AssistantModelCatalog['models']=[];
 const add=(id:unknown,label:unknown,tiers:unknown)=>{if(typeof id==='string'&&validId.test(id)&&!rows.some(r=>r.id===id)&&rows.length<128)rows.push({id,label:typeof label==='string'?label.slice(0,200):id,efforts:efforts(kind,tiers)});};
 try{
  if(kind==='codex'){
   const opened=await openVerified(join(process.env.CODEX_HOME||join(homedir(),'.codex'),'models_cache.json'));if(!opened)throw Error('cache file');let raw='';
   try{if(opened.st.size>2*1024*1024)throw Error('cache limit');const bytes=await readRange(opened.fd,0,2*1024*1024+1);if(bytes.length>2*1024*1024)throw Error('cache limit');raw=bytes.toString('utf8');}finally{await opened.fd.close();}
   const data=JSON.parse(raw);for(const m of (Array.isArray(data.models)?data.models:[])){if(m.visibility==='hide')continue;add(m.slug,m.display_name,m.supported_reasoning_levels?.map((e:any)=>e.effort));}
  }else if(kind==='muse'){
   const data=await query('muse',['serve','--disable-shell','--disable-write'],true) as any;for(const m of Array.isArray(data?.models)?data.models:[])add(m.modelId,m.displayLabel,m.variants);
  }else if(kind==='grok'){
   const data=await query('grok',['agent','--no-leader','stdio'],'grok') as any;
   if(data?.error)throw Error('model catalog error');
   for(const m of Array.isArray(data?.result?.availableModels)?data.result.availableModels:[])add(m.modelId,m.name,m._meta?.supportsReasoningEffort===true&&Array.isArray(m._meta.reasoningEfforts)?m._meta.reasoningEfforts.map((e:any)=>typeof e==='string'?e:e?.value):[]);
  }else if(kind==='agy'){
   const raw=await query('agy',['models']) as string;for(const line of raw.split('\n')){const [id,label]=line.split('\t');if(!label)continue;const effort=id?.match(/-(low|medium|high)$/)?.[1];add(id,label,effort?[effort]:[]);}
  }else if(kind==='claude'){
   add('opus','Opus（CLIの別名）',['low','medium','high','max']);add('sonnet','Sonnet（CLIの別名）',['low','medium','high']);add('haiku','Haiku（CLIの別名）',[]);
  }else{
   add('auto','Auto',[]);add('gpt-5.4','GPT-5.4',['low','medium','high','xhigh']);
  }
  return {models:rows,message:rows.length?(kind==='grok'?'Grok CLIから取得したモデル・effort候補です。最大5分キャッシュし、この画面内では再接続まで保持します。':['claude','copilot'].includes(kind)?'代表的なモデル候補です。利用可否は契約とCLIの版に従います。':''):'候補を取得できません。既定値または保存済みモデルを使用できます。'};
 }catch{return {models:[],message:'モデル候補を取得できません。既定値または保存済みモデルを使用できます。'};}
}
export function createAssistantModelLister(){
 const cache=new Map<string,{at:number,value:AssistantModelCatalog}>(),pending=new Map<string,Promise<AssistantModelCatalog>>();
 return (kind:Kind)=>{const saved=cache.get(kind);if(saved&&Date.now()-saved.at<(saved.value.models.length?300000:5000))return Promise.resolve(saved.value);let work=pending.get(kind);if(!work){work=readAssistantModels(kind).then(value=>{cache.set(kind,{at:Date.now(),value});return value;}).finally(()=>pending.delete(kind));pending.set(kind,work);}return work;};
}
