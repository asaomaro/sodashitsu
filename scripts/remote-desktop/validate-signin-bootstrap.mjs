// Temporary, unprivileged Node fixtures only. No installed package or OS input.
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
const root=await mkdtemp(join(tmpdir(),"soda-signin-bootstrap-"));
try {
 const bootstrap=join(root,"bootstrap.mjs"),filename=join(root,"packages","server","dist","signin","main.bundle.cjs");
 await mkdir(dirname(filename),{recursive:true});
 await writeFile(bootstrap,await readFile(new URL("./signin-bootstrap.mjs",import.meta.url)));
 const run=()=>spawnSync(process.execPath,[bootstrap],{encoding:"utf8",timeout:5000,maxBuffer:65536});
 await writeFile(filename,'exports.main=()=>{process.stdout.write(require("node:crypto").createHash("sha256").update("generated").digest("hex"));};');
 let child=run();assert.equal(child.status,0);assert.equal(child.stderr,"");assert.equal(child.stdout,createHash("sha256").update("generated").digest("hex"));
 for(const source of ['throw Error("private-generated-diagnostic");','exports.main=()=>{throw Error("private-generated-diagnostic");};','exports.main=async()=>{throw Error("private-generated-diagnostic");};','exports.main=1;','{invalid syntax']){
  await writeFile(filename,source);child=run();assert.equal(child.status,1);assert.equal(child.stdout,"");assert.equal(child.stderr,"Signin agent is unavailable\n");
 }
 console.log("signin_bootstrap_standard_node_loader_passed");
}finally{await rm(root,{recursive:true,force:true});}
