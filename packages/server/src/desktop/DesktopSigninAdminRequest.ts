import {inspect} from "node:util";
import {z} from "zod";
import {DesktopEndpointFingerprint} from "@sodashitsu/protocol";
const failure=()=>new Error("Signin administration is unavailable");
const uuid=z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const owner=z.string().max(184).regex(/^S-1-[0-9]+(?:-[0-9]+){1,15}$/).refine(value=>!['S-1-5-18','S-1-5-19','S-1-5-20'].includes(value)&&value.split('-').slice(2).every((part,i)=>/^(?:0|[1-9][0-9]*)$/.test(part)&&Number.isSafeInteger(Number(part))&&Number(part)<=(i===0?0xffffffffffff:0xffffffff)));
const origin=z.string().max(2048).refine(value=>{try{const url=new URL(value);return value===url.origin&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));}catch{return false;}});
const peer=z.object({fingerprint:DesktopEndpointFingerprint,label:z.string().trim().min(1).max(80)}).strict();
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('status')}).strict(),
 z.object({kind:z.literal('initialize')}).strict(),
 z.object({kind:z.literal('trust'),peer}).strict(),
 z.object({kind:z.literal('revoke'),fingerprint:DesktopEndpointFingerprint}).strict(),
 z.object({kind:z.literal('enroll'),origin,machineId:z.string().regex(/^[a-f0-9]{32}$/),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),allowInput:z.boolean(),peers:z.array(peer).min(1).max(8).refine(values=>new Set(values.map(v=>v.fingerprint)).size===values.length)}).strict(),
 z.object({kind:z.literal('disable')}).strict(),
]);
const record=z.object({version:z.literal(1),purpose:z.literal('desktop-signin-admin'),nonce:uuid,ownerSid:owner,issuedAt:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),expiresAt:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),operation}).strict();
export type DesktopSigninAdminOperation=z.infer<typeof operation>;
export interface DesktopSigninAdminClock{wall():number;monotonic():number;}
/** Validated data and a bounded lease, NOT proof of local admin, ACL or DPAPI.
 * Only a verified local journal adapter may dispatch it. Never accept it by RPC. */
export class DesktopSigninAdminRequest {
 readonly #data:z.infer<typeof record>;readonly #until:number;#last:number;#lastWall:number;#ended=false;#checking=false;#used=false;
 private constructor(data:z.infer<typeof record>,private readonly clock:DesktopSigninAdminClock,at:number,wall:number){this.#data=data;this.#last=at;this.#lastWall=wall;this.#until=at+data.expiresAt-wall;}
 static decode(bytes:Uint8Array,expected:{ownerSid:string;nonce:string},clock:DesktopSigninAdminClock):DesktopSigninAdminRequest{
  try{
   if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>16384)throw failure();
   const data=record.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))),wall=clock.wall(),at=clock.monotonic();
   if(!Number.isSafeInteger(wall)||!Number.isFinite(at)||at<0||data.ownerSid!==expected.ownerSid||data.nonce!==expected.nonce||data.expiresAt<=data.issuedAt||data.expiresAt-data.issuedAt>300000||wall<data.issuedAt||wall>=data.expiresAt)throw failure();
   return new DesktopSigninAdminRequest(data,clock,at,wall);
  }catch{throw failure();}
 }
 current(owned:()=>boolean):boolean{
  if(this.#ended||this.#checking){this.#ended=true;return false;}this.#checking=true;
  try{
   const permitted=owned(),wall=this.clock.wall(),at=this.clock.monotonic();
   if(!permitted||this.#ended||!Number.isSafeInteger(wall)||!Number.isFinite(at)||at<this.#last||at>=this.#until||wall<this.#lastWall||wall>=this.#data.expiresAt){this.#ended=true;return false;}
   this.#last=at;this.#lastWall=wall;return true;
  }catch{this.#ended=true;return false;}finally{this.#checking=false;}
 }
 close():void{this.#ended=true;}
 /** One attempt only. A crash/unknown result must never replay this mutation. */
 take(owned:()=>boolean):DesktopSigninAdminOperation{
  if(this.#used||!this.current(owned))throw failure();this.#used=true;return structuredClone(this.#data.operation);
 }
 binding():{nonce:string;ownerSid:string;expiresAt:number}{return {nonce:this.#data.nonce,ownerSid:this.#data.ownerSid,expiresAt:this.#data.expiresAt};}
 toJSON():{version:1;purpose:'desktop-signin-admin'}{return {version:1,purpose:'desktop-signin-admin'};}
 [inspect.custom]():unknown{return this.toJSON();}
}
/** Any journal residue irrevocably selects administrative recovery for that
 * startup, including malformed/expired/consumed requests and partial cleanup. */
export function desktopSigninAdminBranch(raw:unknown):'normal'|'claim'|'recovery'{
 let files:{pending:boolean;claimed:boolean;result:boolean;ack:boolean};try{files=z.object({pending:z.boolean(),claimed:z.boolean(),result:z.boolean(),ack:z.boolean()}).strict().parse(raw);}catch{return 'recovery';}
 if(!files.pending&&!files.claimed&&!files.result&&!files.ack)return 'normal';
 return files.pending&&!files.claimed&&!files.result&&!files.ack?'claim':'recovery';
}
