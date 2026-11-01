import {assistantPersonaContext} from "@sodashitsu/protocol";
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {mkdir,open,link,unlink} from "node:fs/promises";
import {constants} from "node:fs";
import {join} from "node:path";
const KEYS=new Map<string,Promise<Buffer>>();
const START="\n\n[Sodashitsu persona v2 offset=",END="\n[/Sodashitsu persona v2]";
/** A server-owned signature prevents ordinary user code/examples from being hidden as context. */
export class AssistantPersonaPrompts {
 private key:Promise<Buffer>|null=null;
 constructor(private readonly directory:string){}
 private secret():Promise<Buffer>{
  if(this.key)return this.key;
  const cached=KEYS.get(this.directory);if(cached)return this.key=cached;
  const operation=(async()=>{
   await mkdir(this.directory,{recursive:true,mode:0o700});
   const path=join(this.directory,"assistant-persona-key");
   const read=async()=>{
    const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try{
     const stat=await file.stat();if(!stat.isFile()||stat.size!==32)throw Error("キャラクター設定の署名鍵を読み込めません。");
     const value=Buffer.alloc(32);const {bytesRead}=await file.read(value,0,32,0);
     if(bytesRead!==32)throw Error("キャラクター設定の署名鍵を読み込めません。");return value;
    }finally{await file.close();}
   };
   try{return await read();}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
   const key=randomBytes(32),temporary=join(this.directory,`.assistant-persona-key-${randomBytes(16).toString("hex")}`);
   try{
    const file=await open(temporary,"wx",0o600);
    try{await file.writeFile(key);await file.sync();}finally{await file.close();}
    // Publish a complete inode without replacing a key another owner already created.
    try{await link(temporary,path);return key;}
    catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;return await read();}
   }finally{await unlink(temporary).catch(()=>{});}

  })();
  KEYS.set(this.directory,operation);this.key=operation;
  void operation.catch(()=>{if(KEYS.get(this.directory)===operation)KEYS.delete(this.directory);this.key=null;});
  return operation;
 }
 private signature(key:Buffer,deviceId:string,message:string):string {
  return createHmac("sha256",key).update(deviceId).update("\n").update(String(message.length)).update("\n").update(message).digest("hex");
 }
 async wrap(deviceId:string,characterId:string|undefined,message:string):Promise<string>{
  const context=assistantPersonaContext(characterId);
  if(context===null)return message;
  const signature=this.signature(await this.secret(),deviceId,message);
  return message+START+message.length+" sig="+signature+"]\n"+context+END;
 }
 async userText(deviceId:string,message:string):Promise<string>{
  const marker=message.lastIndexOf(START);
  if(marker<0)return message;
  const match=/^\n\n\[Sodashitsu persona v2 offset=(\d{1,6}) sig=([0-9a-f]{64})\]\n/.exec(message.slice(marker));
  if(!match||Number(match[1])!==marker||(!message.endsWith(END)&&message.length<8192))return message;
  const original=message.slice(0,marker),expected=this.signature(await this.secret(),deviceId,original);
  return timingSafeEqual(Buffer.from(match[2]!,"hex"),Buffer.from(expected,"hex"))?original:message;
 }
}
