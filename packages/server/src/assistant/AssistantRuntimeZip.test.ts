import {mkdtemp,writeFile,mkdir,readFile,rm,symlink} from "node:fs/promises";
import * as files from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {crc32,deflateRawSync} from "node:zlib";
import {expect,it,vi} from "vitest";
import {extractAssistantRuntimeZip,type RuntimeZipOptions} from "./AssistantRuntimeZip.js";
vi.mock("node:fs/promises",async original=>{const actual=await original<typeof files>();return {...actual,open:vi.fn(actual.open)};});
interface FixtureEntry{name:string;data?:string;mode?:number;store?:boolean;descriptor?:boolean;badDescriptor?:boolean}
function zip(entries:FixtureEntry[]){
 let offset=0;const locals:Buffer[]=[],catalog:Buffer[]=[];
 for(const entry of entries){
  const name=Buffer.from(entry.name),body=Buffer.from(entry.data??""),method=entry.store?0:8,data=method?deflateRawSync(body):body,crc=crc32(body),flags=entry.descriptor?8:0;
  const h=Buffer.alloc(30),c=Buffer.alloc(46),descriptor=entry.descriptor?Buffer.alloc(16):Buffer.alloc(0);
  h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(flags,6);h.writeUInt16LE(method,8);h.writeUInt16LE(name.length,26);
  if(!entry.descriptor){h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(body.length,22);}
  else{descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(entry.badDescriptor?(crc^1)>>>0:crc,4);descriptor.writeUInt32LE(data.length,8);descriptor.writeUInt32LE(body.length,12);}
  c.writeUInt32LE(0x02014b50);c.writeUInt16LE((3<<8)|20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(((entry.mode??0o100644)<<16)>>>0,38);c.writeUInt32LE(offset,42);
  locals.push(h,name,data,descriptor);catalog.push(c,name);offset+=h.length+name.length+data.length+descriptor.length;
 }
 const central=Buffer.concat(catalog),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,central,end]);
}
async function fixture(entries:FixtureEntry[],run:(value:{root:string;archive:string;target:string;bytes:Buffer;options:RuntimeZipOptions;rewrite(bytes:Buffer):Promise<RuntimeZipOptions>})=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),"soda-runtime-zip-")),archive=join(root,"archive.zip"),target=join(root,"stage");await mkdir(target);const bytes=zip(entries);
 const rewrite=async(data:Buffer):Promise<RuntimeZipOptions>=>{await writeFile(archive,data);return{bytes:data.length,sha256:createHash("sha256").update(data).digest("hex"),platform:"linux"};};
 const options=await rewrite(bytes);try{await run({root,archive,target,bytes,options,rewrite});}finally{await rm(root,{recursive:true,force:true});}
}
it("streams generated stored, deflated, directory and descriptor entries without execution",()=>fixture([{name:"electron",data:"generated non-executable bytes",mode:0o100755,descriptor:true},{name:"resources/",mode:0o40755},{name:"resources/app.asar",data:"generated package",store:true}],async f=>{
 const result=await extractAssistantRuntimeZip(f.archive,f.target,f.options);expect(result).toHaveLength(2);expect(result.find(row=>row.path==="electron")?.executable).toBe(true);expect(await readFile(join(f.target,"resources/app.asar"),"utf8")).toBe("generated package");
}));
it.skipIf(process.platform==="win32")("restores only internal macOS framework links",()=>fixture([{name:"Electron.app/Versions/A/file",data:"generated"},{name:"Electron.app/Versions/Current",data:"A",mode:0o120777},{name:"Electron.app/file",data:"Versions/Current/file",mode:0o120777}],async f=>{
 const result=await extractAssistantRuntimeZip(f.archive,f.target,{...f.options,platform:"darwin"});expect(result.filter(row=>row.kind==="symlink")).toHaveLength(2);expect(await readFile(join(f.target,"Electron.app/file"),"utf8")).toBe("generated");
}));
it.skipIf(process.platform==="win32")("canonicalizes a trusted symlinked parent such as macOS /tmp",()=>fixture([{name:"Versions/A/file",data:"generated"},{name:"Versions/Current",data:"A",mode:0o120777}],async f=>{
 const alias=join(f.root,"alias");await symlink(f.root,alias);await extractAssistantRuntimeZip(f.archive,join(alias,"stage"),{...f.options,platform:"darwin"});expect(await readFile(join(f.target,"Versions/Current/file"),"utf8")).toBe("generated");
}));
it.each([["../escape"],["same","SAME"],["parent","parent/child"],["NUL"],["trailing."]])("rejects escaping, duplicate, non-directory or reserved paths: %s",(...names)=>fixture(names.map(name=>({name,data:"generated"})),async f=>{
 await expect(extractAssistantRuntimeZip(f.archive,f.target,f.options)).rejects.toThrow();expect(existsSync(join(f.root,"escape"))).toBe(false);
}));
it("rejects more than 64 path parts before creating any directory",()=>fixture([{name:Array(65).fill("part").join("/")}],async f=>{await expect(extractAssistantRuntimeZip(f.archive,f.target,f.options)).rejects.toThrow(/path/);}));
it("bounds derived directories before extraction",()=>fixture(Array.from({length:400},(_,i)=>({name:["branch-"+i,...Array(62).fill("d"),"file"].join("/")})),async f=>{await expect(extractAssistantRuntimeZip(f.archive,f.target,f.options)).rejects.toThrow(/directory limit/);}));
it("refuses archive bytes and digest provenance before writing",()=>fixture([{name:"electron",data:"generated"}],async f=>{
 await expect(extractAssistantRuntimeZip(f.archive,f.target,{...f.options,sha256:"0".repeat(64)})).rejects.toThrow(/digest/);await expect(extractAssistantRuntimeZip(f.archive,f.target,{...f.options,bytes:f.options.bytes+1})).rejects.toThrow(/size/);expect(existsSync(join(f.target,"electron"))).toBe(false);
}));
it("rejects an inconsistent descriptor before extraction",()=>fixture([{name:"electron",data:"generated",descriptor:true,badDescriptor:true}],async f=>{await expect(extractAssistantRuntimeZip(f.archive,f.target,f.options)).rejects.toThrow(/descriptor/);}));
it("rejects local-vs-central metadata mismatches",()=>fixture([{name:"electron",data:"generated",store:true}],async f=>{
 const changed=Buffer.from(f.bytes);changed.writeUInt32LE((changed.readUInt32LE(14)^1)>>>0,14);const options=await f.rewrite(changed);await expect(extractAssistantRuntimeZip(f.archive,f.target,options)).rejects.toThrow(/local sizes/);
}));
it("checks streamed CRC against the pinned catalog even for stored entries",()=>fixture([{name:"electron",data:"generated",store:true}],async f=>{
 const changed=Buffer.from(f.bytes);changed[30+Buffer.byteLength("electron")]!^=1;const options=await f.rewrite(changed);await expect(extractAssistantRuntimeZip(f.archive,f.target,options)).rejects.toThrow(/checksum/);
}));
it("never creates an external macOS link",()=>fixture([{name:"link",data:"../outside",mode:0o120777}],async f=>{await expect(extractAssistantRuntimeZip(f.archive,f.target,{...f.options,platform:"darwin"})).rejects.toThrow(/escapes/);expect(existsSync(join(f.target,"link"))).toBe(false);}));
it("cancellation does not settle until an owned output close completes",()=>fixture([{name:"electron",data:"generated".repeat(10000)}],async f=>{
 const original=(await vi.importActual<typeof files>("node:fs/promises")).open;let release!:()=>void,closing=false,closed=false;
 const mock=vi.spyOn(files,"open").mockImplementation(async(...args:Parameters<typeof files.open>)=>{
  const handle=await original(...args);if(String(args[0])===join(f.target,"electron")){const close=handle.close.bind(handle);Object.defineProperty(handle,"close",{value:async()=>{closing=true;await new Promise<void>(resolve=>{release=resolve;});await close();closed=true;}});}return handle;
 });
 const controller=new AbortController();let settled=false;
 const operation=extractAssistantRuntimeZip(f.archive,f.target,{...f.options,signal:controller.signal,check:()=>{if(existsSync(join(f.target,"electron")))controller.abort();}});
 const completion=operation.then(()=>{settled=true;},()=>{settled=true;});
 try{await vi.waitFor(()=>expect(closing).toBe(true));expect(settled).toBe(false);expect(closed).toBe(false);release();await completion;expect(closed).toBe(true);expect(settled).toBe(true);}
 finally{release?.();await completion;mock.mockRestore();}
}));
