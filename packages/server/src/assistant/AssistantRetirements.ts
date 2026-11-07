import {closeSync,constants,fstatSync,fsyncSync,lstatSync,mkdirSync,openSync,readSync,unlinkSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {AssistantAgentKind,AssistantSessionGetParams,type AssistantSessionInfo} from "@sodashitsu/protocol";
const RecordSchema=z.object({token:z.uuid(),deviceId:z.uuid(),workspaceId:z.uuid(),tabId:z.uuid().nullable(),paneId:z.uuid(),kind:AssistantAgentKind}).strict();
type Retirement=z.infer<typeof RecordSchema>;
/** Independent from the user-enabled flag: activation cannot erase uncertain physical retirement. */
export class AssistantRetirements {
 constructor(private readonly root:string){}
 private path(deviceId:string){return join(this.root,"assistant-retiring",AssistantSessionGetParams.parse({deviceId}).deviceId);}
 read(deviceId:string):Retirement|null {
  const path=this.path(deviceId);let fd:number|undefined;
  try{
   const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>2048)throw Error("船長の終了確認記録を確認してください");
   fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const opened=fstatSync(fd);
   if(opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==before.size)throw Error("船長の終了確認記録が変更されました");
   const bytes=Buffer.alloc(2049);const size=readSync(fd,bytes,0,bytes.length,0);
   if(size>2048||size!==opened.size)throw Error("船長の終了確認記録が変更されました");
   const record=RecordSchema.parse(JSON.parse(bytes.subarray(0,size).toString("utf8")));
   if(record.deviceId!==AssistantSessionGetParams.parse({deviceId}).deviceId)throw Error("船長の終了確認記録が一致しません");
   return record;
  }catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}finally{if(fd!==undefined)closeSync(fd);}
 }
 begin(info:AssistantSessionInfo):Retirement {
  const record=RecordSchema.parse({token:randomUUID(),deviceId:info.deviceId,workspaceId:info.workspaceId,tabId:info.tabId,paneId:info.paneId,kind:info.kind});
  mkdirSync(join(this.root,"assistant-retiring"),{recursive:true,mode:0o700});
  const fd=openSync(this.path(info.deviceId),"wx",0o600);
  try{writeFileSync(fd,JSON.stringify(record)+"\n");fsyncSync(fd);}finally{closeSync(fd);}
  return record;
 }
 complete(record:Retirement):void {
  if(this.read(record.deviceId)?.token!==record.token)throw Error("船長の終了確認記録が変更されました");
  unlinkSync(this.path(record.deviceId));
 }
 info(deviceId:string):AssistantSessionInfo|null {
  const value=this.read(deviceId);return value?{deviceId:value.deviceId,workspaceId:value.workspaceId,tabId:value.tabId,paneId:value.paneId,kind:value.kind,state:"stopping",agent:null,observedAgent:null}:null;
 }
}
