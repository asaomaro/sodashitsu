import {lstat,mkdir,copyFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {constants,type BigIntStats} from 'node:fs';
import type {AssistantRuntimeRoot} from './AssistantRuntimeCache.js';
import {boundedRuntimeJson,runtimeRelativePath,runtimeTree,runtimeFileDigest,sameRuntimeFile} from './AssistantRuntimeFiles.js';
interface Entry{path:string;bytes:number;sha256:string}
/** Copy bundled JS/assets to a private immutable app folder, never inside a signed runtime. */
export async function prepareAssistantHostApp(root:AssistantRuntimeRoot,guard:()=>void,source=fileURLToPath(new URL('../../assets/assistant-host/',import.meta.url))):Promise<string>{
 guard();await root.assert();guard();const rootInfo=await lstat(root.path,{bigint:true});guard();
 const manifest=await boundedRuntimeJson(join(source,'host-manifest.json'),65536,guard) as {version:number;entries:Entry[]};
 if(manifest.version!==1||!Array.isArray(manifest.entries)||!manifest.entries.length||manifest.entries.length>64)throw Error('アシスタントの素材一覧が不正です');
 const names=new Set<string>();let total=0;
 for(const entry of manifest.entries){if(!entry||!runtimeRelativePath(entry.path)||names.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>16*1024*1024||(total+=entry.bytes)>32*1024*1024||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('アシスタントの素材が不正です');names.add(entry.path.toLowerCase());}
 if(!names.has('package.json')||!names.has('dist/main.mjs')||!names.has('dist/preload.cjs'))throw Error('アシスタントの起動素材が不足しています');
 const bytes=Buffer.from(JSON.stringify(manifest));
 const stamp=createHash('sha256').update(bytes).digest('hex'),directory=join(root.path,'app-'+stamp);
 const ownedRoot=async()=>{guard();await root.assert();guard();const current=await lstat(root.path,{bigint:true});guard();if(!sameRuntimeFile(rootInfo,current)||current.isSymbolicLink())throw Error('素材の準備先が変わりました');};
 const verify=async(path:string)=>{
  guard();const before=await lstat(path,{bigint:true});guard();if(!before.isDirectory()||before.isSymbolicLink())throw Error('アシスタントの配置先が不正です');
  const tree=await runtimeTree(path,guard),expected=new Set<string>();
  for(const entry of manifest.entries){expected.add(entry.path);const parts=entry.path.split('/');while(parts.length>1){parts.pop();expected.add(parts.join('/'));}}
  if(tree.size!==expected.size||[...tree.keys()].some(name=>!expected.has(name)))throw Error('アシスタントの配置内容が一致しません');
  for(const entry of manifest.entries){const info=tree.get(entry.path);if(!info?.isFile()||info.isSymbolicLink()||info.nlink!==1n||info.size!==BigInt(entry.bytes)||await runtimeFileDigest(join(path,...entry.path.split('/')),info,guard)!==entry.sha256)throw Error('アシスタントの素材が変更されています');}
  const after=await lstat(path,{bigint:true});guard();if(!sameRuntimeFile(before,after)||after.isSymbolicLink())throw Error('アシスタントの配置先が変わりました');return before;
 };
 try{await ownedRoot();const verified=await verify(directory);await ownedRoot();const after=await lstat(directory,{bigint:true});guard();if(!sameRuntimeFile(verified,after)||after.isSymbolicLink())throw Error('アシスタントの配置先が変わりました');return directory;}
 catch(error){guard();if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const stage=join(root.path,'app-stage-'+randomUUID());let created=false,published=false,stageInfo:BigIntStats|undefined;
 try{
  await ownedRoot();await mkdir(stage,{mode:0o700});created=true;stageInfo=await lstat(stage,{bigint:true});guard();
  for(const entry of manifest.entries){
   await ownedRoot();const info=await lstat(stage,{bigint:true});guard();if(!sameRuntimeFile(stageInfo,info)||info.isSymbolicLink())throw Error('素材の準備先が変わりました');
   const target=join(stage,...entry.path.split('/'));const parent=entry.path.split('/');parent.pop();if(parent.length)await mkdir(join(stage,...parent),{recursive:true,mode:0o700});guard();
   const input=join(source,...entry.path.split('/')),inputInfo=await lstat(input,{bigint:true});guard();if(!inputInfo.isFile()||inputInfo.isSymbolicLink()||inputInfo.size!==BigInt(entry.bytes)||await runtimeFileDigest(input,inputInfo,guard)!==entry.sha256)throw Error('同梱素材を確認できません');
   await copyFile(input,target,constants.COPYFILE_EXCL);guard();
  }
  const verified=await verify(stage);await ownedRoot();const info=await lstat(stage,{bigint:true});guard();if(!sameRuntimeFile(stageInfo,info)||!sameRuntimeFile(verified,info)||info.isSymbolicLink())throw Error('素材の準備先が変わりました');
  try{await rename(stage,directory);published=true;}catch(error){if(!['EEXIST','ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code??''))throw error;await verify(directory);}
  guard();await ownedRoot();await verify(directory);return directory;
 }finally{
  if(created&&!published){const nowRoot=await lstat(root.path,{bigint:true}),info=await lstat(stage,{bigint:true});if(!stageInfo||!sameRuntimeFile(rootInfo,nowRoot)||!sameRuntimeFile(stageInfo,info)||info.isSymbolicLink()||nowRoot.isSymbolicLink())throw Error('素材の後始末の所有を確認できません');await rm(stage,{recursive:true});}
 }
}
