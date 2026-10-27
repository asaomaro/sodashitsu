// Generated, private identity only. No trust of a real peer or desktop access.
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {DesktopEndpointStore} from "../../packages/client-core/dist/desktop/DesktopEndpointStore.node.js";
import {desktopWindowsPowerShell} from "../../packages/client-core/dist/desktop/DesktopWindowsPowerShell.node.js";
import {DesktopEndpointIdentity,DesktopEndpointHandshake} from "../../packages/client-core/dist/desktop/DesktopE2e.js";

const base=process.platform==="win32"?process.env.LOCALAPPDATA:tmpdir();
if(!base)throw Error("Generated fixture directory is unavailable");
const directory=await mkdtemp(join(base,"soda-node-identity-"));let store,reopened;
try{
  if(process.platform==="win32"){
    // Harden only this freshly-created fixture, never an existing user directory.
    const path=directory.replaceAll("'","''");
    const script=`$ErrorActionPreference='Stop';$path='${path}';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule);Set-Acl -LiteralPath $path -AclObject $acl`;
    const result=spawnSync(desktopWindowsPowerShell(),["-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],{windowsHide:true,encoding:"utf8",timeout:10000});
    if(result.status!==0)throw Error("Generated fixture permissions failed");
  }
  store=new DesktopEndpointStore({stateDir:directory});
  const initialized=await store.initialize(),permit=await store.localIdentity();
  if(await permit.identity.fingerprint()!==initialized.fingerprint)throw Error("Generated identity changed");
  store.close();await store.settled();if(permit.active())throw Error("Generated owner stayed active");
  reopened=new DesktopEndpointStore({stateDir:directory});
  const restored=await reopened.localIdentity();
  if(await restored.identity.fingerprint()!==initialized.fingerprint)throw Error("Generated identity changed");
  const provider=await DesktopEndpointIdentity.create(crypto),session=randomUUID();
  const agent=await DesktopEndpointHandshake.create(crypto,restored.identity,{session,role:"agent",peerRole:"provider",generation:1,expectedFingerprint:await provider.fingerprint()});
  const peer=await DesktopEndpointHandshake.create(crypto,provider,{session,role:"provider",peerRole:"agent",generation:1,expectedFingerprint:initialized.fingerprint});
  const ap=await agent.proof(peer.hello),pp=await peer.proof(agent.hello),left=await agent.finish(peer.hello,pp),right=await peer.finish(agent.hello,ap);
  try{
    const record=new TextEncoder().encode("generated agent message"),packet=await left.seal("agent",record),opened=await right.open("agent",packet);
    if(Buffer.from(packet).includes(Buffer.from(record))||!Buffer.from(opened).equals(Buffer.from(record)))throw Error("Generated encrypted record failed");
  }finally{left.close();right.close();}
  reopened.close();if(restored.active())throw Error("Generated owner stayed active");
  console.log("generated_node_local_identity_agent_handshake_pass");
}finally{
  store?.close();reopened?.close();await store?.settled();await reopened?.settled();
  await rm(directory,{recursive:true,force:true});
}
