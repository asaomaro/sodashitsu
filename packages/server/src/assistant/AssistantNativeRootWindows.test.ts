import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it} from 'vitest';
import {desktopOwnedChild} from '@sodashitsu/client-core/desktop/DesktopOwnedChild.node';
import {desktopWindowsPowerShell} from '@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node';
// The script's filesystem/ACL cmdlets are in-memory adapters. No root/ACL/GUI is changed.
it.skipIf(process.platform!=='win32')('validates Windows root policy with generated ACLs and rejects a replaceable ancestor',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'soda-root-policy-'));
 try{
  const policy=await readFile(new URL('../../../../scripts/remote-desktop/EndpointAclPolicy.ps1',import.meta.url),'utf8'),source=await readFile(new URL('../../assets/assistant-runtime-root.ps1',import.meta.url),'utf8');
  const marker='$base=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)';expect(source.split(marker)).toHaveLength(2);
  const quoted="'"+directory.replaceAll("'","''")+"'",mock=`
$global:SodaTestBase=${quoted}
function Test-Path {param([string]$LiteralPath) return $true}
function Get-Item {param([string]$LiteralPath,[switch]$Force) return [pscustomobject]@{PSIsContainer=$true;Attributes=[IO.FileAttributes]::Directory}}
function Set-Acl {throw 'Unexpected ACL mutation in generated fixture'}
function Get-Acl {
 param([string]$LiteralPath)
 $value=[pscustomobject]@{Path=$LiteralPath;AreAccessRulesProtected=$true}
 $value|Add-Member ScriptMethod GetOwner {param($type) return [Security.Principal.WindowsIdentity]::GetCurrent().User}
 $value|Add-Member ScriptMethod GetAccessRules {
  param($explicit,$inherited,$type)
  $own=[pscustomobject]@{IdentityReference=[Security.Principal.WindowsIdentity]::GetCurrent().User;AccessControlType=[Security.AccessControl.AccessControlType]::Allow;FileSystemRights=[Security.AccessControl.FileSystemRights]::FullControl;PropagationFlags=[Security.AccessControl.PropagationFlags]::None}
  if($global:SodaTestUnsafe -and $this.Path-eq$global:SodaTestBase){return @($own,[pscustomobject]@{IdentityReference=[Security.Principal.SecurityIdentifier]::new('S-1-1-0');AccessControlType=[Security.AccessControl.AccessControlType]::Allow;FileSystemRights=[Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles;PropagationFlags=[Security.AccessControl.PropagationFlags]::None})}
  return @($own)
 }
 return $value
}
`;
  for(const mode of ['safe','unsafe','creation-race']){
   const unsafe=mode==='unsafe';
   const raceMock=`function Test-Path {param([string]$LiteralPath)
 $original=[Security.AccessControl.DirectorySecurity]::new();$user=[Security.Principal.WindowsIdentity]::GetCurrent().User;$original.SetOwner($user);$original.SetAccessRuleProtection($true,$false)
 foreach($pair in @(@($user.Value,'FullControl'),@('S-1-5-18','ReadAndExecute'))){$original.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($pair[0]),[Security.AccessControl.FileSystemRights]$pair[1],[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
 [IO.Directory]::CreateDirectory($LiteralPath,$original)|Out-Null
 $global:SodaBeforeSddl=[IO.Directory]::GetAccessControl($LiteralPath).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)
 return $false
}`;
   const adapter=mode==='creation-race'?mock.replace('function Test-Path {param([string]$LiteralPath) return $true}',raceMock):mock;
   const verifyRace=mode==='creation-race'?'\nif([IO.Directory]::GetAccessControl($root).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)-ne$global:SodaBeforeSddl){throw "Existing directory ACL changed"}':'';
   const code=policy+'\n'+adapter+'\n$global:SodaTestUnsafe=$'+String(unsafe)+'\n'+source.replace(marker,'$base='+quoted)+verifyRace;
   const run=desktopOwnedChild(desktopWindowsPowerShell(),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],'{"operation":"ensure"}',{timeout:10000,limit:8192});
   if(unsafe)await expect(run).rejects.toThrow();else expect(JSON.parse(await run).path).toBe(join(directory,'Sodashitsu-Assistant-Host'));
  }
 }finally{await rm(directory,{recursive:true,force:true});}
},45000);
