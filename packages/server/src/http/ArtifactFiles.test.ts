import {it,expect,vi} from 'vitest';
import * as fsPromises from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,stat,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {ArtifactFiles,ARTIFACT_PREFIX} from './ArtifactFiles.js';
import {listenOnFreePort} from '../composeServerOnFreePort.js';
vi.mock('node:fs/promises',async(importOriginal)=>{const actual=await importOriginal<typeof import('node:fs/promises')>();return {...actual,open:vi.fn(actual.open)};});
it.skipIf(process.platform==='win32')('rejects a FIFO swapped in immediately before open without blocking',async()=>{
 const root=await mkdtemp(join(tmpdir(),'soda-artifact-fifo-')),files=new ArtifactFiles();
 const path=join(root,'video.html');await writeFile(path,'safe');const stamp=await stat(path);
 const original=(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open;
 const spy=vi.mocked(fsPromises.open).mockImplementationOnce(async(file,flags,mode)=>{
  await rm(path);execFileSync('mkfifo',[path]);
  // Fail safely rather than leaving a worker blocked on a regressed FIFO open.
  if(typeof flags!=='number'||!(flags & constants.O_NONBLOCK))throw new Error('FIFO open would block');
  return original(file,flags,mode);
 });
 try{await expect(files.register('owner',root,path,stamp,'html',()=>true)).rejects.toThrow('成果物の表示が終了しました');}
 finally{spy.mockImplementation(original);files.close();await rm(root,{recursive:true,force:true});}
});
it('streams one selected large file over HTTP, keeps isolation, and revokes changed/closed capabilities',async()=>{
 const root=await mkdtemp(join(tmpdir(),'soda-artifact-')),files=new ArtifactFiles();
 const server=createServer((req,res)=>{void files.serve(req,res,req.url??'').catch(()=>{res.statusCode=500;res.end();});});
 try{
  const path=join(root,'video.html'),html='<h1>Artifact</h1><!--'+' '.repeat(65*1024**2)+'-->';await writeFile(path,html);const stamp=await stat(path);let valid=true;
  const cap=await files.register('one',root,path,stamp,'html',()=>valid);const base='http://127.0.0.1:'+await listenOnFreePort(server);
  const head=await fetch(base+cap.path,{method:'HEAD'});expect(head.status).toBe(200);expect(head.headers.get('content-length')).toBe(String(Buffer.byteLength(html)));expect(head.headers.get('content-security-policy')).toContain('sandbox allow-scripts');expect(head.headers.get('x-frame-options')).toBeNull();
  const got=await fetch(base+cap.path);expect(await got.text()).toBe(html);
  expect((await fetch(base+ARTIFACT_PREFIX+'../video.html')).status).toBe(404);
  files.revoke('another',cap.token);expect((await fetch(base+cap.path,{method:'HEAD'})).status).toBe(200);
  await writeFile(path,'changed');expect((await fetch(base+cap.path)).status).toBe(409);expect((await fetch(base+cap.path)).status).toBe(404);
  const cap2=await files.register('one',root,path,await stat(path),'html',()=>valid);valid=false;expect((await fetch(base+cap2.path)).status).toBe(404);
  valid=true;const cap3=await files.register('one',root,path,await stat(path),'html',()=>valid);files.revokeOwner('one');expect((await fetch(base+cap3.path)).status).toBe(404);
 }finally{files.close();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
it('rejects traversal, external symlinks, obsolete file stamps, and excessive registrations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'soda-artifact-scope-')),outside=await mkdtemp(join(tmpdir(),'soda-artifact-out-')),files=new ArtifactFiles();
 try{
  const path=join(root,'video.html'),external=join(outside,'secret.html');await writeFile(path,'safe');await writeFile(external,'private');
  await expect(files.register('owner',root,external,await stat(external),'html',()=>true)).rejects.toThrow('PJ内');
  await symlink(outside,join(root,'link'));await expect(files.register('owner',root,join(root,'link/secret.html'),await stat(external),'html',()=>true)).rejects.toThrow('PJ内');
  const old=await stat(path);await writeFile(path,'new content');await expect(files.register('owner',root,path,old,'html',()=>true)).rejects.toThrow('変更');
  for(let i=0;i<8;i++)await files.register('owner',root,path,await stat(path),'html',()=>true);
  await expect(files.register('owner',root,path,await stat(path),'html',()=>true)).rejects.toThrow('閉じて');
 }finally{files.close();await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
