import {constants} from "node:fs";
import {open} from "node:fs/promises";
import {join,isAbsolute} from "node:path";
import {z} from "zod";
export const ASSISTANT_PACKAGE_FILE = "assistant-package.json";
const release = z.object({id:z.uuid(), command:z.tuple([z.string().min(1).max(2048)]), sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const AssistantPackageSchema = z.object({version:z.literal(1), current:release, previous:release.nullable()}).strict();
export type AssistantPackage = z.infer<typeof AssistantPackageSchema>;

export async function readAssistantPackage(dir:string):Promise<AssistantPackage|null> {
  let bytes:Buffer;
  try { const file=await open(join(dir,ASSISTANT_PACKAGE_FILE),constants.O_RDONLY | (constants.O_NOFOLLOW??0) | (constants.O_NONBLOCK??0));
    try { if (!(await file.stat()).isFile()) throw Error("アシスタントの配布設定を確認してください");
      const buffer=Buffer.alloc(16385);let used=0;
      while(used<buffer.length) {const result=await file.read(buffer,used,buffer.length-used,null);if(!result.bytesRead)break;used+=result.bytesRead;}
      if(used>16384) throw Error("アシスタントの配布設定が大きすぎます");bytes=buffer.subarray(0,used);
    }
    finally {await file.close();}
  } catch(error) {if((error as NodeJS.ErrnoException).code==="ENOENT") return null; throw error;}
  const value=AssistantPackageSchema.parse(JSON.parse(bytes.toString("utf8")));
  for (const item of [value.current,value.previous]) if(item && (!isAbsolute(item.command[0]) || /[\x00-\x1f\x7f]/.test(item.command[0]))) throw Error("配布版のパスを確認してください");
  return value;
}

