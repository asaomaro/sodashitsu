import {mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {assistantLaunchArgs,RpcError,type SummarySettings} from '@sodashitsu/protocol';
import {openVerified,readRange} from '../agent/safeFile.js';
import {writeFileAtomic} from '../persist/atomicFile.js';

async function authFile(path:string):Promise<string|null>{
 const opened=await openVerified(path).catch(()=>null);if(!opened)return null;
 try{if(opened.st.size>512*1024)throw new Error('Credential file too large');const bytes=await readRange(opened.fd,0,opened.st.size);if(!bytes.equals(await readRange(opened.fd,0,bytes.length)))throw new Error('Credential file changed');return bytes.toString('utf8');}finally{await opened.fd.close();}
}
/** Fresh working/config/data roots; copy authentication only, never executable config. */
export async function prepareGrokCursorSummary(kind:'grok'|'cursor',dir:string,prompt:string,settings:SummarySettings,env:NodeJS.ProcessEnv){
 if(kind==='cursor')throw new RpcError('unsupported_agent_kind','Cursor CLIの要約は、組織・プラグインの起動フックを無効化する正式な経路を確認できるまで利用できません');
 const source={...env},home=homedir(),config=join(dir,'config'),data=join(dir,'data');
 for(const key of Object.keys(env))if(key.startsWith('GROK_')||key.startsWith('CURSOR_')||key==='AGENT_CLI_CREDENTIAL_STORE')delete env[key];
 for(const key of ['GROK_API_KEY','GROK_AUTH_TOKEN','GROK_DEPLOYMENT_KEY'])if(source[key])env[key]=source[key];
 // These roots also exclude user Claude-compatible hooks/config and auto-loaded plugins.
 env.HOME=dir;env.USERPROFILE=dir;env.XDG_CONFIG_HOME=config;env.XDG_DATA_HOME=data;env.APPDATA=join(dir,'appdata');env.LOCALAPPDATA=join(dir,'localappdata');env.NO_OPEN_BROWSER='1';
 await mkdir(config,{recursive:true,mode:0o700});await mkdir(data,{recursive:true,mode:0o700});
 const launch=assistantLaunchArgs(kind,{model:settings.model,effort:settings.effort??''});
 {
  const root=join(dir,'grok');await mkdir(root,{mode:0o700});
  // Tighten user/plugin hook dispatch without bypassing administrator-enforced policy.
  await writeFileAtomic(join(root,'requirements.toml'),'allow_managed_hooks_only = true\n');
  const credentials=await authFile(source.GROK_AUTH_PATH||join(source.GROK_HOME||join(home,'.grok'),'auth.json'));
  if(credentials){const parsed=JSON.parse(credentials);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid authentication store');await writeFileAtomic(join(root,'auth.json'),JSON.stringify(parsed));}
  env.GROK_HOME=root;env.GROK_AUTH_PATH=join(root,'auth.json');
  const promptFile=join(dir,'prompt.txt');await writeFileAtomic(promptFile,prompt);
  // Empty --tools means None in this CLI. Use one known tool and remove that
  // exact tool with the higher-precedence denylist instead; MCP is denied separately.
  return {executable:'grok',args:['--prompt-file',promptFile,'--output-format','json','--tools','read_file','--disallowed-tools','read_file,Agent,search_tool,use_tool','--deny','MCPTool','--no-subagents','--disable-web-search','--permission-mode','dontAsk','--max-turns','1',...launch]};
 }
}

export function parseGrokCursorSummary(kind:'grok'|'cursor',stdout:string):string{
 let value:any;try{value=JSON.parse(stdout);}catch{throw new RpcError('agent_prompt_failed','要約の応答形式が不正です');}
 const text=kind==='grok'&&value?.stopReason==='end_turn'&&!value.error&&value.is_error!==true?value.text:kind==='cursor'&&value?.type==='result'&&value.subtype==='success'&&value.is_error===false?value.result:null;
 if(typeof text!=='string'||!text.trim())throw new RpcError('agent_prompt_failed','要約を生成できません');return text;
}
