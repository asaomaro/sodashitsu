import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { Unzip, UnzipInflate } from "fflate";

// Standard single-disk ZIP only. Read its finite central directory first so truncated
// archives and bad CRCs cannot silently become the new executable installation.
async function catalog(file:FileHandle,size:number):Promise<Map<string,{size:number;crc:number}>> {
  async function read(length:number,offset:number):Promise<Buffer> {
    const buffer=Buffer.alloc(length);let used=0;
    while(used<length) {const result=await file.read(buffer,used,length-used,offset+used);if(!result.bytesRead)throw Error("ZIPが不完全です");used+=result.bytesRead;}
    return buffer;
  }
  const tail=await read(Math.min(size,65557),Math.max(0,size-65557));let end=-1;
  for(let i=tail.length-22;i>=0;--i) if(tail.readUInt32LE(i)===0x06054b50 && i+22+tail.readUInt16LE(i+20)===tail.length) {end=i;break;}
  if(end<0) throw Error("ZIPの末尾を確認できません");
  const entries=tail.readUInt16LE(end+10),bytes=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);
  const finalOffset=size-tail.length+end;
  if(tail.readUInt16LE(end+4)||tail.readUInt16LE(end+6)||tail.readUInt16LE(end+8)!==entries || !entries || entries>10000 || offset+bytes!==finalOffset) throw Error("対応外か不完全なZIPです");
  const result=new Map<string,{size:number;crc:number}>();let cursor=offset,total=0;
  for(let i=0;i<entries;++i) {
    if(cursor+46>finalOffset) throw Error("ZIPの一覧が不完全です");
    const header=await read(46,cursor);
    if(header.readUInt32LE(0)!==0x02014b50 || header.readUInt16LE(8)&1 || ![0,8].includes(header.readUInt16LE(10)) || header.readUInt16LE(34)) throw Error("ZIPの形式を確認してください");
    const nameBytes=header.readUInt16LE(28),extra=header.readUInt16LE(30),comment=header.readUInt16LE(32),length=header.readUInt32LE(24);
    cursor+=46;if(!nameBytes || nameBytes>2048 || cursor+nameBytes+extra+comment>finalOffset || (total+=length)>1024*1024*1024) throw Error("ZIPの名前・容量を確認してください");
    const name=(await read(nameBytes,cursor)).toString("utf8");
    if(result.has(name)) throw Error("ZIPに重複したパスがあります");
    result.set(name,{size:length,crc:header.readUInt32LE(16)});cursor+=nameBytes+extra+comment;
  }
  if(cursor!==finalOffset) throw Error("ZIPの一覧の大きさが一致しません");
  return result;
}
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{let value=i;for(let bit=0;bit<8;++bit)value=(value>>>1)^((value&1)?0xedb88320:0);return value;});

/** Extract into a newly owned empty staging directory. No archive paths or links are trusted.
 * fflate is synchronous here: no worker/process exists outside this explicit installation.
 */
export async function extractAssistantZip(archive:string,target:string):Promise<void> {
  const handles=new Set<number>(),names=new Set<string>();let count=0,total=0,failure:unknown;
  let expected=new Map<string,{size:number;crc:number}>();
  const unzip=new Unzip(file=>{
    try {
      const name=file.name;
      const entry=expected.get(name);if(!entry) throw Error("ZIPの内容と一覧が一致しません");
      if(++count>10000 || name.length>2048 || /[\\:\x00-\x1f\x7f]/.test(name)) throw Error("ZIPの名前・件数を確認してください");
      const directory=name.endsWith("/"),parts=(directory?name.slice(0,-1):name).split("/");
      if(parts.some(part=>!part || part==="." || part===".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw Error("ZIPのパスを確認してください");
      const key=parts.join("/").toLowerCase();if(names.has(key)) throw Error("ZIPに重複したパスがあります");names.add(key);
      const path=join(target,...parts);
      if(directory) {if(entry.size || entry.crc)throw Error("ZIPのフォルダー情報が不正です");mkdirSync(path,{recursive:true});file.ondata=(error,data)=>{if(error)failure=error;else if(data.length)failure=Error("ZIPのフォルダーにデータがあります");};file.start();return;}
      mkdirSync(join(path,".."),{recursive:true});
      const fd=openSync(path,"wx",name.toLowerCase().endsWith(".exe")?0o700:0o600);handles.add(fd);
      let fileSize=0,crc=0xffffffff;
      file.ondata=(error,data,final)=>{
        if(failure) return;
        if(error) {failure=error;return;}
        try {
          if((total+=data.length)>1024*1024*1024) throw Error("ZIPの展開後は1GiB以内にしてください");
          fileSize+=data.length;if(fileSize>entry.size)throw Error("ZIPの容量が一覧と一致しません");
          for(const byte of data) crc=(crc>>>8)^CRC_TABLE[(crc^byte)&255]!;
          let used=0;while(used<data.length) {const n=writeSync(fd,data,used);if(!n) throw Error("ZIPを書き込めません");used+=n;}
          if(final) {if(fileSize!==entry.size || ((crc^0xffffffff)>>>0)!==entry.crc)throw Error("ZIPの内容が破損しています");closeSync(fd);handles.delete(fd);}
        } catch(error) {failure=error;}
      };
      file.start();
    } catch(error) {failure=error;}
  });
  unzip.register(UnzipInflate);
  const file=await open(archive,constants.O_RDONLY | (constants.O_NOFOLLOW??0) | (constants.O_NONBLOCK??0));
  try {
    const before=await file.stat();if(!before.isFile() || !before.size || before.size>512*1024*1024) throw Error("ZIPは512MiB以内の通常ファイルを指定してください");
    expected=await catalog(file,before.size);
    const buffer=Buffer.alloc(65536);let used=0;
    while(true) {
      const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,before.size-used+1),null);
      if(!bytesRead) break;
      used+=bytesRead;if(used>before.size) throw Error("ZIPが読み取り中に変更されました");
      unzip.push(buffer.subarray(0,bytesRead),false);if(failure) throw failure;
    }
    unzip.push(new Uint8Array(),true);if(failure) throw failure;
    const after=await file.stat();
    if(handles.size || count!==expected.size || used!==before.size || after.size!==before.size || after.mtimeMs!==before.mtimeMs || after.ctimeMs!==before.ctimeMs) throw Error("ZIPが不完全か、読み取り中に変更されました");
  } finally {await file.close();for(const fd of handles)closeSync(fd);}
}
