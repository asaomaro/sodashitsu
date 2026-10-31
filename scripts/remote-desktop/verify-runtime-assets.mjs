// Inspect the built package as data. Never execute a helper or change OS permissions.
import {readFile,lstat,open,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {desktopRuntimeAssets} from './runtime-assets.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const target=resolve(process.argv[2]??join(root,'release','sodashitsu-'+version)),source=join(root,'scripts','remote-desktop'),sdk=join(target,'scripts','remote-desktop'),assets=new Set(desktopRuntimeAssets);
assert.equal(assets.size,desktopRuntimeAssets.length,'Duplicate SDK resource');
const digest=data=>createHash('sha256').update(data).digest('hex');
async function regularBytes(path,limit=2*1024*1024){
 const before=await lstat(path);assert.ok(before.isFile()&&!before.isSymbolicLink(),'Resource is not a regular file: '+path);assert.ok(before.size<=limit,'Resource exceeds its bound: '+path);
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const info=await file.stat();assert.ok(info.isFile()&&info.dev===before.dev&&info.ino===before.ino&&info.size===before.size,'Resource changed before read: '+path);
  const bytes=Buffer.alloc(info.size);let offset=0;
  while(offset<bytes.length){const read=await file.read(bytes,offset,bytes.length-offset,offset);assert.ok(read.bytesRead,'Resource truncated: '+path);offset+=read.bytesRead;}
  assert.equal((await file.read(Buffer.alloc(1),0,1,offset)).bytesRead,0,'Resource grew: '+path);
  const after=await file.stat();assert.ok(after.size===info.size&&after.mtimeMs===info.mtimeMs&&after.ctimeMs===info.ctimeMs,'Resource changed during read: '+path);return bytes;
 }finally{await file.close();}
}

let references=0;
const generatedReferences=new Map([
 ['main.swift',new Set(['build-macos-desktop.sh'])],
 ['bootstrap.mjs',new Set(['WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','build-signin-package.mjs','signin-bootstrap.mjs'])],
]);
for(const name of desktopRuntimeAssets){
 assert.match(name,/^[A-Za-z0-9_.-]+$/);assert.ok(!/(?:Checks|Fixture|Benchmark|\.Generated\.|^(?:test-|validate-|synthetic-))/i.test(name),'Test program in runtime inventory: '+name);
 const [a,b]=await Promise.all([regularBytes(join(source,name)),regularBytes(join(sdk,name))]);assert.ok(a.length<=2*1024*1024,'SDK resource bound: '+name);assert.equal(digest(a),digest(b),'SDK bytes differ: '+name);
 // Include PowerShell policies and JS builders, not just native-language sources.
 const text=a.toString('utf8');for(const line of text.split('\n')){
  if(/^\s*(?:#|\/\/)/.test(line))continue;
  for(const match of line.matchAll(/\b[A-Za-z][A-Za-z0-9_.-]*\.(?:cs|ps1|mjs|py|swift|sh)\b/g)){
   assert.ok(assets.has(match[0])||generatedReferences.get(match[0])?.has(name),name+' requires missing '+match[0]);references++;
  }
 }
}
if(process.platform==='darwin'){
 const file='macos-desktop-helper',a=await regularBytes(join(source,file),64*1024*1024),b=await regularBytes(join(sdk,file),64*1024*1024);assert.equal(digest(a),digest(b),'Native Mac binary differs');await access(join(sdk,file),constants.X_OK);
}
console.log(JSON.stringify({runtimeResources:assets.size,localReferences:references,sourceBytesMatch:true,macBinaryChecked:process.platform==='darwin',helperExecution:false}));
