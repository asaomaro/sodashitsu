# Only dot-sourced by fixed installed SYSTEM helpers. No path is accepted from
# the administration request. This function does not create or repair storage.
function Open-SodaSigninAdminStorage([string]$OwnerSid,[Func[bool]]$Current) {
 if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeOutput() -or -not [SodaDesktopSigninVault]::UserAccount($OwnerSid)){throw 'private SYSTEM helper required'}
 . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
 . (Join-Path $PSScriptRoot 'SigninAclPolicy.ps1')
 $slot=[IO.Path]::GetDirectoryName([SodaDesktopSigninVault]::StoragePath($OwnerSid));$path=Join-Path $slot 'admin'
 if($path -notmatch '^[A-Za-z]:\\' -or $path.Substring(2).Contains(':')){throw 'local path required'}
 $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($path));if($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS'){throw 'private fixed NTFS required'}
 $item=Get-Item -LiteralPath $path -Force;if($item -isnot [IO.DirectoryInfo]){throw 'private journal directory required'};$depth=0
 while($null -ne $item){
  if($depth -gt 64 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'unsafe ancestor'}
  $acl=Get-Acl -LiteralPath $item.FullName
  if($depth -lt 2){if(-not (Test-SodaSigninStorageAcl $acl)){throw 'confidential ACL required'}}
  else{if(-not (Test-SodaEndpointAcl ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value) @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) 'S-1-5-18' $false)){throw 'unsafe ancestor ACL'}}
  $item=$item.Parent;$depth++
 }
 foreach($file in @(Get-ChildItem -LiteralPath $path -Force)){
  if($file -isnot [IO.FileInfo] -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not (Test-SodaSigninStorageAcl (Get-Acl -LiteralPath $file.FullName))){throw 'unsafe journal entry'}
 }
 return [SodaDesktopSigninAdminJournal]::new($path,$Current)
}
