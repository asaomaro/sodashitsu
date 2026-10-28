// Generated ordinary Node code only. No installed package, credentials or OS IO.
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL,fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";

const root=await mkdtemp(join(tmpdir(),"soda-signin-bootstrap-"));
const failure="Signin agent is unavailable";
const reject=async action=>{
  let error;try{await action();}catch(value){error=value;}
  assert(error instanceof Error,"Unsafe generated bundle accepted");
  assert.equal(error.message,failure);assert.equal(error.cause,undefined);
  assert(!String(error.stack).includes("private-generated-diagnostic"));
};
try {
  // Import an exact copy at the installed layout, so a broken fallback really
  // could resolve the generated parent node_modules fixture below.
  const pkg=join(root,"package"),bootstrap=join(pkg,"bootstrap.mjs"),filename=join(pkg,"packages","server","dist","signin","main.bundle.cjs");
  await mkdir(dirname(filename),{recursive:true});
  const original=await readFile(new URL("./signin-bootstrap.mjs",import.meta.url));await writeFile(bootstrap,original);assert.deepEqual(await readFile(bootstrap),original);
  const {loadSigninBundle,runInstalledSigninAgent}=await import(pathToFileURL(bootstrap).href);
  const load=source=>loadSigninBundle(source,filename);
  const entry=load('exports.main=()=>require("node:crypto").createHash("sha256").update("generated").digest("hex");');
  assert(Object.isFrozen(entry));assert.equal(await entry.main(),createHash("sha256").update("generated").digest("hex"));await reject(()=>entry.main());
  assert.equal(await load('module.exports={main:()=>typeof require("crypto").randomBytes};').main(),"function");
  const location=await load('exports.main=()=>({filename:__filename,dirname:__dirname,url:__soda_bundle_url,helper:new URL("../../../../scripts/remote-desktop/read-signin-enrollment.ps1",__soda_bundle_url).href});').main();
  assert.deepEqual(location,{filename,dirname:dirname(filename),url:pathToFileURL(filename).href,helper:pathToFileURL(join(pkg,"scripts","remote-desktop","read-signin-enrollment.ps1")).href});
  const trap=join(root,"node_modules","soda-signin-generated-trap","index.js");await mkdir(dirname(trap),{recursive:true});
  await writeFile(trap,'globalThis.__sodaSigninGeneratedTrap=true;module.exports="generated trap";');
  const baselineRequire=createRequire(filename);assert.equal(baselineRequire("soda-signin-generated-trap"),"generated trap");delete baselineRequire.cache[baselineRequire.resolve("soda-signin-generated-trap")];delete globalThis.__sodaSigninGeneratedTrap;
  for(const name of ["soda-signin-generated-trap","node:module","module","node:vm","vm","../plugin.js",trap,"node:fs/../module","constructor","__proto__"])
    await reject(()=>load('exports.main=()=>require('+JSON.stringify(name)+');').main());
  assert.equal(globalThis.__sodaSigninGeneratedTrap,undefined,"Unregistered dependency executed");
  await reject(()=>load('exports.main=()=>import("soda-signin-generated-trap");').main());
  assert.equal(globalThis.__sodaSigninGeneratedTrap,undefined);
  for(const source of ['throw Error("private-generated-diagnostic");','exports.main=()=>{throw Error("private-generated-diagnostic");};','exports.main=async()=>{throw Error("private-generated-diagnostic");};','module.exports={get main(){throw Error("private-generated-diagnostic");}};','exports.main=1;','{invalid syntax'])await reject(()=>load(source).main());
  await reject(()=>load("/*"+"あ".repeat(6000000)+"*/exports.main=()=>true;"));
  await writeFile(filename,'exports.main=()=>{globalThis.__sodaSigninGeneratedMain="loaded";};');
  await runInstalledSigninAgent();assert.equal(globalThis.__sodaSigninGeneratedMain,"loaded");delete globalThis.__sodaSigninGeneratedMain;
  await writeFile(filename,Buffer.from([0xff]));await reject(runInstalledSigninAgent);
  await writeFile(filename,'exports.main=()=>{throw Error("private-generated-diagnostic");};');
  const env={};for(const name of ["SystemRoot","SYSTEMROOT","WINDIR","PATH"])if(process.env[name])env[name]=process.env[name];
  const child=spawnSync(process.execPath,[bootstrap],{encoding:"utf8",timeout:5000,maxBuffer:65536,env});
  assert.equal(child.status,1);assert.equal(child.stdout,"");assert.equal(child.stderr,"Signin agent is unavailable\n");
  console.log("signin_bootstrap_generated_builtin_only_no_fallback_passed");
}finally{delete globalThis.__sodaSigninGeneratedTrap;delete globalThis.__sodaSigninGeneratedMain;await rm(root,{recursive:true,force:true});}
