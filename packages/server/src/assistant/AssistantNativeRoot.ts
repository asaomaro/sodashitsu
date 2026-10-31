import type {BigIntStats} from 'node:fs';
import {homedir} from 'node:os';
import {lstat,mkdir,realpath,readFile} from 'node:fs/promises';
import {join,isAbsolute,win32} from 'node:path';
import {desktopOwnedChild} from '@sodashitsu/client-core/desktop/DesktopOwnedChild.node';
import type {AssistantRuntimeRoot} from './AssistantRuntimeCache.js';
import type {RuntimePlatform,RuntimeArchitecture} from './AssistantRuntimeCatalog.js';
import {desktopWindowsPowerShell} from '@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node';
import {sameRuntimeFile} from './AssistantRuntimeFiles.js';
export interface AssistantNativeRoot{root:AssistantRuntimeRoot;platform:RuntimePlatform;arch:RuntimeArchitecture;nativePath(path:string):Promise<string>}
interface Dependencies{platform?:NodeJS.Platform;arch?:string;env?:NodeJS.ProcessEnv;home?:()=>string;run?:typeof desktopOwnedChild}
interface Options{signal:AbortSignal;expires:number;check():void}
/** Loaded only after explicit enable. All transient discovery children retire before return. */
export async function assistantNativeRoot(options:Options,deps:Dependencies={}):Promise<AssistantNativeRoot>{
 const os=deps.platform??process.platform,cpu=deps.arch??process.arch,env=deps.env??process.env;
 const live=()=>{options.signal.throwIfAborted();options.check();if(performance.now()>=options.expires)throw Error('アシスタントの準備が時間切れです');options.signal.throwIfAborted();};
 const run=async(command:string,args:string[],input='')=>{live();const value=await(deps.run??desktopOwnedChild)(command,args,input,{signal:options.signal,timeout:Math.max(1,Math.min(10000,options.expires-performance.now())),limit:16384});live();return value.trim();};
 live();const windows=os==='win32'||!!env.WSL_DISTRO_NAME;
 if(windows){
  const policy=await readFile(new URL('../../../../scripts/remote-desktop/EndpointAclPolicy.ps1',import.meta.url),'utf8');live();const script=policy+'\n'+await readFile(new URL('../../assets/assistant-runtime-root.ps1',import.meta.url),'utf8');live();
  const args=['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
  const discover=async(operation:'ensure'|'check')=>{
   const raw=JSON.parse((await run(os==='win32'?desktopWindowsPowerShell(env.SystemRoot):'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',args,JSON.stringify({operation}))).replace(/^\uFEFF/,'')) as {path:string;arch:string};
   if(!raw||typeof raw.path!=='string'||!/^[A-Za-z]:\\/.test(raw.path)||/[\x00-\x1f\x7f]/.test(raw.path)||!['x64','arm64'].includes(raw.arch))throw Error('Windowsの準備先を確認できません');return raw;
  };
  const first=await discover('ensure');
  const translate=async(path:string)=>os==='win32'?path:await run('/usr/bin/wslpath',['-u',path]);
  const path=await translate(first.path);if(!isAbsolute(path))throw Error('準備先が不正です');
  const stamp=await lstat(path,{bigint:true});live();
  const assert=async()=>{const current=await discover('check');if(current.path!==first.path||current.arch!==first.arch)throw Error('Windowsの準備先が変わりました');const info=await lstat(path,{bigint:true});live();if(!sameRuntimeFile(stamp,info)||!info.isDirectory()||info.isSymbolicLink())throw Error('準備先の所有を確認できません');};
  await assert();return{root:{path,assert},platform:'win32',arch:first.arch as RuntimeArchitecture,nativePath:async path=>{
   live();if(os==='win32')return path;const native=await run('/usr/bin/wslpath',['-w',path]);if(!win32.isAbsolute(native)||/[\x00-\x1f\x7f]/.test(native))throw Error('Windowsパスを確認できません');return native;
  }};
 }
 if(!['linux','darwin'].includes(os)||!['x64','arm64'].includes(cpu))throw Error('このOS/CPUには対応していません');
 live();const home=await realpath((deps.home??homedir)());live();const paths=[home,join(home,'.cache'),join(home,'.cache','sodashitsu'),join(home,'.cache','sodashitsu','assistant-host')];
 const ancestors:string[]=[];let parent=home;while(parent!=='/'){parent=join(parent,'..');ancestors.push(parent);}
 const ancestorStamps:BigIntStats[]=[];for(const path of ancestors){const info=await lstat(path,{bigint:true});live();if(!info.isDirectory()||info.isSymbolicLink()||![0n,BigInt(process.getuid!())].includes(info.uid)||((info.mode&0o022n)!==0n&&(info.mode&0o1000n)===0n))throw Error('準備先の親フォルダーが安全ではありません');ancestorStamps.push(info);}
 const stamps:BigIntStats[]=[];
 for(let i=0;i<paths.length;i++){
  const path=paths[i]!;live();if(i)await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});const info=await lstat(path,{bigint:true});live();
  if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==BigInt(process.getuid!())||(info.mode&0o022n)!==0n)throw Error('アシスタントの準備先が利用者専用ではありません');stamps.push(info);
 }
 const assert=async()=>{for(let i=0;i<ancestors.length;i++){live();const info=await lstat(ancestors[i]!,{bigint:true});live();const before=ancestorStamps[i]!;if(!sameRuntimeFile(before,info)||info.mode!==before.mode||info.uid!==before.uid||info.isSymbolicLink())throw Error('準備先の親フォルダーが変わりました');}for(let i=0;i<paths.length;i++){live();const info=await lstat(paths[i]!,{bigint:true});live();if(!sameRuntimeFile(stamps[i]!,info)||info.isSymbolicLink()||info.uid!==BigInt(process.getuid!())||(info.mode&0o022n)!==0n)throw Error('アシスタントの準備先が変わりました');}};
 await assert();return{root:{path:paths.at(-1)!,assert},platform:os as RuntimePlatform,arch:cpu as RuntimeArchitecture,nativePath:async path=>{live();return path;}};
}
