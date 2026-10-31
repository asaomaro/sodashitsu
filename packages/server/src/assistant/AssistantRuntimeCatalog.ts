import {fileURLToPath} from "node:url";
import {boundedRuntimeJson,type RuntimeGuard} from "./AssistantRuntimeFiles.js";
import type {RuntimeArchiveSpec} from "./AssistantRuntimeDownload.js";
export type RuntimePlatform=RuntimeArchiveSpec["platform"];
export type RuntimeArchitecture=RuntimeArchiveSpec["arch"];
export interface RuntimeVariant extends RuntimeArchiveSpec{entry:string}
export const runtimeEntry=(platform:RuntimePlatform)=>({win32:"electron.exe",linux:"electron",darwin:"Electron.app/Contents/MacOS/Electron"})[platform];
export function validateRuntimeVariant(value:RuntimeVariant):void{
 if(!value||!/^\d+\.\d+\.\d+$/.test(value.version)||value.version.length>32||!["win32","darwin","linux"].includes(value.platform)||!["x64","arm64"].includes(value.arch)||value.archive!==`electron-v${value.version}-${value.platform}-${value.arch}.zip`||!Number.isSafeInteger(value.bytes)||value.bytes<22||value.bytes>512*1024*1024||!/^[a-f0-9]{64}$/.test(value.sha256)||value.entry!==runtimeEntry(value.platform))throw Error("Invalid fixed runtime variant");
}
/** No I/O at module load; the fixed first-party catalog is read only for preparation. */
export async function selectAssistantRuntime(platform:RuntimePlatform,arch:RuntimeArchitecture,guard:RuntimeGuard):Promise<RuntimeVariant>{
 const raw=await boundedRuntimeJson(fileURLToPath(new URL("../../assets/assistant-runtime.json",import.meta.url)),65536,guard) as {version?:unknown;entries?:unknown};
 if(!raw||typeof raw.version!=="string"||!Array.isArray(raw.entries)||raw.entries.length!==6)throw Error("Invalid fixed runtime catalog");
 const seen=new Set<string>(),variants:RuntimeVariant[]=[];
 for(const entry of raw.entries){const variant={...entry,version:raw.version} as RuntimeVariant;validateRuntimeVariant(variant);const key=variant.platform+"-"+variant.arch;if(seen.has(key))throw Error("Duplicate runtime variant");seen.add(key);variants.push(variant);}
 const variant=variants.find(entry=>entry.platform===platform&&entry.arch===arch);if(!variant)throw Error("Unsupported GUI runtime platform");return Object.freeze(variant);
}
