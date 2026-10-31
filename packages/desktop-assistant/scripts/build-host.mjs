// Build resources for soda's internal GUI role. Never starts Electron or an agent.
import {rolldown} from "rolldown";
import {isBuiltin} from "node:module";
import {createHash,randomUUID} from "node:crypto";
import {lstat,mkdir,readFile,readdir,rename,rm,writeFile} from "node:fs/promises";
import {dirname,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../../",import.meta.url));
const target=join(root,"packages/server/assets/assistant-host");
const external=id=>id==="electron"||isBuiltin(id);
async function bundle(input,format){
 const build=await rolldown({input,platform:"node",external,
  transform:{define:{"process.env.WS_NO_BUFFER_UTIL":'"1"',"process.env.WS_NO_UTF_8_VALIDATE":'"1"'}},
  onwarn:warning=>{throw Error("Assistant host bundle warning: "+warning.code);}});
 try{
  const {output}=await build.generate({format,codeSplitting:false,sourcemap:false,minify:false,
   ...(format==="esm"?{banner:'import {createRequire as __sodaCreateRequire} from "node:module";const require=__sodaCreateRequire(import.meta.url);'}:{})});
  if(output.length!==1||output[0].type!=="chunk"||output[0].dynamicImports.length||output[0].imports.some(id=>!external(id)))throw Error("Assistant host must not depend on workspace node_modules");
  if(!output[0].code||Buffer.byteLength(output[0].code)>16*1024*1024)throw Error("Assistant host bundle exceeds its limit");
  return {code:output[0].code,modules:Object.keys(output[0].modules)};
 }finally{await build.close();}
}
/** Output may be injected by build-time tests only. Runtime never accepts resource paths from RPC. */
export async function buildAssistantHost(output=target){
 const parent=dirname(output);await mkdir(parent,{recursive:true});
 const stage=join(parent,`.assistant-host-${randomUUID()}`);await mkdir(stage,{mode:0o700});
 const entries=[];
 async function save(name,bytes){
  if(entries.length>=128||bytes.byteLength>16*1024*1024)throw Error("Assistant resource limits exceeded");
  const path=join(stage,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:"wx",mode:0o600});
  entries.push({path:name,bytes:bytes.byteLength,sha256:createHash("sha256").update(bytes).digest("hex")});
 }
 async function assets(directory){
  for(const item of await readdir(directory,{withFileTypes:true})){
   const path=join(directory,item.name);const info=await lstat(path);
   if(info.isSymbolicLink())throw Error("Assistant assets must not contain links");
   if(info.isDirectory())await assets(path);
   else if(info.isFile()){if(info.size>16*1024*1024)throw Error("Assistant resource limit exceeded");await save("assets/"+relative(join(root,"packages/desktop-assistant/assets"),path).split("\\").join("/"),await readFile(path));}
   else throw Error("Unsupported assistant asset");
  }
 }
 try{
  const main=await bundle(join(root,"packages/desktop-assistant/dist/main.js"),"esm");
  const preload=await bundle(join(root,"packages/desktop-assistant/dist/preload.cjs"),"cjs");
  await save("dist/main.mjs",Buffer.from(main.code));
  await save("dist/preload.cjs",Buffer.from(preload.code));
  const packages=new Set();
  for(const id of [...main.modules,...preload.modules]){
   const normalized=id.replaceAll("\\","/"),marker="/node_modules/",at=normalized.lastIndexOf(marker);
   if(at<0)continue;
   const pieces=normalized.slice(at+marker.length).split("/");
   const name=pieces[0].startsWith("@")?pieces.slice(0,2).join("/"):pieces[0];
   packages.add(normalized.slice(0,at+marker.length)+name);
  }
  let notices=(await readFile(join(root,"LICENSE"),"utf8"))+"\n\n"+(await readFile(join(root,"NOTICE"),"utf8"));
  for(const directory of [...packages].sort()){
   const pkg=JSON.parse(await readFile(join(directory,"package.json"),"utf8"));
   const licenses=(await readdir(directory)).filter(name=>/^licen[cs]e(?:\..*)?$/i.test(name));
   if(!licenses.length)throw Error("Bundled dependency is missing its license: "+pkg.name);
   notices+="\n\n--- "+pkg.name+"@"+pkg.version+" ---\n";
   for(const name of licenses){const path=join(directory,name),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>131072)throw Error("Invalid bundled license");notices+=await readFile(path,"utf8");}
  }
  await save("THIRD_PARTY_NOTICES.txt",Buffer.from(notices));
  await assets(join(root,"packages/desktop-assistant/assets"));
  await save("package.json",Buffer.from(JSON.stringify({name:"sodashitsu-assistant-host",productName:"Sodashitsu Assistant",version:"0.1.0",private:true,type:"module",main:"dist/main.mjs"})+"\n"));
  await writeFile(join(stage,"host-manifest.json"),JSON.stringify({version:1,entries:entries.sort((a,b)=>a.path.localeCompare(b.path))})+"\n",{flag:"wx",mode:0o600});
  // This is a generated build directory, never a user-selected installation.
  const old=await lstat(output).catch(error=>{if(error.code!=="ENOENT")throw error;return null;});
  if(old?.isSymbolicLink()||old&&!old.isDirectory())throw Error("Assistant build output must be a directory without links");
  if(old)await rm(output,{recursive:true});
  await rename(stage,output);
  return {directory:output,entries};
 }finally{await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error("No output paths or commands are accepted");
 await buildAssistantHost();process.stdout.write("assistant_internal_resources_built_no_execution\n");
}
