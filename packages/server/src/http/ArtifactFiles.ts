import {randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath,type FileHandle} from 'node:fs/promises';
import {relative,isAbsolute,resolve} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {pipeline} from 'node:stream/promises';
import {RpcError} from '@sodashitsu/protocol';
export const ARTIFACT_PREFIX='/display-artifacts/';
export const ARTIFACT_CSP="sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-src blob:; base-uri 'none'; form-action 'none'; webrtc 'block'";
type Stamp={size:number;mtimeMs:number;ino:number};
type Entry={owner:string;handle:FileHandle;stamp:Stamp;type:string;valid:()=>boolean;expires:number};
/** Short-lived bearer URLs for one explicitly selected file; no directory browsing. */
export class ArtifactFiles {
 private entries=new Map<string,Entry>();
 private timer=setInterval(()=>this.expire(),30000).unref();
 private expire(){for(const [token,e] of this.entries)if(e.expires<Date.now()||!e.valid())this.revoke(e.owner,token);}
 revoke(owner:string,token:string){const e=this.entries.get(token);if(!e||e.owner!==owner)return;this.entries.delete(token);void e.handle.close().catch(()=>{});}
 revokeOwner(owner:string){for(const [token,e] of this.entries)if(e.owner===owner)this.revoke(owner,token);}
 close(){clearInterval(this.timer);for(const [token,e] of this.entries)this.revoke(e.owner,token);}
 async register(owner:string,root:string,path:string,stamp:Stamp,kind:'html'|'text'|'image',valid:()=>boolean){
  this.expire();if(this.entries.size>=128||[...this.entries.values()].filter(e=>e.owner===owner).length>=8)throw new RpcError('display_busy','開いている成果物を閉じてください');
  const base=await realpath(root),actual=await realpath(resolve(base,path)),rel=relative(base,actual);
  if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw new RpcError('invalid_params','成果物はPJ内のファイルを指定してください');
  const before=await lstat(actual);
  if(!before.isFile())throw new RpcError('not_found','成果物は通常のファイルを指定してください');
  const handle=await open(actual,constants.O_RDONLY | (constants.O_NOFOLLOW??0) | (constants.O_NONBLOCK??0));
  try{
   const st=await handle.stat();
   if(!st.isFile()||st.dev!==before.dev||st.ino!==before.ino||!valid())throw new RpcError('not_found','成果物の表示が終了しました');
   if(st.size!==stamp.size||st.mtimeMs!==stamp.mtimeMs||st.ino!==stamp.ino)throw new RpcError('invalid_params','成果物が変更されました。再度開いてください');
   // Pin the descriptor and verify its current real path after open, including symlink parents.
   if(await realpath(actual)!==actual)throw new RpcError('invalid_params','成果物の保存先が変更されました');
   if(this.entries.size>=128||[...this.entries.values()].filter(e=>e.owner===owner).length>=8)throw new RpcError('display_busy','開いている成果物を閉じてください');
   const token=randomBytes(32).toString('hex');
   this.entries.set(token,{owner,handle,stamp,valid,expires:Date.now()+15*60000,type:kind==='html'?'text/html; charset=utf-8':kind==='image'?'image/png':'text/plain; charset=utf-8'});
   return {token,path:ARTIFACT_PREFIX+token};
  }catch(e){await handle.close();throw e;}
 }
 async serve(req:IncomingMessage,res:ServerResponse,path:string){
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.removeHeader('X-Frame-Options');res.setHeader('Content-Security-Policy',ARTIFACT_CSP);
  const token=path.slice(ARTIFACT_PREFIX.length),e=/^[a-f0-9]{64}$/.test(token)?this.entries.get(token):undefined;
  if(!e||!e.valid()||e.expires<Date.now()){if(e)this.revoke(e.owner,token);res.statusCode=404;res.end();return;}
  if(!['GET','HEAD'].includes(req.method??'')){res.statusCode=405;res.setHeader('Allow','GET, HEAD');res.end();return;}
  const st=await e.handle.stat().catch(()=>null);
  if(!st||st.size!==e.stamp.size||st.mtimeMs!==e.stamp.mtimeMs){this.revoke(e.owner,token);res.statusCode=409;res.end('成果物が変更されました。再度開いてください');return;}
  res.setHeader('Content-Type',e.type);res.setHeader('Content-Length',e.stamp.size);
  if(req.method==='HEAD'||e.stamp.size===0){res.end();return;}
  try{await pipeline(e.handle.createReadStream({autoClose:false,start:0,end:e.stamp.size-1}),res);}catch{res.destroy();}
 }
}
