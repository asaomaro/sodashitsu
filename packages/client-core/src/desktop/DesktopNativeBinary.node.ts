import {desktopOwnedChild} from "./DesktopOwnedChild.node.js";
import {desktopWindowsPowerShell} from "./DesktopWindowsPowerShell.node.js";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {lstat,unlink,rmdir} from "node:fs/promises";
import {z} from "zod";
const Build=z.object({binary:z.string().max(4096),directory:z.string().max(4096)}).strict();
/** Only the fixed COPY executable. No client-selected command, source, path or options. */
export class DesktopNativeBinary {
 private promise:Promise<void>|undefined;private stopped=false;private ready=false;private artifact:{directory:string;binary:string;directoryStamp:string;binaryStamp:string}|undefined;
 constructor(private os:NodeJS.Platform=process.platform,private env:NodeJS.ProcessEnv=process.env){}
 private async translate(path:string,windows:boolean){if(this.os==="win32")return path;const text=await desktopOwnedChild("/usr/bin/wslpath",[windows?"-w":"-u",path],"",{timeout:3000,limit:8192});const value=text.trim();if(!value||/[\r\n\0]/.test(value))throw Error("Windowsの実行パスを確認できません");return value;}
 prepare(){if(this.stopped)return Promise.reject(Error("補助プログラムは終了しました"));return this.promise??=this.build();}
 private async build(){
  if(this.os!=="win32"&&!this.env.WSL_DISTRO_NAME)throw Error("Windowsの補助プログラムをこのPCで起動してください");
  const program=this.os==="win32"?desktopWindowsPowerShell(this.env.SystemRoot):"/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",script=await this.translate(fileURLToPath(new URL("../../../../scripts/remote-desktop/build-native-drag.ps1",import.meta.url)),true);
  const built=Build.parse(JSON.parse((await desktopOwnedChild(program,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script],"",{timeout:30000,limit:16384})).replace(/^\uFEFF/,"")));
  if(!/^[a-z]:\\/i.test(built.directory)||! /\\soda-native-copy-[a-f0-9]{32}$/i.test(built.directory)||built.binary!==built.directory+"\\native-copy.exe")throw Error("補助プログラムの準備結果が不正です");
  const directory=await this.translate(built.directory,false),binary=join(directory,"native-copy.exe"),[d,b]=await Promise.all([lstat(directory,{bigint:true}),lstat(binary,{bigint:true})]);
  if(!d.isDirectory()||d.isSymbolicLink()||!b.isFile()||b.isSymbolicLink()||b.nlink!==1n)throw Error("補助プログラムを確認できません");const stamp=(s:typeof d)=>`${s.dev}:${s.ino}:${s.birthtimeNs}`;
  this.artifact={directory,binary,directoryStamp:stamp(d),binaryStamp:stamp(b)};
  const preflight=await desktopOwnedChild(binary,["--preflight"],"",{timeout:15000,limit:128});if(preflight.trim()!=="soda-native-copy-preflight-v1")throw Error("補助プログラムの事前起動を確認できません");this.ready=true;
 }
 get executable(){if(this.stopped||!this.ready||!this.artifact)throw Error("補助プログラムを準備してください");return this.artifact.binary;}
 /** Caller must first wait all owned native process close events. */
 async close(){
  this.stopped=true;await this.promise?.catch(()=>{});const a=this.artifact;this.artifact=undefined;if(!a)return;
  const [d,b]=await Promise.all([lstat(a.directory,{bigint:true}),lstat(a.binary,{bigint:true})]);const stamp=(s:typeof d)=>`${s.dev}:${s.ino}:${s.birthtimeNs}`;
  if(!d.isDirectory()||d.isSymbolicLink()||!b.isFile()||b.isSymbolicLink()||b.nlink!==1n||stamp(d)!==a.directoryStamp||stamp(b)!==a.binaryStamp)throw Error("生成物が変更されたため削除を中止しました");
  await unlink(a.binary);await rmdir(a.directory);
 }
}
