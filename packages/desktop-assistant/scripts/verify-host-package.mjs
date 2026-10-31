// Build-time inspection of a generated soda package. Never install or execute it.
import {createHash} from "node:crypto";
import {lstat,readFile,readdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../../",import.meta.url));
export async function verifyAssistantHostPackage(packaged){
 const host=join(packaged,"packages/server/assets/assistant-host");
 const rootInfo=await lstat(host),manifestPath=join(host,"host-manifest.json"),manifestInfo=await lstat(manifestPath);
 if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||!manifestInfo.isFile()||manifestInfo.isSymbolicLink()||manifestInfo.size>131072)throw Error("Invalid internal resource inventory");
 const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
 if(manifest.version!==1||!Array.isArray(manifest.entries)||manifest.entries.length<15||manifest.entries.length>128)throw Error("Missing internal assistant resources");
 const expected=new Set(["host-manifest.json"]);
 for(const entry of manifest.entries){
  if(typeof entry.path!=="string"||entry.path.split("/").some(part=>!part||part===".."||part===".")||/[\\:\x00-\x1f]/.test(entry.path)||expected.has(entry.path))throw Error("Invalid internal resource path");
  expected.add(entry.path);
  const path=join(host,entry.path),info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size!==entry.bytes||info.size>16*1024*1024)throw Error("Internal assistant resource differs from its inventory");
  const bytes=await readFile(path);
  if(bytes.length!==entry.bytes||createHash("sha256").update(bytes).digest("hex")!==entry.sha256)throw Error("Internal assistant resource differs from its inventory");
 }
 const found=new Set();
 async function walk(directory,prefix=""){
  for(const name of await readdir(directory)){
   const path=join(directory,name),rel=prefix+name,info=await lstat(path);
   if(info.isSymbolicLink())throw Error("Unlisted or linked internal resource");
   if(info.isDirectory()){
    if(![...expected].some(entry=>entry.startsWith(rel+"/")))throw Error("Unlisted internal resource directory");
    await walk(path,rel+"/");
   }else if(info.isFile()&&expected.has(rel))found.add(rel);
   else throw Error("Unlisted internal resource");
  }
 }
 await walk(host);if(found.size!==expected.size)throw Error("Internal resource inventory is incomplete");
 const server=JSON.parse(await readFile(join(packaged,"packages/server/package.json"),"utf8"));
 if(server.dependencies["@sodashitsu/desktop-assistant"]!=="workspace:*")throw Error("Soda build dependency is missing");
 const desktop=JSON.parse(await readFile(join(packaged,"packages/desktop-assistant/package.json"),"utf8"));
 const runtime=JSON.parse(await readFile(join(packaged,"packages/server/assets/assistant-runtime.json"),"utf8"));
 if(runtime.version!==desktop.devDependencies.electron||!/^\d+\.\d+\.\d+$/.test(runtime.version)||!Array.isArray(runtime.entries)||runtime.entries.length!==6)throw Error("Fixed runtime catalog is missing");
 const variants=new Set();
 for(const entry of runtime.entries){
  const key=entry.platform+"-"+entry.arch;
  if(!["win32","darwin","linux"].includes(entry.platform)||!["x64","arm64"].includes(entry.arch)||variants.has(key)||entry.archive!==`electron-v${runtime.version}-${key}.zip`||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>512*1024*1024||!/^[a-f0-9]{64}$/.test(entry.sha256)||entry.entry!=={win32:"electron.exe",linux:"electron",darwin:"Electron.app/Contents/MacOS/Electron"}[entry.platform])throw Error("Invalid fixed runtime variant");
  variants.add(key);
 }
 return {internalAssistantResources:manifest.entries.length,commonRuntimeVariants:variants.size,executed:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error("No package paths or commands are accepted");
 const version=JSON.parse(await readFile(join(root,"package.json"),"utf8")).version;
 console.log(JSON.stringify(await verifyAssistantHostPackage(join(root,"release",`sodashitsu-${version}`))));
}
