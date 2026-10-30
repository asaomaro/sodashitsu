import { mkdirSync, writeFileSync, unlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { AssistantSessionGetParams } from "@sodashitsu/protocol";
/** Empty per-device markers survive removal of the dedicated workspace. No model/process starts on read. */
export class AssistantDisabledDevices {
 constructor(private readonly dir: string) {}
 private path(deviceId: string): string {return join(this.dir,"assistant-disabled",AssistantSessionGetParams.parse({deviceId}).deviceId);}
 isDisabled(deviceId: string): boolean {
  try {const stat=lstatSync(this.path(deviceId));if(!stat.isFile()||stat.isSymbolicLink())throw Error("アシスタントの停止記録を確認してください");return true;}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}
 }
 disable(deviceId: string): void {
  const path=this.path(deviceId);mkdirSync(join(this.dir,"assistant-disabled"),{recursive:true,mode:0o700});
  try {writeFileSync(path,"",{flag:"wx",mode:0o600});}
  catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;this.isDisabled(deviceId);}
 }
 activate(deviceId: string): void {try{unlinkSync(this.path(deviceId));}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
}
