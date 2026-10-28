// Mutate exact copies of the production scripts in a private generated folder.
// Each child only runs the generated validators; no real package is launched.
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";

const root=await mkdtemp(join(tmpdir(),"soda-signin-node-negative-"));
const files=["signin-bootstrap.mjs","build-signin-package.mjs","validate-signin-bootstrap.mjs","validate-signin-package.mjs"];
const original=new Map();
const env={};for(const name of ["PATH","SystemRoot","SYSTEMROOT","WINDIR","TEMP","TMP","TMPDIR"])if(process.env[name])env[name]=process.env[name];
const run=(validator,flags=[])=>spawnSync(process.execPath,[...flags,join(root,validator)],{cwd:root,env,encoding:"utf8",timeout:15000,maxBuffer:1048576});
const recipes=[
  {name:"builtin-set",file:files[0],validator:files[2],patches:[['if(!builtins.has(name))throw failure();','',1]]},
  {name:"external-fallback",file:files[0],validator:files[2],patches:[['if(!builtins.has(name))throw failure();','',1],['return nativeRequire("node:"+name);','return nativeRequire(name);',1]]},
  {name:"dynamic-import",file:files[0],validator:files[2],flags:["--experimental-vm-modules"],patches:[['importModuleDynamically:()=>Promise.reject(failure())','importModuleDynamically:specifier=>import(specifier)',1]]},
  {name:"main-once",file:files[0],validator:files[2],patches:[['if(started)throw failure();','',1]]},
  {name:"source-budget",file:files[0],validator:files[2],patches:[['Buffer.byteLength(source,"utf8")>16777216','false',1]]},
  {name:"diagnostics",file:files[0],validator:files[2],flags:["--experimental-vm-modules"],patches:[['catch{throw failure();}','catch(error){throw error;}',4]]},
  {name:"staging-owner",file:files[1],validator:files[3],patches:[['!validOwner(ownerSid)','false',1]]},
  {name:"staging-inventory",file:files[1],validator:files[3],patches:[['if(!directories.has(join(path,name))&&!files.has(join(path,name)))throw failure();','if(false)throw failure();',1]]},
  {name:"staging-file-budget",file:files[1],validator:files[3],patches:[['before.size>signinPackageMaximum(path)','false',1]]},
  {name:"staging-hardlink",file:files[1],validator:files[3],patches:[['before.nlink!==1||','',1],['&&b.nlink===1','',1]]},
  {name:"staging-no-overwrite",file:files[1],validator:files[3],patches:[['if(!directories.has(join(path,name))&&!files.has(join(path,name)))throw failure();','if(name!=="signin-package.json"&&!directories.has(join(path,name))&&!files.has(join(path,name)))throw failure();',1],['open(manifestPath,"wx",0o600)','open(manifestPath,"w",0o600)',1]]},
];
try {
  for(const file of files){const bytes=await readFile(new URL("./"+file,import.meta.url));original.set(file,bytes);await writeFile(join(root,file),bytes);}
  for(const recipe of recipes){
    let text=original.get(recipe.file).toString("utf8");
    for(const [before,after,count] of recipe.patches){assert.equal(text.split(before).length-1,count,"Source mutation guard: "+recipe.name);text=text.split(before).join(after);}
    try {
      await writeFile(join(root,recipe.file),text);
      const result=run(recipe.validator,recipe.flags),output=result.stdout+result.stderr;
      console.log("negative "+recipe.name+"\n"+output);
      assert.equal(result.error,undefined,"Negative child failed before assertion: "+recipe.name);
      assert.equal(result.status,1,"Negative did not exit with an assertion failure: "+recipe.name);
      assert.equal(result.signal,null,"Negative was interrupted: "+recipe.name);
      assert(output.includes("AssertionError"),"Negative did not reach an assertion: "+recipe.name);
      assert(output.includes(recipe.validator===files[2]?"Unsafe generated bundle accepted":"Unsafe staging accepted")||recipe.name==="diagnostics"&&output.includes("private-generated-diagnostic"),"Wrong assertion: "+recipe.name);
    }finally{await writeFile(join(root,recipe.file),original.get(recipe.file));assert.deepEqual(await readFile(join(root,recipe.file)),original.get(recipe.file));}
  }
  for(const validator of [files[2],files[3]]){const result=run(validator);console.log(result.stdout+result.stderr);assert.equal(result.status,0,"Restored source failed");assert.equal(result.error,undefined);}
  console.log("signin_node_source_negative_controls_and_restore_passed");
}finally{await rm(root,{recursive:true,force:true});}
