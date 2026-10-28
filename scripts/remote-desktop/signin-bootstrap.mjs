// Installed bootstrap only: the native SYSTEM host must verify and retain the
// whole package before starting Node. This is NOT a sandbox for malicious code.
import {createRequire} from "node:module";
import {Script} from "node:vm";
import {open} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const nativeRequire=createRequire(import.meta.url);
const builtins=new Set([
  "assert","assert/strict","buffer","child_process","crypto","events","fs","fs/promises","http","https","net","os","path","path/posix","path/win32","perf_hooks","querystring","stream","stream/promises","stream/web","string_decoder","timers","timers/promises","tls","tty","url","util","util/types","zlib",
]);
const failure=()=>new Error("Signin agent is unavailable");

/** Evaluate already verified bundled CJS with only builtin module resolution.
 * Do not expose source/filename through RPC or use this as an untrusted-code VM.
 * The release bundler must replace import.meta.url with __soda_bundle_url. */
export function loadSigninBundle(source,filename) {
  try {
    if(typeof source!=="string"||Buffer.byteLength(source,"utf8")>16777216||typeof filename!=="string"||!filename)throw failure();
    const requireBuiltin=specifier=>{
      if(typeof specifier!=="string")throw failure();
      const name=specifier.startsWith("node:")?specifier.slice(5):specifier;
      if(!builtins.has(name))throw failure();
      return nativeRequire("node:"+name);
    };
    const module=Object.assign(Object.create(null),{exports:{},filename});
    const script=new Script("(function(require,module,exports,__filename,__dirname,__soda_bundle_url){\"use strict\";\n"+source+"\n})",{filename,importModuleDynamically:()=>Promise.reject(failure())});
    const run=script.runInThisContext();
    run(requireBuiltin,module,module.exports,filename,dirname(filename),pathToFileURL(filename).href);
    const main=module.exports?.main;
    if(typeof main!=="function")throw failure();
    let started=false;
    return Object.freeze({main:async()=>{if(started)throw failure();started=true;try{return await main();}catch{throw failure();}}});
  }catch{throw failure();}
}

/** The installed asset is copied to <fixed package>/bootstrap.mjs. Native
 * verification, not this path computation, establishes trust in its contents. */
export async function runInstalledSigninAgent() {
  const root=dirname(fileURLToPath(import.meta.url));
  const filename=join(root,"packages","server","dist","signin","main.bundle.cjs");
  let file;
  try {
    file=await open(filename,"r");
    const before=await file.stat();
    if(!before.isFile()||before.size<1||before.size>16777216)throw failure();
    const bytes=Buffer.alloc(before.size);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,null);if(!bytesRead)throw failure();offset+=bytesRead;}
    const extra=Buffer.alloc(1);if((await file.read(extra,0,1,null)).bytesRead)throw failure();
    const after=await file.stat();
    if(bytes.length!==before.size||after.size!==before.size||after.dev!==before.dev||after.ino!==before.ino||after.mtimeMs!==before.mtimeMs)throw failure();
    const source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    await loadSigninBundle(source,filename).main();
  }catch{throw failure();}finally{if(file)try{await file.close();}catch{throw failure();}}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const stop=()=>{process.stderr.write("Signin agent is unavailable\n");process.exit(1);};
  process.once("uncaughtException",stop);
  process.once("unhandledRejection",stop);
  void runInstalledSigninAgent().catch(stop);
}
