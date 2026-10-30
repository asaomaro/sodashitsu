import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { extractAssistantZip } from "./AssistantZip.js";

export const ASSISTANT_PACKAGE_FILE = "assistant-package.json";
const release = z.object({id:z.uuid(), command:z.tuple([z.string().min(1).max(2048)]), sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const schema = z.object({version:z.literal(1), current:release, previous:release.nullable()}).strict();
export type AssistantPackage = z.infer<typeof schema>;
const EXE = "Sodashitsu Assistant.exe";

export async function readAssistantPackage(dir:string):Promise<AssistantPackage|null> {
  let bytes:Buffer;
  try { const file=await open(join(dir,ASSISTANT_PACKAGE_FILE),constants.O_RDONLY | (constants.O_NOFOLLOW??0) | (constants.O_NONBLOCK??0));
    try { if (!(await file.stat()).isFile()) throw Error("アシスタントの配布設定を確認してください");
      const buffer=Buffer.alloc(16385);let used=0;
      while(used<buffer.length) {const result=await file.read(buffer,used,buffer.length-used,null);if(!result.bytesRead)break;used+=result.bytesRead;}
      if(used>16384) throw Error("アシスタントの配布設定が大きすぎます");bytes=buffer.subarray(0,used);
    }
    finally {await file.close();}
  } catch(error) {if((error as NodeJS.ErrnoException).code==="ENOENT") return null; throw error;}
  const value=schema.parse(JSON.parse(bytes.toString("utf8")));
  for (const item of [value.current,value.previous]) if(item && (!isAbsolute(item.command[0]) || /[\x00-\x1f\x7f]/.test(item.command[0]))) throw Error("配布版のパスを確認してください");
  return value;
}

async function save(dir:string,value:AssistantPackage):Promise<void> {
  await mkdir(dir,{recursive:true,mode:0o700});
  const path=join(dir,`.assistant-package-${randomUUID()}.tmp`);
  try {await writeFile(path,JSON.stringify(schema.parse(value))+"\n",{flag:"wx",mode:0o600});await rename(path,join(dir,ASSISTANT_PACKAGE_FILE));}
  finally {await unlink(path).catch(()=>{});}
}

/** Explicitly selected, already extracted Windows package. Never executes its contents.
 * New installations are immutable directories: an update cannot overwrite a running app.
 * The state pointer is committed only after every file has been copied and verified.
 */
async function locked<T>(dir:string,run:()=>Promise<T>):Promise<T> {
  await mkdir(dir,{recursive:true,mode:0o700});
  const path=join(dir,"assistant-package.lock");
  const lock=await open(path,"wx",0o600).catch(error=>{if((error as NodeJS.ErrnoException).code==="EEXIST") throw Error("配布操作が進行中です。終了後に再試行してください");throw error;});
  try {return await run();} finally {await lock.close();await unlink(path);}
}
export function installAssistantPackage(dir:string,source:string,destination:string):Promise<AssistantPackage> {
  return locked(dir,async()=>{
    const stat=await lstat(source);
    if(stat.isSymbolicLink()) throw Error("配布元にリンクは指定できません");
    if(stat.isDirectory()) return install(dir,source,destination);
    if(!stat.isFile() || !source.toLowerCase().endsWith(".zip")) throw Error("WindowsアシスタントのZIPか展開済みフォルダーを指定してください");
    const staging=await mkdtemp(join(tmpdir(),"soda-assistant-package-"));
    try {await extractAssistantZip(source,staging);return await install(dir,staging,destination);}
    finally {await rm(staging,{recursive:true,force:true});}
  });
}
async function install(dir:string,source:string,destination:string):Promise<AssistantPackage> {
  source=await realpath(source);await mkdir(resolve(destination),{recursive:true});destination=await realpath(destination);
  const inside=relative(source,destination);
  if(inside==="" || (!inside.startsWith(`..${sep}`) && inside!==".." && !isAbsolute(inside))) throw Error("配置先は配布元フォルダーの外を指定してください");
  const before=await readAssistantPackage(dir);
  const id=randomUUID(), target=join(destination,id);
  await mkdir(destination,{recursive:true});await mkdir(target);
  let published=false;
  try {
    const sha256=await digestPackage(source,target);
    const value:AssistantPackage={version:1,current:{id,command:[join(target,EXE)],sha256},previous:before?.current??null};
    if(JSON.stringify(await readAssistantPackage(dir))!==JSON.stringify(before)) throw Error("別の配置操作が完了しました。状態を確認してやり直してください");
    await save(dir,value);published=true;return value;
  } finally {if(!published) await rm(target,{recursive:true,force:true});}
}

async function digestPackage(source:string,target?:string):Promise<string> {
  for(const path of [source,join(source,"resources")]) {const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()) throw Error("配布元は通常のフォルダーを指定してください");}
  for(const path of [join(source,EXE),join(source,"resources","app.asar")]) {const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0) throw Error("Windowsアシスタントの展開済み配布フォルダーを指定してください");}
  let count=0,total=0;
  const hash=createHash("sha256");
  async function copy(from:string,to:string|undefined,prefix:string):Promise<void> {
    const names=(await readdir(from)).sort();
    for(const name of names) {
      if(++count>10000 || /[\x00-\x1f\x7f]/.test(name)) throw Error("配布ファイルの件数・名前を確認してください");
      const input=join(from,name),output=to?join(to,name):undefined,stat=await lstat(input),key=prefix+name;
      if(stat.isSymbolicLink()) throw Error("配布物にリンクは含められません");
      if(stat.isDirectory()) {hash.update(JSON.stringify([key+"/"])+"\n");if(output) await mkdir(output);await copy(input,output,key+"/");continue;}
      if(!stat.isFile() || (total+=stat.size)>1024*1024*1024) throw Error("配布物は1GiB以内の通常ファイルにしてください");
      const file=await open(input,constants.O_RDONLY | (constants.O_NOFOLLOW??0) | (constants.O_NONBLOCK??0));
      try {
        const current=await file.stat();
        const same=(value:typeof stat)=>value.isFile() && value.dev===stat.dev && value.ino===stat.ino && value.size===stat.size && value.mtimeMs===stat.mtimeMs && value.ctimeMs===stat.ctimeMs;
        if(!same(current)) throw Error("配布元がコピー中に変更されました");
        const out=output?await open(output,"wx",stat.mode & 0o777):null;
        try {
          hash.update(JSON.stringify([key,stat.size])+"\n");
          const buffer=Buffer.alloc(65536);let used=0;
          while(true) {
            const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,stat.size-used+1),null);
            if(!bytesRead) break;
            used+=bytesRead;if(used>stat.size) throw Error("配布元がコピー中に変更されました");
            const chunk=buffer.subarray(0,bytesRead);hash.update(chunk);
            let written=0;while(out && written<bytesRead) {const result=await out.write(chunk,written,bytesRead-written);if(!result.bytesWritten) throw Error("配布ファイルを書き込めません");written+=result.bytesWritten;}
          }
          if(used!==stat.size || !same(await file.stat())) throw Error("配布元がコピー中に変更されました");
        } finally {await out?.close();}
      } finally {await file.close();}
    }
  }
  await copy(source,target,"");
  return hash.digest("hex");
}

export function rollbackAssistantPackage(dir:string):Promise<AssistantPackage> {
  return locked(dir,()=>rollback(dir));
}
async function rollback(dir:string):Promise<AssistantPackage> {
  const before=await readAssistantPackage(dir);
  if(!before?.previous) throw Error("切り戻せる前版はありません");
  const value:AssistantPackage={version:1,current:before.previous,previous:before.current};
  if(await digestPackage(join(value.current.command[0],".."))!==value.current.sha256) throw Error("前版の配布ファイルが変更されています");
  await save(dir,value);return value;
}
