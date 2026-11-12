param([Parameter(Mandatory=$true)][string]$OwnerSid,[Parameter(Mandatory=$true)][ValidateSet('enroll','disable')][string]$Operation)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$inputBytes=$null;$cipher=$null;$temporary=$null
try{
 Add-Type -Path (Join-Path $PSScriptRoot 'WindowsSigninVault.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll
 if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeInput() -or -not [SodaDesktopSigninVault]::UserAccount($OwnerSid)){throw 'SYSTEM input required'}
 . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
 . (Join-Path $PSScriptRoot 'SigninAclPolicy.ps1')
 $path=[SodaDesktopSigninVault]::StoragePath($OwnerSid);$directory=[IO.Path]::GetDirectoryName($path)
 $item=Get-Item -LiteralPath $directory -Force
 if($item -isnot [IO.DirectoryInfo] -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not (Test-SodaSigninStorageAcl (Get-Acl -LiteralPath $directory))){throw 'private fixed directory required'}
 # The verified native host holds this directory and its ancestors exclusively
 # against other Signin processes for the entire administrative command.
 $memory=[IO.MemoryStream]::new()
 try{
  $stream=[Console]::OpenStandardInput();$buffer=New-Object byte[] 1024
  while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0){if($memory.Length+$count -gt 16384){throw 'oversized input'};$memory.Write($buffer,0,$count)}
  $inputBytes=$memory.ToArray()
 }finally{if($null -ne $buffer){[Array]::Clear($buffer,0,$buffer.Length)};$owned=$memory.GetBuffer();[Array]::Clear($owned,0,$owned.Length);$memory.Dispose()}
 if(Test-Path -LiteralPath $path){$file=Get-Item -LiteralPath $path -Force;if($file -isnot [IO.FileInfo] -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not (Test-SodaSigninStorageAcl (Get-Acl -LiteralPath $path))){throw 'private enrollment required'}}
 if($Operation -eq 'disable'){
  if($inputBytes.Length -ne 0){throw 'unexpected payload'}
  [IO.File]::Delete($path)
 }else{
  if($inputBytes.Length -lt 1){throw 'empty enrollment'}
  $cipher=[SodaDesktopSigninVault]::Protect($inputBytes,$OwnerSid)
  $temporary=Join-Path $directory ([IO.Path]::GetRandomFileName())
  $output=[IO.FileStream]::new($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$output.Write($cipher,0,$cipher.Length);$output.Flush($true)}finally{$output.Dispose()}
  if([IO.File]::Exists($path)){[IO.File]::Replace($temporary,$path,$null)}else{[IO.File]::Move($temporary,$path)}
  $temporary=$null
 }
 'signin_enrollment_updated'
}catch{[Console]::Error.WriteLine('Signin enrollment update failed');exit 1}
finally{if($null -ne $inputBytes){[Array]::Clear($inputBytes,0,$inputBytes.Length)};if($null -ne $cipher){[Array]::Clear($cipher,0,$cipher.Length)};if($null -ne $temporary){[IO.File]::Delete($temporary)}}
