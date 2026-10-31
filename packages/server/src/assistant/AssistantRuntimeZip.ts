import {constants} from "node:fs";
import {open,lstat,readdir,mkdir,symlink,realpath,type FileHandle} from "node:fs/promises";
import {join,dirname,resolve,relative,isAbsolute} from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createHash} from "node:crypto";
import {crc32,createInflateRaw} from "node:zlib";
type Kind="file"|"directory"|"symlink";
interface Entry{name:string;kind:Kind;size:number;compressed:number;crc:number;offset:number;method:number;flags:number;executable:boolean;data:number}
export interface RuntimeZipOptions {bytes:number;sha256:string;platform:"win32"|"darwin"|"linux";signal?:AbortSignal;check?:()=>void}
export interface RuntimeFile {path:string;kind:"file"|"symlink";bytes:number;sha256:string;executable:boolean;target?:string}
const MAX_FILE=512*1024*1024,MAX_TOTAL=1024*1024*1024;
function live(options:RuntimeZipOptions){options.signal?.throwIfAborted();options.check?.();options.signal?.throwIfAborted();}
async function read(file:FileHandle,length:number,position:number,options:RuntimeZipOptions,reuse?:Buffer){
 if(!Number.isSafeInteger(length)||length<0||length>65557)throw Error("Invalid runtime ZIP read");
 if(reuse&&reuse.length<length)throw Error("Invalid runtime ZIP buffer");
 const bytes=reuse?reuse.subarray(0,length):Buffer.alloc(length);let used=0;
 while(used<length){live(options);const result=await file.read(bytes,used,length-used,position+used);live(options);if(!result.bytesRead)throw Error("Runtime ZIP is truncated");used+=result.bytesRead;}
 return bytes;
}
function pathName(raw:Buffer,directory:boolean){
 const name=raw.toString("utf8");if(!Buffer.from(name).equals(raw)||name.length>2048||/[\\:\x00-\x1f\x7f]/.test(name))throw Error("Invalid runtime ZIP name");
 const clean=directory&&name.endsWith("/")?name.slice(0,-1):name,parts=clean.split("/");
 if(parts.length>64||parts.some(part=>!part||part==="."||part===".."||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)))throw Error("Invalid runtime ZIP path");
 return parts.join("/");
}
async function catalog(file:FileHandle,options:RuntimeZipOptions){
 const tail=await read(file,Math.min(options.bytes,65557),Math.max(0,options.bytes-65557),options);let end=-1;
 for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
 if(end<0)throw Error("Runtime ZIP ending is missing");
 const count=tail.readUInt16LE(end+10),length=tail.readUInt32LE(end+12),start=tail.readUInt32LE(end+16),ending=options.bytes-tail.length+end;
 if(!count||count>10000||length>8*1024*1024||tail.readUInt16LE(end+4)||tail.readUInt16LE(end+6)||tail.readUInt16LE(end+8)!==count||start+length!==ending)throw Error("Unsupported runtime ZIP catalog");
 const entries:Entry[]=[],names=new Map<string,Kind>();let cursor=start,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>ending)throw Error("Truncated runtime ZIP catalog");
  const header=await read(file,46,cursor,options),flags=header.readUInt16LE(8),method=header.readUInt16LE(10);
  const nameLength=header.readUInt16LE(28),extra=header.readUInt16LE(30),comment=header.readUInt16LE(32),size=header.readUInt32LE(24),compressed=header.readUInt32LE(20),offset=header.readUInt32LE(42);
  if(header.readUInt32LE(0)!==0x02014b50||flags&1||![0,8].includes(method)||header.readUInt16LE(34)||!nameLength||nameLength>2048||size>MAX_FILE||compressed>options.bytes||offset>=start||(total+=size)>MAX_TOTAL)throw Error("Invalid runtime ZIP entry");
  cursor+=46;if(cursor+nameLength+extra+comment>ending)throw Error("Truncated runtime ZIP entry");
  const rawName=await read(file,nameLength,cursor,options),mode=header.readUInt32LE(38)>>>16,type=mode&0xf000;
  let kind:Kind=type===0xa000?"symlink":type===0x4000||rawName.at(-1)===47?"directory":"file";
  if(![0,0x8000,0x4000,0xa000].includes(type)||kind==="symlink"&&(options.platform!=="darwin"||size>4096)||kind==="directory"&&(size!==0||header.readUInt32LE(16)!==0))throw Error("Unsupported runtime ZIP file type");
  const name=pathName(rawName,kind==="directory"),key=name.toLowerCase();if(names.has(key))throw Error("Duplicate runtime ZIP path");names.set(key,kind);
  entries.push({name,kind,size,compressed,crc:header.readUInt32LE(16),offset,method,flags,executable:kind==="file"&&((mode&0o111)!==0||name.toLowerCase().endsWith(".exe")),data:0});
  cursor+=nameLength+extra+comment;
 }
 if(cursor!==ending)throw Error("Runtime ZIP catalog length differs");
 const directories=new Set<string>();
 for(const entry of entries){
  live(options);const parts=entry.name.toLowerCase().split("/");if(entry.kind!=="directory")parts.pop();
  while(parts.length){const parent=parts.join("/"),kind=names.get(parent);if(kind&&kind!=="directory")throw Error("Runtime ZIP path has a non-directory parent");directories.add(parent);if(directories.size>20000)throw Error("Runtime ZIP directory limit exceeded");parts.pop();}
 }
 const physical=[...entries].sort((a,b)=>a.offset-b.offset);if(physical[0]!.offset!==0)throw Error("Runtime ZIP prefix is unsupported");
 for(let i=0;i<physical.length;i++){
  const entry=physical[i]!,next=physical[i+1]?.offset??start,header=await read(file,30,entry.offset,options),nameLength=header.readUInt16LE(26),extra=header.readUInt16LE(28);
  if(header.readUInt32LE(0)!==0x04034b50||header.readUInt16LE(6)!==entry.flags||header.readUInt16LE(8)!==entry.method||!nameLength||nameLength>2048)throw Error("Runtime ZIP local header differs");
  const name=pathName(await read(file,nameLength,entry.offset+30,options),entry.kind==="directory");if(name!==entry.name)throw Error("Runtime ZIP local path differs");
  if(!(entry.flags&8)&&(header.readUInt32LE(14)!==entry.crc||header.readUInt32LE(18)!==entry.compressed||header.readUInt32LE(22)!==entry.size))throw Error("Runtime ZIP local sizes differ");
  entry.data=entry.offset+30+nameLength+extra;const after=entry.data+entry.compressed;
  if(after>next)throw Error("Runtime ZIP entries overlap");
  const gap=next-after;
  if(entry.flags&8){
   if(![12,16].includes(gap))throw Error("Invalid runtime ZIP descriptor");
   const descriptor=await read(file,gap,after,options),at=gap===16?4:0;
   if(gap===16&&descriptor.readUInt32LE(0)!==0x08074b50||descriptor.readUInt32LE(at)!==entry.crc||descriptor.readUInt32LE(at+4)!==entry.compressed||descriptor.readUInt32LE(at+8)!==entry.size)throw Error("Runtime ZIP descriptor differs");
  }else if(gap!==0)throw Error("Unexpected runtime ZIP padding");
 }
 return entries;
}
/** Only for a newly owned, empty private staging directory. It never executes extracted files. */
export async function extractAssistantRuntimeZip(archive:string,target:string,options:RuntimeZipOptions):Promise<RuntimeFile[]>{
 if(!Number.isSafeInteger(options.bytes)||options.bytes<22||options.bytes>512*1024*1024||!/^[a-f0-9]{64}$/.test(options.sha256)||!["win32","darwin","linux"].includes(options.platform))throw Error("Invalid fixed runtime archive");
 live(options);const root=await lstat(target);live(options);
 if(!root.isDirectory()||root.isSymbolicLink()||(await readdir(target)).length)throw Error("Runtime staging must be a new empty directory");
 const canonical=await realpath(target);live(options);
 const file=await open(archive,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  live(options);const before=await file.stat();if(!before.isFile()||before.size!==options.bytes)throw Error("Runtime archive size differs");
  const digest=createHash("sha256"),scratch=Buffer.alloc(65536);let cursor=0;
  while(cursor<before.size){const bytes=await read(file,Math.min(65536,before.size-cursor),cursor,options,scratch);digest.update(bytes);cursor+=bytes.length;}
  if(digest.digest("hex")!==options.sha256)throw Error("Runtime archive digest differs");
  const entries=await catalog(file,options),result:RuntimeFile[]=[],links:{entry:Entry;data:Buffer}[]=[];
  for(const entry of entries){
   live(options);const path=join(canonical,...entry.name.split("/"));
   if(entry.kind==="directory")await mkdir(path,{recursive:true,mode:0o700});
   else await mkdir(dirname(path),{recursive:true,mode:0o700});live(options);
   const output=entry.kind==="file"?await open(path,"wx",entry.executable?0o700:0o600):null;
   let size=0,crc=0;const hash=createHash("sha256"),chunks:Buffer[]=[];
   async function* compressed(){let used=0;while(used<entry.compressed){const bytes=await read(file,Math.min(65536,entry.compressed-used),entry.data+used,options);used+=bytes.length;yield bytes;}}
   const sink=async(source:AsyncIterable<Buffer>)=>{
    for await(const chunk of source){
     live(options);size+=chunk.length;if(size>entry.size)throw Error("Runtime ZIP expanded size differs");crc=crc32(chunk,crc);hash.update(chunk);
     if(output){let used=0;while(used<chunk.length){live(options);const n=await output.write(chunk,used,chunk.length-used);live(options);if(!n.bytesWritten)throw Error("Runtime file write failed");used+=n.bytesWritten;}}
     else chunks.push(Buffer.from(chunk));
    }
   };
   try{
    if(entry.compressed){const input=Readable.from(compressed(),{objectMode:false,highWaterMark:65536}),flags=options.signal?{signal:options.signal}:{};
     if(entry.method===8)await pipeline(input,createInflateRaw({chunkSize:65536}),sink,flags);else await pipeline(input,sink,flags);
    }
    live(options);if(size!==entry.size||crc!==entry.crc)throw Error("Runtime ZIP checksum differs");
    if(entry.kind==="symlink")links.push({entry,data:Buffer.concat(chunks)});
    else if(entry.kind==="file")result.push({path:entry.name,kind:"file",bytes:size,sha256:hash.digest("hex"),executable:entry.executable});
   }finally{await output?.close();}
  }
  for(const {entry,data} of links){
   const link=data.toString("utf8"),path=join(canonical,...entry.name.split("/"));
   if(!link||!Buffer.from(link).equals(data)||isAbsolute(link)||/[\\:\x00-\x1f\x7f]/.test(link))throw Error("Invalid runtime symbolic link");
   const resolved=relative(canonical,resolve(dirname(path),link));if(!resolved||resolved===".."||resolved.startsWith("../")||resolved.startsWith("..\\")||isAbsolute(resolved))throw Error("Runtime symbolic link escapes staging");
  }
  for(const {entry,data} of links){live(options);await symlink(data.toString("utf8"),join(canonical,...entry.name.split("/")));live(options);}
  for(const {entry,data} of links){
   const path=await realpath(join(canonical,...entry.name.split("/")));live(options);const rel=relative(canonical,path);
   if(!rel||rel===".."||rel.startsWith("../")||rel.startsWith("..\\")||isAbsolute(rel))throw Error("Runtime symbolic link escapes staging");
   result.push({path:entry.name,kind:"symlink",bytes:data.length,sha256:createHash("sha256").update(data).digest("hex"),executable:false,target:data.toString("utf8")});
  }
  const after=await file.stat();live(options);
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error("Runtime archive changed during extraction");
  return result;
 }finally{await file.close();}
}
