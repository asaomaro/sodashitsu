import {desktopOwnedChild} from './DesktopOwnedChild.node.js';
import {desktopWindowsPowerShell} from './DesktopWindowsPowerShell.node.js';
import {readFile,lstat,readdir,unlink,rmdir,open} from 'node:fs/promises';
import {constants,type BigIntStats} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,win32} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
export type DesktopNativeRole='copy'|'audio'|'selection';
const Host=z.object({binary:z.string().max(4096),directory:z.string().max(4096),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const Module=Host.extend({hostSha256:z.string().regex(/^[a-f0-9]{64}$/)});
const markers={copy:'soda-native-copy-preflight-v1',audio:'soda-audio-pipe-preflight-v1',selection:'soda-explorer-selection-preflight-v1'};
const stamp=(info:BigIntStats)=>`${info.dev}:${info.ino}:${info.birthtimeNs}`;
async function digest(path:string,expected:BigIntStats){
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await file.stat({bigint:true});
  if(!before.isFile()||before.nlink!==1n||before.size<1n||before.size>8n*1024n*1024n||stamp(before)!==stamp(expected))throw Error('補助プログラムが変更されています');
  const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;
  while(offset<Number(before.size)){const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);if(bytesRead===0)throw Error('補助プログラムの読み取りが中断しました');hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}
  const after=await file.stat({bigint:true});
  if(stamp(after)!==stamp(before)||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs||after.nlink!==1n)throw Error('補助プログラムが変更されています');
  return hash.digest('hex');
 }finally{await file.close();}
}
/** Only SDK-selected roles; no viewer-supplied executable, DLL, argument or compiler source. */
export class DesktopNativeRoleBinary {
 private closing:Promise<void>|undefined;private pending:Promise<void>|undefined;private stopped=false;private ready=false;
 private artifact:{directory:string;module:string;binary:string;directoryStamp:string;moduleStamp:string;args:readonly string[]}|undefined;
 constructor(private readonly role:DesktopNativeRole,private readonly os:NodeJS.Platform=process.platform,private readonly env:NodeJS.ProcessEnv=process.env){if(!Object.hasOwn(markers,role))throw Error('Unknown internal native role');}
 private live(){if(this.stopped)throw Error('補助プログラムは終了しました');}
 private async translate(path:string,windows:boolean){this.live();if(this.os==='win32')return path;const text=await desktopOwnedChild('/usr/bin/wslpath',[windows?'-w':'-u',path],'',{timeout:3000,limit:8192});this.live();const value=text.trim();if(!value||/["\x00-\x1f]/.test(value))throw Error('Windowsの実行パスを確認できません');return value;}
 prepare():Promise<void>{if(this.stopped)return Promise.reject(Error('補助プログラムは終了しました'));return this.pending??=this.build();}
 private async build(){
  this.live();if(this.os!=='win32'&&!this.env.WSL_DISTRO_NAME)throw Error('Windowsの補助プログラムをこのPCで起動してください');
  const policy=await readFile(new URL('../../../../scripts/remote-desktop/EndpointAclPolicy.ps1',import.meta.url),'utf8');this.live();const script=policy+'\n'+await readFile(new URL('../../../../scripts/remote-desktop/build-native-role.ps1',import.meta.url),'utf8');this.live();
  const source=await this.translate(fileURLToPath(new URL('../../../../scripts/remote-desktop/',import.meta.url)),true),program=this.os==='win32'?desktopWindowsPowerShell(this.env.SystemRoot):'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  const args=['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
  const invoke=async(operation:'host'|'module',extra:object={})=>{this.live();return JSON.parse((await desktopOwnedChild(program,args,JSON.stringify({operation,role:this.role,source,...extra}),{timeout:55000,limit:16384})).replace(/^\uFEFF/,''));};
  const host=Host.parse(await invoke('host'));this.live();
  if(!/^[a-z]:\\/i.test(host.directory)||!/\\Sodashitsu-Native-Host\\[a-f0-9]{32}\\host-[a-f0-9]{32}$/i.test(host.directory)||host.binary!==win32.join(host.directory,'soda-native-host.exe'))throw Error('共通補助プログラムの準備結果が不正です');
  const directory=await this.translate(host.directory,false),binary=join(directory,'soda-native-host.exe');
  const [rootInfo,hostInfo]=await Promise.all([lstat(directory,{bigint:true}),lstat(binary,{bigint:true})]);this.live();
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||!hostInfo.isFile()||hostInfo.isSymbolicLink()||hostInfo.nlink!==1n||hostInfo.size<1n||hostInfo.size>8n*1024n*1024n||await digest(binary,hostInfo)!==host.sha256)throw Error('共通補助プログラムを確認できません');this.live();
  const built=Module.parse(await invoke('module',{expectedHost:win32.basename(host.directory).slice(5),expectedHash:host.sha256}));
  if(built.binary!==host.binary||built.hostSha256!==host.sha256||win32.dirname(built.directory)!==host.directory||!/^role-[a-f0-9]{32}$/.test(win32.basename(built.directory)))throw Error('役割モジュールの準備結果が不正です');
  // The mounted root is already known before the build; cleanup never starts a path-conversion child after OFF.
  const roleDirectory=join(directory,win32.basename(built.directory)),module=join(roleDirectory,this.role+'.dll');
  const [d,m]=await Promise.all([lstat(roleDirectory,{bigint:true}),lstat(module,{bigint:true})]);
  if(!d.isDirectory()||d.isSymbolicLink()||!m.isFile()||m.isSymbolicLink()||m.nlink!==1n||m.size<1n||m.size>8n*1024n*1024n)throw Error('役割モジュールを確認できません');
  const prefix=['--role',this.role,'--module',win32.basename(built.directory).slice(5),'--sha256',built.sha256];
  this.artifact={directory:roleDirectory,module,binary,directoryStamp:stamp(d),moduleStamp:stamp(m),args:Object.freeze(prefix)};
  if(this.stopped)return;
  if(await digest(module,m)!==built.sha256)throw Error('役割モジュールが変更されています');this.live();
  const result=await desktopOwnedChild(binary,[...prefix,'--preflight'],'',{timeout:15000,limit:128});this.live();if(result.trim()!==markers[this.role])throw Error('補助プログラムの事前起動を確認できません');this.ready=true;
 }
 get executable():string{if(this.stopped||!this.ready||!this.artifact)throw Error('補助プログラムを準備してください');return this.artifact.binary;}
 get arguments():readonly string[]{if(this.stopped||!this.ready||!this.artifact)throw Error('補助プログラムを準備してください');return this.artifact.args;}
 async retirePreparation():Promise<void>{this.stopped=true;await this.pending?.catch(()=>{});}
 /** The caller first retires every owned role process; the shared immutable host stays cached. */
 close():Promise<void>{return this.closing??=this.cleanup();}
 private async cleanup():Promise<void>{
  await this.retirePreparation();const a=this.artifact;if(!a)return;
  const [d,m]=await Promise.all([lstat(a.directory,{bigint:true}),lstat(a.module,{bigint:true})]);
  if(!d.isDirectory()||d.isSymbolicLink()||!m.isFile()||m.isSymbolicLink()||m.nlink!==1n||stamp(d)!==a.directoryStamp||stamp(m)!==a.moduleStamp||(await readdir(a.directory)).some(name=>name!==this.role+'.dll'))throw Error('役割の生成物が変更されたため削除を中止しました');
  await unlink(a.module);await rmdir(a.directory);this.artifact=undefined;
 }
}
