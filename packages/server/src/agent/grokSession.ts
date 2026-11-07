import {lstat,realpath,opendir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {openVerified,readRange,type OpenedFile} from './safeFile.js';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export interface GrokSessionRoots{home?:string;grokHome?:string}
export interface GrokSessionLocation{kind:'grok';id:string;dir:string;cwd:string|null}
export function grokHome(opts:GrokSessionRoots={}):string{return opts.grokHome||process.env.GROK_HOME||join(opts.home??homedir(),'.grok')}
const pending=new Map<string,Promise<GrokSessionLocation|null>>();
async function directory(path:string):Promise<boolean>{const st=await lstat(path).catch(()=>null);return !!st&&st.isDirectory()&&!st.isSymbolicLink()&&await realpath(path).catch(()=>null)===path}
function absoluteCwd(value:string):string|null{
 const text=value.trim();return text.length>0&&text.length<=4096&&!/[\x00-\x1f\x7f]/.test(text)&&(text.startsWith('/')||/^[A-Za-z]:[\\/]/.test(text)||text.startsWith('\\\\'))?text:null;
}
async function groupCwd(group:string):Promise<string|null>{
 try{const decoded=absoluteCwd(decodeURIComponent(basename(group)));if(decoded)return decoded}catch{}
 const file=join(group,'.cwd');let opened:OpenedFile|null=null;
 const leaf=async()=>{const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||await realpath(file)!==file||await realpath(dirname(file))!==group)throw Error('Invalid cwd metadata');return st;};
 try{
  const before=await leaf();if(before.size>4096)return null;
  opened=await openVerified(file);if(!opened||opened.st.size>4096||opened.st.dev!==before.dev||opened.st.ino!==before.ino)return null;
  const bytes=await readRange(opened.fd,0,opened.st.size),after=await leaf(),fdAfter=await opened.fd.stat();
  if(after.dev!==opened.st.dev||after.ino!==opened.st.ino||after.size!==opened.st.size||fdAfter.size!==opened.st.size||!bytes.equals(await readRange(opened.fd,0,bytes.length)))return null;
  return absoluteCwd(bytes.toString('utf8'));
 }catch{return null}finally{await opened?.fd.close()}
}
/** One bounded CWD-group walk, probing the exact UUID directory instead of scanning
 * every session. Concurrent users of the same root/id share only that pending read. */
export async function locateGrokSession(id:string,opts:GrokSessionRoots={}):Promise<GrokSessionLocation|null>{
 if(!UUID.test(id))return null;
 const root=await realpath(join(grokHome(opts),'sessions')).catch(()=>null);if(!root)return null;
 const key=JSON.stringify([root,id]);const current=pending.get(key);if(current)return current;if(pending.size>=64)return null;
 const work=(async()=>{
  if(!await directory(root))return null;
  const end=performance.now()+1000,handle=await opendir(root).catch(()=>null);if(!handle)return null;
  let found:GrokSessionLocation|null=null,count=0;
  for await(const entry of handle){
   if(++count>1000||performance.now()>end)return null;
   if(!entry.isDirectory()||entry.isSymbolicLink())continue;
   const group=join(root,entry.name);if(!await directory(group))continue;
   const dir=join(group,id);if(!await directory(dir))continue;
   if(found)return null; // Ambiguous relocation/copy: never choose the newest match.
   found={kind:'grok',id,dir,cwd:await groupCwd(group)};
  }
  return found;
 })().catch(()=>null).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
/** Only provider-defined leaves, revalidated around nofollow/single-file open.
 * Callers still enforce their own file-size/schema/session-ID limits. */
export async function openGrokSessionRecord(id:string,name:'usage.json'|'chat_history.jsonl',opts:GrokSessionRoots={}):Promise<OpenedFile|null>{
 if(!['usage.json','chat_history.jsonl'].includes(name))return null;
 const location=await locateGrokSession(id,opts);if(!location)return null;
 const path=join(location.dir,name);let opened:OpenedFile|null=null;
 try{
  if(await realpath(dirname(path))!==location.dir)return null;
  opened=await openVerified(path);if(!opened)return null;
  const after=await lstat(path);
  if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||after.dev!==opened.st.dev||after.ino!==opened.st.ino||await realpath(dirname(path))!==location.dir||!await directory(location.dir))throw Error('Grok record changed');
  return opened;
 }catch{await opened?.fd.close();return null}
}
