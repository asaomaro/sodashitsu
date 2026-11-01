import { VoiceConfig, VoiceHost, AdditionalVoiceCore, readVoiceConfig, writeVoiceConfig } from "./VoiceHost.js";
import {requestVoiceResident,voiceVersions} from "./VoiceResident.js";
import {VoiceCoreCallParams} from "@sodashitsu/protocol";
import {ConfigError} from "../config.js";
import {randomUUID} from "node:crypto";
import type {Readable} from "node:stream";
import {readFile,writeFile,rename,unlink} from "node:fs/promises";
const usage='soda voice configure|enable|disable|status|serve|add-core|remove-core|versions|speakers|query|synthesize|call [--state-dir DIR] [--transport ipc|http] [--data-dir DIR] [--python FILE --runtime-dir DIR --python-path DIR --acceleration-mode CPU|GPU|AUTO] [--core-version VERSION] [--text TEXT | --text-file FILE] [--speaker ID] [--input JSON_FILE|-] [--output FILE|-]';
export async function readVoiceInput(stream:Readable=process.stdin){stream.setEncoding('utf8');let value='';for await(const part of stream)value+=part;return value;}
async function saveOutput(path:string,data:string|Uint8Array){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,data,{flag:'wx',mode:0o600});await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}}
export async function runVoiceCommand(args:readonly string[],defaultDir:string):Promise<void>{
 const [action,...rest]=args;
 const commands=['configure','enable','disable','status','serve','add-core','remove-core','versions','speakers','query','synthesize','call','devices'];
 if(!commands.includes(action??''))throw new ConfigError('音声コマンドを確認してください',usage);
 const names=['--state-dir','--data-dir','--python','--python-path','--runtime-dir','--port','--threads','--transport','--acceleration-mode','--core-version','--text','--text-file','--speaker','--input','--output'];
 const options=new Map<string,string>();
 for(let i=0;i<rest.length;i+=2){const key=rest[i]!,value=rest[i+1];if(!names.includes(key)||value===undefined||value.startsWith('--')||options.has(key))throw new ConfigError('音声オプションを確認してください',usage);options.set(key,value);}
 const runtimeFlags=['--python','--python-path','--runtime-dir','--threads','--acceleration-mode'];
 const allowed=action==='configure'||action==='enable'||action==='serve'?['--state-dir',...runtimeFlags,'--transport','--port','--data-dir']:
  action==='add-core'?['--state-dir',...runtimeFlags,'--core-version']:action==='remove-core'?['--state-dir','--core-version']:
  ['disable','status'].includes(action!)?['--state-dir']:['--state-dir','--core-version','--text','--text-file','--speaker','--input','--output'];
 for(const key of options.keys())if(!allowed.includes(key))throw new ConfigError(`${action}では${key}を指定できません。起動設定はconfigure/enable/serveで指定してください`,usage);
 if(options.get('--input')==='-'&&options.get('--text-file')==='-')throw new ConfigError('標準入力は一つの用途に指定してください',usage);
 if(action==='synthesize'&&!options.has('--output'))throw new ConfigError('--output FILE または --output - を指定してください',usage);
 const dir=options.get('--state-dir')??defaultDir;let config=await readVoiceConfig(dir);
 const runtime={...(options.has('--data-dir')?{dataDir:options.get('--data-dir')}:{}),...(options.has('--python')?{python:options.get('--python')} :{}),...(options.has('--runtime-dir')?{runtimeDir:options.get('--runtime-dir')} :{}),...(options.has('--python-path')?{pythonPath:options.get('--python-path')} :{}),...(options.has('--threads')?{threads:Number(options.get('--threads'))}:{}),...(options.has('--acceleration-mode')?{accelerationMode:options.get('--acceleration-mode')}:{}),...(options.has('--transport')?{transport:options.get('--transport')}:{}),...(options.has('--port')?{port:Number(options.get('--port'))}:{})};
 if(action==='enable'||action==='configure'||action==='serve'&&Object.keys(runtime).length){
  const parsed=VoiceConfig.safeParse({...config,...runtime,enabled:action==='enable'?(true):(config?.enabled??false),transport:options.get('--transport')??config?.transport??'ipc'});
  if(!parsed.success)throw new ConfigError('Pythonとランタイムの絶対パス、GPUモード、ポート、スレッド数を確認してください',usage);
  if(process.platform==='linux'&&/\.exe$/i.test(parsed.data.python)&&parsed.data.transport!=='ipc')throw new ConfigError('WSLからWindows COREを使う場合は --transport ipc を指定してください',usage);
  config=parsed.data;await writeVoiceConfig(dir,config);
 }else if(action==='disable'&&config){config={...config,enabled:false};await writeVoiceConfig(dir,config);}
 if(!config&&action!=='status'&&action!=='disable')throw new ConfigError('先にsoda voice configureでCOREの場所を登録してください',usage);
 if(action==='add-core'){
  const version=options.get('--core-version');const value=AdditionalVoiceCore.safeParse({...runtime,id:randomUUID(),version});
  if(!value.success)throw new ConfigError('追加COREのバージョン、Pythonとランタイムの絶対パスを指定してください',usage);
  config=VoiceConfig.parse({...config,additionalCores:[...config!.additionalCores,value.data]});
  await voiceVersions(config);await writeVoiceConfig(dir,config);
 }else if(action==='remove-core'){
  const version=options.get('--core-version');if(!config!.additionalCores.some(c=>c.version===version))throw new ConfigError('追加COREのバージョンを指定してください',usage);
  config={...config!,additionalCores:config!.additionalCores.filter(c=>c.version!==version)};await writeVoiceConfig(dir,config);
 }
 if(action==='serve'){
  if(!config!.enabled)throw new ConfigError('先にsoda voice enable --transport ipcで有効にしてください',usage);
  const host=new VoiceHost(dir,message=>console.error(message));host.start();
  await new Promise<void>(resolve=>{const stop=()=>void host.close().then(resolve);const keep=setInterval(()=>{},60000);const cleanup=()=>{clearInterval(keep);};process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('SIGINT',cleanup);process.once('SIGTERM',cleanup);});return;
 }
 if(['versions','speakers','query','synthesize','call','devices'].includes(action!)){
  if(config!.transport!=='ipc')throw new ConfigError('soda voice enable --transport ipc と soda voice serveでHTTPなし常駐を起動してください',usage);
  let request:Record<string,unknown>={operation:action};
  if(options.has('--input')){const path=options.get('--input')!;const value=JSON.parse(path==='-'?await readVoiceInput():await readFile(path,'utf8'));if(action==='call')request=value;else request.body=value;}
  if(options.has('--core-version'))request.coreVersion=options.get('--core-version');
  if(options.has('--speaker'))request.speaker=Number(options.get('--speaker'));
  if(options.has('--text')&&options.has('--text-file'))throw new ConfigError('テキスト指定は一つにしてください',usage);
  if(options.has('--text'))request.text=options.get('--text');
  if(options.has('--text-file')){const path=options.get('--text-file')!;request.text=path==='-'?await readVoiceInput():await readFile(path,'utf8');}
  if(['synthesize','query'].includes(action!)&&!('speaker' in request))request.speaker=2;
  if(['synthesize','query'].includes(action!)&&!('text' in request)&&!('body' in request))throw new ConfigError('--text、--text-file、またはクエリJSONを指定してください',usage);
  const result=await requestVoiceResident(dir,VoiceCoreCallParams.parse(request));
  if(result.kind==='bytes'){
   const output=options.get('--output');if(!output)throw new ConfigError('音声などのバイナリ出力には --output FILE または --output - を指定してください',usage);
   const bytes=Buffer.from(result.base64,'base64');if(output==='-')process.stdout.write(bytes);else await saveOutput(output,bytes);
  }else{const data=JSON.stringify(result.value)+'\n',output=options.get('--output');if(output&&output!=='-')await saveOutput(output,data);else process.stdout.write(data);}
  return;
 }
 console.log(JSON.stringify({enabled:config?.enabled??false,transport:config?.transport??'ipc',origin:config?.transport==='http'?`http://127.0.0.1:${config.port}`:null,managedBy:'soda',configured:!!config,additionalCores:config?.additionalCores.map(c=>({version:c.version,accelerationMode:c.accelerationMode}))??[]}));
}
