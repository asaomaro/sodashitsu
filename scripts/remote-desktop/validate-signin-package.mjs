// Creates only generated, non-executed staging assets under a private temp root.
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,rm,truncate,symlink,link} from "node:fs/promises";
import {join,dirname,isAbsolute} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {buildSigninPackage,signinPackagePaths} from "./build-signin-package.mjs";

const root=await mkdtemp(join(tmpdir(),"soda-signin-package-")),ownerSid="S-1-5-21-1-2-3-1001",revision="11111111-1111-4111-8111-111111111111";
let number=0;
const hash=value=>createHash("sha256").update(value).digest("hex");
const reject=async action=>{let error;try{await action();}catch(value){error=value;}assert(error instanceof Error,"Unsafe staging accepted");assert.equal(error.message,"Signin release staging is unavailable");assert.equal(error.cause,undefined);};
async function stage(){const directory=join(root,"stage-"+(++number));for(const path of signinPackagePaths){const file=join(directory,...path.split("/"));await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from("generated-only:"+path));}return directory;}
try {
  const directory=await stage(),result=await buildSigninPackage({directory,ownerSid,revision}),wire=await readFile(result.manifestPath,"utf8"),manifest=JSON.parse(wire);
  assert.equal(result.manifestSha256,hash(wire));assert.equal(result.revision,revision);
  assert.deepEqual(Object.keys(manifest),["entries","ownerSid","purpose","revision","version"]);
  assert.equal(manifest.purpose,"desktop-signin-package");assert.equal(manifest.version,1);assert.equal(manifest.ownerSid,ownerSid);
  assert.deepEqual(manifest.entries.map(entry=>entry.path),signinPackagePaths);
  for(const entry of manifest.entries){const bytes=await readFile(join(directory,...entry.path.split("/")));assert.deepEqual(Object.keys(entry),["bytes","path","sha256"]);assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,hash(bytes));}
  await reject(()=>buildSigninPackage({directory,ownerSid,revision}));assert.equal(await readFile(result.manifestPath,"utf8"),wire,"Existing manifest overwritten");
  for(const patch of [{directory:"relative"},{ownerSid:"S-1-5-18"},{ownerSid:"S-1-5-19"},{ownerSid:"S-1-5-20"},{ownerSid:"S-1-5-021-1"},{ownerSid:"private-invalid-owner"},{revision:""},{revision:"00000000-0000-0000-0000-000000000000"}]){const directory=await stage();await reject(()=>buildSigninPackage({directory,ownerSid,revision,...patch}));}
  for(const variant of ["extra-file","extra-dir","missing","directory","oversize","hardlink","junction"]){
    const directory=await stage(),file=join(directory,"bootstrap.mjs");
    if(variant==="extra-file")await writeFile(join(directory,"plugin.js"),"generated");
    if(variant==="extra-dir")await mkdir(join(directory,"node_modules"));
    if(variant==="missing"||variant==="directory")await rm(file);
    if(variant==="directory")await mkdir(file);
    if(variant==="oversize")await truncate(file,65537);
    if(variant==="hardlink")await link(file,join(root,"generated-link-"+number));
    if(variant==="junction"){
      const target=join(root,"generated-dir-"+number);await mkdir(target);for(const path of signinPackagePaths.filter(path=>path.startsWith("scripts/remote-desktop/")))await writeFile(join(target,path.split("/").at(-1)),Buffer.from("generated-only:"+path));
      const path=join(directory,"scripts","remote-desktop");await rm(path,{recursive:true});await symlink(target,path,"junction");
    }
    await reject(()=>buildSigninPackage({directory,ownerSid,revision}));
  }
  if(process.argv.length>2){assert.equal(process.argv[2],"--fixture");assert.equal(process.argv.length,4);assert(isAbsolute(process.argv[3]));await writeFile(process.argv[3],wire,{encoding:"utf8",flag:"wx"});}
  console.log("signin_package_generated_staging_manifest_passed");
}finally{await rm(root,{recursive:true,force:true});}
