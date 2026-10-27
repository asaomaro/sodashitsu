// Generated private CLI fixture only; no real identity/trust/desktop access.
import {mkdtemp,rm,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {desktopWindowsPowerShell} from "../../packages/client-core/dist/desktop/DesktopWindowsPowerShell.node.js";
import {spawnSync} from "node:child_process";
const base=process.platform==="win32"?process.env.LOCALAPPDATA:tmpdir();
if(!base)throw Error("Generated fixture directory unavailable");
const root=await mkdtemp(join(base,"soda-cli-identity-"));let requests=0;
const trap=createServer((_req,res)=>{requests++;res.writeHead(500);res.end();});trap.listen(0,"127.0.0.1");await once(trap,"listening");
try{
 if(process.platform==="win32"){
  const path=root.replaceAll("'","''");
  const script=`$ErrorActionPreference='Stop';$path='${path}';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $path -AclObject $acl`;
  const result=spawnSync(desktopWindowsPowerShell(),["-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],{windowsHide:true,encoding:"utf8",timeout:10000});
  if(result.status!==0)throw Error("Generated private ACL failed");
 }
 const identityDir=join(root,"nested","state"),url=`http://127.0.0.1:${trap.address().port}`;
 async function run(initialize){
  const child=spawn(process.execPath,[resolve("packages/cli/dist/main.js"),"desktop","identity","--identity-dir",identityDir,...(initialize?["--initialize"]:[])],{env:{...process.env,HOME:root,USERPROFILE:root,SODA_URL:url,SODA_TOKEN:"invalid-generated-token",SODA_DESKTOP_GRANT:"invalid-generated-grant"},stdio:["ignore","pipe","pipe"],windowsHide:true});
  let stdout="",stderr="";child.stdout.on("data",data=>stdout+=data);child.stderr.on("data",data=>stderr+=data);const timeout=setTimeout(()=>child.kill(),30000);
  try{const [code]=await once(child,"close");if(code!==0)throw Error(`Generated CLI failed (${code}): ${stderr}`);return JSON.parse(stdout);}finally{clearTimeout(timeout);}
 }
 const absent=await run(false);if(JSON.stringify(absent)!==JSON.stringify({initialized:false,role:"agent"})||(await readdir(root)).length)throw Error("Readonly CLI state mismatch: "+JSON.stringify({absent,files:await readdir(root)}));
 const first=await run(true),second=await run(false),third=await run(true);
 if(first.initialized!==true||first.role!=="agent"||!/^[a-f0-9]{64}$/.test(first.fingerprint)||Object.keys(first).sort().join(",")!=="fingerprint,initialized,role"||JSON.stringify(first)!==JSON.stringify(second)||JSON.stringify(first)!==JSON.stringify(third))throw Error("Generated CLI public identity changed");
 if(requests!==0)throw Error("Local identity command contacted Root");
 console.log("generated_cli_identity_readonly_stable_no_network_pass");
}finally{await new Promise(resolve=>trap.close(resolve));await rm(root,{recursive:true,force:true});}
