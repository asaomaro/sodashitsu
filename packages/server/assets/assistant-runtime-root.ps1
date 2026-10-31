$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
if($request.operation -notin @('ensure','check')){throw 'invalid operation'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$base=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if($base -notmatch '^[A-Za-z]:\\' -or $base.Contains("`n") -or $base.Contains("`r")){throw 'local profile required'}
$root=Join-Path $base 'Sodashitsu-Assistant-Host'
# Never follow junctions/reparse points in a path containing executable resources.
function Check-Parents([string]$path){
 $first=$false;$current=$path
 while($current){$item=Get-Item -LiteralPath $current -Force;if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0 -or -not $item.PSIsContainer){throw 'unsafe runtime parent'};$policy=Get-Acl -LiteralPath $current;if(-not(Test-SodaEndpointAcl -Owner $policy.GetOwner([Security.Principal.SecurityIdentifier]).Value -Rules @($policy.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) -User $sid.Value -Storage $false)){throw 'unsafe runtime ancestor permissions'};$next=[IO.Path]::GetDirectoryName($current);if($next-eq$current){break};$current=$next}
}
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($base));if(-not(Test-SodaEndpointDrive $drive.DriveType)){throw 'fixed local volume required'}
Check-Parents $base
if(-not(Test-Path -LiteralPath $root)){
 if($request.operation -ne 'ensure'){throw 'runtime root missing'}
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 # Apply security as part of creation; an existing directory is never modified.
 [IO.Directory]::CreateDirectory($root,$acl)|Out-Null
}
Check-Parents $root
$acl=Get-Acl -LiteralPath $root
if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value-ne$sid.Value -or -not$acl.AreAccessRulesProtected){throw 'runtime root owner mismatch'}
$allowed=@($sid.Value,'S-1-5-18','S-1-5-32-544');$own=$false
foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
 if($rule.AccessControlType-eq[Security.AccessControl.AccessControlType]::Allow){
  if($rule.IdentityReference.Value-notin$allowed){throw 'runtime root is not private'}
  if($rule.IdentityReference.Value-eq$sid.Value -and ($rule.FileSystemRights-band[Security.AccessControl.FileSystemRights]::FullControl)-eq[Security.AccessControl.FileSystemRights]::FullControl){$own=$true}
 }
}
if(-not$own){throw 'runtime root is not writable by its owner'}
$arch=$env:PROCESSOR_ARCHITEW6432;if(-not$arch){$arch=$env:PROCESSOR_ARCHITECTURE}
switch($arch.ToUpperInvariant()){'AMD64'{$arch='x64'}'ARM64'{$arch='arm64'}default{throw 'unsupported Windows architecture'}}
@{path=$root;arch=$arch}|ConvertTo-Json -Compress
