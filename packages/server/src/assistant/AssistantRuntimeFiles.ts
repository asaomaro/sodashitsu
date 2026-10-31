import {constants,type BigIntStats} from "node:fs";
import {open,lstat,opendir} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
export class RuntimeIntegrityError extends Error{}
export type RuntimeGuard=()=>void;
export const sameRuntimeFile=(a:BigIntStats,b:BigIntStats)=>a.dev===b.dev&&a.ino===b.ino;
export function runtimeRelativePath(path:unknown):path is string{return typeof path==="string"&&path.length>0&&path.length<=2048&&!/[\\:\x00-\x1f\x7f]/.test(path)&&path.split("/").length<=64&&path.split("/").every(part=>!!part&&part!=="."&&part!==".."&&!/[. ]$/.test(part));}
export async function boundedRuntimeJson(path:string,limit:number,guard:RuntimeGuard):Promise<unknown>{
 guard();const before=await lstat(path,{bigint:true});guard();
 if(!before.isFile()||before.nlink!==1n||before.isSymbolicLink()||before.size<1n||before.size>BigInt(limit))throw new RuntimeIntegrityError("Invalid runtime inventory file");
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  guard();const opened=await file.stat({bigint:true});guard();if(!sameRuntimeFile(before,opened)||!opened.isFile()||opened.nlink!==1n||opened.size!==before.size)throw new RuntimeIntegrityError("Runtime inventory changed");
  const bytes=Buffer.alloc(Number(before.size)+1);let used=0;
  while(used<bytes.length){guard();const result=await file.read(bytes,used,bytes.length-used,null);guard();if(!result.bytesRead)break;used+=result.bytesRead;}
  const after=await file.stat({bigint:true});guard();
  if(after.nlink!==1n||BigInt(used)!==before.size||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)throw new RuntimeIntegrityError("Runtime inventory changed");
  try{return JSON.parse(bytes.subarray(0,used).toString("utf8"));}catch{throw new RuntimeIntegrityError("Invalid runtime inventory JSON");}
 }finally{await file.close();guard();}
}
export async function runtimeFileDigest(path:string,expected:BigIntStats,guard:RuntimeGuard):Promise<string>{
 guard();const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  guard();const before=await file.stat({bigint:true});guard();
  if(!before.isFile()||before.nlink!==1n||!sameRuntimeFile(before,expected)||before.size!==expected.size||before.size>512n*1024n*1024n)throw new RuntimeIntegrityError("Runtime file changed");
  const hash=createHash("sha256"),buffer=Buffer.alloc(65536);let used=0n;
  while(used<before.size){guard();const result=await file.read(buffer,0,Math.min(buffer.length,Number(before.size-used)),Number(used));guard();if(!result.bytesRead)throw new RuntimeIntegrityError("Runtime file truncated");hash.update(buffer.subarray(0,result.bytesRead));used+=BigInt(result.bytesRead);}
  const after=await file.stat({bigint:true});guard();
  if(after.nlink!==1n||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)throw new RuntimeIntegrityError("Runtime file changed");
  return hash.digest("hex");
 }finally{await file.close();guard();}
}
export async function runtimeChildren(path:string,limit:number,guard:RuntimeGuard):Promise<string[]>{
 guard();const directory=await opendir(path,{bufferSize:16}),names:string[]=[];
 try{for await(const entry of directory){guard();if(names.length>=limit)throw new RuntimeIntegrityError("Runtime directory entry limit exceeded");names.push(entry.name);}}
 finally{try{await directory.close();}catch(error){if((error as NodeJS.ErrnoException).code!=="ERR_DIR_CLOSED")throw error;}}
 guard();return names;
}
export async function runtimeTree(path:string,guard:RuntimeGuard):Promise<Map<string,BigIntStats>>{
 const found=new Map<string,BigIntStats>();
 async function walk(directory:string,prefix:string){
  for(const name of await runtimeChildren(directory,30000-found.size,guard)){
   guard();const rel=prefix+name;if(!runtimeRelativePath(rel)||found.size>=30000)throw new RuntimeIntegrityError("Runtime tree limit exceeded");
   const info=await lstat(join(directory,name),{bigint:true});guard();found.set(rel,info);
   if(info.isDirectory()&&!info.isSymbolicLink())await walk(join(directory,name),rel+"/");
  }
 }
 await walk(path,"");return found;
}
