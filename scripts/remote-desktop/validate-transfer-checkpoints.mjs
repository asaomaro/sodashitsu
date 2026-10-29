// Generated local files and disposable server processes only. Never captures,
// injects input, changes a service, or edits an existing user's permissions.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash,randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {syncBuiltinESMExports} from "node:module";
import {fileURLToPath} from "node:url";
import {DesktopTransferStore} from "../../packages/server/dist/desktop/DesktopTransferStore.js";
import {DesktopFileCheckpoints} from "../../packages/server/dist/desktop/DesktopFileCheckpoints.js";
import {DesktopFiles} from "../../packages/server/dist/desktop/DesktopFiles.js";
import {desktopWindowsPowerShell} from "../../packages/client-core/dist/desktop/DesktopWindowsPowerShell.node.js";
const sha=b=>createHash("sha256").update(b).digest("hex"),script=fileURLToPath(import.meta.url);
async function open(base){const root=join(base,"files"),store=new DesktopTransferStore({directory:join(base,"records"),binding:"a".repeat(64)}),registry=new DesktopFileCheckpoints(store),files=await DesktopFiles.open(root,()=>true,registry);return{root,store,registry,files,run:request=>files.run({type:"desktop_file",id:randomUUID(),request})};}
if(process.argv[2]==="--child"){
 const base=process.argv[3],phase=process.argv[4],f=await open(base),download=phase==="download",data=download?Buffer.alloc(70000,7):Buffer.from("abcdef");
 if(download)await fs.writeFile(join(f.root,"source"),data);await f.run({action:"grant",enabled:true});
 const start=await f.run(download?{action:"checkpoint_download",path:"source"}:{action:"checkpoint_upload",path:"saved",bytes:data.length,sha256:sha(data)});assert.equal(start.ok,true);const checkpoint=start.result.checkpoint;await fs.writeFile(join(base,"token.json"),JSON.stringify({checkpoint,sha256:sha(data)}),{mode:0o600});
 if(download){assert.equal((await f.run({action:"checkpoint_read",checkpoint,offset:0})).ok,true);process.exit(86);}
 assert.equal((await f.run({action:"checkpoint_write",checkpoint,offset:0,data:data.subarray(0,3).toString("base64")})).ok,true);if(phase==="data-ack")process.exit(86);
 assert.equal((await f.run({action:"checkpoint_write",checkpoint,offset:3,data:data.subarray(3).toString("base64")})).ok,true);
 if(phase==="before-link"||phase==="after-link"){const link=fs.link;fs.link=async(...args)=>{if(phase==="before-link")process.exit(86);const value=await link(...args);process.exit(86);return value;};syncBuiltinESMExports();}
 if(phase==="after-unlink"){const unlink=fs.unlink;fs.unlink=async(path,...args)=>{const value=await unlink(path,...args);if(String(path).includes(".soda-transfer-"))process.exit(86);return value;};syncBuiltinESMExports();}
 if(phase==="receipt"){const persist=f.registry.persist.bind(f.registry);f.registry.persist=async(job)=>{await persist(job);if(job.receipt)process.exit(86);};}
 await f.run({action:"checkpoint_finish",checkpoint});throw Error("Generated child missed its crash boundary");
}
const base=process.platform==="win32"?process.env.LOCALAPPDATA:tmpdir();if(!base)throw Error("Generated fixture directory unavailable");const directory=await fs.mkdtemp(join(base,"soda-transfer-process-"));
try{
 if(process.platform==="win32"){
  // Only this new disposable fixture gets a private inheritable ACL.
  const path=directory.replaceAll("'","''"),source=`$ErrorActionPreference='Stop';$path='${path}';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $path -AclObject $acl`;
  const result=spawnSync(desktopWindowsPowerShell(),["-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(source,"utf16le").toString("base64")],{windowsHide:true,encoding:"utf8",timeout:15000});assert.equal(result.status,0,"Generated private fixture ACL failed");
 }
 for(const phase of["data-ack","before-link","after-link","after-unlink","receipt","download"]){
  const path=join(directory,phase);await fs.mkdir(path,{mode:0o700});await fs.mkdir(join(path,"files"),{mode:0o700});const child=spawnSync(process.execPath,[script,"--child",path,phase],{windowsHide:true,encoding:"utf8",timeout:45000});assert.equal(child.status,86,`Generated ${phase} boundary failed: ${child.stderr}`);
  const {checkpoint,sha256}=JSON.parse(await fs.readFile(join(path,"token.json"),"utf8")),f=await open(path);
  try{
   assert.equal((await f.run({action:"checkpoint_attach",checkpoint,offset:0})).ok,false,"Restored an old grant");assert.equal((await f.run({action:"grant",enabled:true})).ok,true);
   const attached=await f.run({action:"checkpoint_attach",checkpoint,offset:phase==="download"?65536:0});assert.equal(attached.ok,true,attached.message);
   if(phase==="download"){assert.equal(attached.result.offset,65536);const part=await f.run({action:"checkpoint_read",checkpoint,offset:65536});assert.equal(part.ok,true);assert.equal(part.result.sha256,sha256);assert.equal(part.result.done,true);}
   else{if(phase==="data-ack"){assert.equal(attached.result.offset,3);assert.equal((await f.run({action:"checkpoint_write",checkpoint,offset:3,data:"ZGVm"})).ok,true);}assert.equal((await f.run({action:"checkpoint_finish",checkpoint})).ok,true);assert.equal(await fs.readFile(join(f.root,"saved"),"utf8"),"abcdef");assert.equal((await fs.lstat(join(f.root,"saved"))).nlink,1);assert.deepEqual((await fs.readdir(f.root)).filter(n=>n.startsWith(".soda-transfer-")),[]);}
   console.log("generated_transfer_process_boundary_"+phase.replaceAll("-","_")+"_pass");
  }finally{await f.files.close();await f.registry.suspend();}
 }
 console.log("generated_transfer_restart_new_grant_exact_prefix_publication_and_receipt_pass");
}finally{await fs.rm(directory,{recursive:true,force:true});}
