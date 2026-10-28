// Build-time only. Never starts the bundle, native worker, server or installer.
import {rolldown} from "rolldown";
import {isBuiltin} from "node:module";
import {fileURLToPath} from "node:url";
import {mkdir,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
export async function buildSigninBundle(){
 const entry=fileURLToPath(new URL("../../packages/server/src/signin/main.ts",import.meta.url));
 const bundle=await rolldown({input:entry,platform:"node",external:isBuiltin,transform:{define:{"import.meta.url":"__soda_bundle_url","process.env.WS_NO_BUFFER_UTIL":'"1"',"process.env.WS_NO_UTF_8_VALIDATE":'"1"'}},onwarn:warning=>{throw new Error("Signin bundle warning: "+warning.code);}});
 try{
  const {output}=await bundle.generate({format:"cjs",exports:"named",polyfillRequire:false,inlineDynamicImports:true,sourcemap:false,minify:false});
  if(output.length!==1||output[0].type!=="chunk"||output[0].imports.some(id=>!isBuiltin(id))||output[0].dynamicImports.length)throw new Error("Signin bundle must be self-contained");
  const code=output[0].code;if(!code||Buffer.byteLength(code)>16777216||code.includes("import.meta"))throw new Error("Signin bundle exceeds its contract");return code;
 }finally{await bundle.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw new Error("No bundle paths or commands are accepted");
 const target=fileURLToPath(new URL("../../packages/server/dist/signin/main.bundle.cjs",import.meta.url));
 const code=await buildSigninBundle();await mkdir(dirname(target),{recursive:true});await writeFile(target,code,{mode:0o600});process.stdout.write("signin_bundle_built_no_execution\n");
}
