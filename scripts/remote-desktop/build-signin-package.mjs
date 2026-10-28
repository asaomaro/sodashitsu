// Release staging only. Does not install, repair ACLs, start services or trust a
// local build. The future administrator installer must pin/review this manifest.
import {constants} from "node:fs";
import {lstat,open,readdir} from "node:fs/promises";
import {resolve,join,dirname,isAbsolute,parse} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash,randomUUID} from "node:crypto";

export const signinPackagePaths=Object.freeze([
  "DesktopSigninService.exe","DesktopSigninWorker.exe","bootstrap.mjs","node.exe","packages/server/dist/signin/main.bundle.cjs",
  "scripts/remote-desktop/EndpointAclPolicy.ps1","scripts/remote-desktop/SigninAclPolicy.ps1","scripts/remote-desktop/WindowsSigninVault.cs",
  "scripts/remote-desktop/check-endpoint-acl.ps1","scripts/remote-desktop/protect-endpoint-key.ps1","scripts/remote-desktop/read-signin-enrollment.ps1",
        "scripts/remote-desktop/SigninAdminStorage.ps1",
        "scripts/remote-desktop/WindowsSigninAdminEnvelope.cs",
        "scripts/remote-desktop/WindowsSigninAdminJournal.cs",
        "scripts/remote-desktop/WindowsSigninAdminDeadline.cs",
        "scripts/remote-desktop/WindowsSigninAdminResult.cs",
        "scripts/remote-desktop/WindowsSigninAdminEnrollment.cs",
        "scripts/remote-desktop/WindowsSigninAdminPersistence.cs",
        "scripts/remote-desktop/read-signin-admin.ps1",
        "scripts/remote-desktop/write-signin-admin-result.ps1",
        "scripts/remote-desktop/commit-signin-vault.ps1",
        "scripts/remote-desktop/write-signin-enrollment.ps1",
]);
export function signinPackageMaximum(path) {
  if(!signinPackagePaths.includes(path))throw failure();
  if(path==="node.exe")return 268435456;
  if(path==="DesktopSigninService.exe"||path==="DesktopSigninWorker.exe")return 33554432;
  if(path==="packages/server/dist/signin/main.bundle.cjs")return 16777216;
  if(path==="bootstrap.mjs")return 65536;
  return 1048576;
}
const failure=()=>new Error("Signin release staging is unavailable");
const validOwner=owner=>{
  if(typeof owner!=="string"||owner.length>184||!/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(owner)||["S-1-5-18","S-1-5-19","S-1-5-20"].includes(owner))return false;
  return owner.split("-").slice(2).every((value,index)=>/^(?:0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=(index===0?0xffffffffffff:0xffffffff));
};
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&b.isFile()&&!b.isSymbolicLink()&&b.nlink===1;

/** Local explicit staging input, never remote RPC. An output manifest is data,
 * not approval to execute this directory as SYSTEM. Existing files are kept. */
export async function buildSigninPackage(options={}) {
  try {
    const {directory,ownerSid,revision=randomUUID()}=options??{};
    if(typeof directory!=="string"||!isAbsolute(directory)||!validOwner(ownerSid)||typeof revision!=="string"||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(revision)||revision==="00000000-0000-0000-0000-000000000000")throw failure();
    const root=resolve(directory);if(root===parse(root).root)throw failure();
    const directories=new Set([root]),files=new Set(signinPackagePaths.map(path=>join(root,...path.split("/"))));
    for(const file of files){let current=dirname(file);while(current!==root){directories.add(current);const parent=dirname(current);if(parent===current)throw failure();current=parent;}}
    for(const path of directories){const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isDirectory())throw failure();}
    for(const path of directories)for(const name of await readdir(path))if(!directories.has(join(path,name))&&!files.has(join(path,name)))throw failure();
    const entries=[];let total=0;
    for(const path of signinPackagePaths){
      const absolute=join(root,...path.split("/")),before=await lstat(absolute);
      if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>signinPackageMaximum(path)||(total+=before.size)>335544320)throw failure();
      const file=await open(absolute,constants.O_RDONLY|(process.platform==="win32"?0:constants.O_NOFOLLOW));
      try {
        if(!same(before,await file.stat()))throw failure();
        const hash=createHash("sha256"),buffer=Buffer.alloc(65536);let read=0;
        while(read<before.size){const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,before.size-read),null);if(!bytesRead)throw failure();hash.update(buffer.subarray(0,bytesRead));read+=bytesRead;}
        if((await file.read(buffer,0,1,null)).bytesRead||!same(before,await file.stat())||!same(before,await lstat(absolute)))throw failure();
        entries.push({bytes:read,path,sha256:hash.digest("hex")});
      }finally{await file.close();}
    }
    const manifest=JSON.stringify({entries,ownerSid,purpose:"desktop-signin-package",revision,version:1});
    if(Buffer.byteLength(manifest,"utf8")>32768)throw failure();
    const manifestPath=join(root,"signin-package.json"),output=await open(manifestPath,"wx",0o600);
    try{await output.writeFile(manifest,"utf8");await output.sync();}finally{await output.close();}
    return {manifestPath,manifestSha256:createHash("sha256").update(manifest).digest("hex"),revision};
  }catch{throw failure();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const options={},keys=new Map([["--directory","directory"],["--owner-sid","ownerSid"],["--revision","revision"]]);let valid=true;
  for(let i=2;i<process.argv.length;i+=2){const key=keys.get(process.argv[i]);if(!key||options[key]!==undefined||!process.argv[i+1]){valid=false;break;}options[key]=process.argv[i+1];}
  try{if(!valid)throw failure();console.log(JSON.stringify(await buildSigninPackage(options)));}catch{process.stderr.write("Signin release staging is unavailable\n");process.exitCode=1;}
}
