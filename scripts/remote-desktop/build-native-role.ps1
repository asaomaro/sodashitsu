# Called with bounded JSON by the fixed soda launcher, never with viewer-selected paths/options.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
if($request.operation-notin@('host','module') -or $request.role-notin@('copy','audio','selection')){throw 'invalid native role'}
$source=[string]$request.source
if($source.Length-gt4096 -or $source-match '["\x00-\x1f]'){throw 'invalid SDK source directory'}
$framework=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if(-not(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))){$framework=Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319'}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().User
if($null-eq$user -or $user.Value-eq'S-1-5-18'){throw 'current-user native role required'}
$security=[Security.AccessControl.DirectorySecurity]::new();$security.SetOwner($user);$security.SetAccessRuleProtection($true,$false)
$security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
function Check-Root([string]$path,[bool]$private=$true){
 $item=Get-Item -LiteralPath $path -Force;$storage=$private
 while($null-ne$item){
  if($item -isnot [IO.DirectoryInfo] -or ($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'unsafe native host parent'}
  $acl=Get-Acl -LiteralPath $item.FullName
  if(-not(Test-SodaEndpointAcl -Owner $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -Rules @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) -User $user.Value -Storage $storage)){throw 'unsafe native host permissions'}
  if($storage -and ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value-ne$user.Value -or -not$acl.AreAccessRulesProtected)){throw 'native host is not private'}
  $storage=$false;$item=$item.Parent
 }
}
function Private-Directory([string]$path){[IO.Directory]::CreateDirectory($path,$security)|Out-Null;Check-Root $path}
function Hash-File([string]$path){
 $item=Get-Item -LiteralPath $path -Force;if($item.PSIsContainer -or ($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0 -or $item.Length-gt8MB){throw 'invalid native host resource'}
 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Compile([string]$output,[string[]]$files,[string[]]$references,[bool]$entryHost){
 $arguments=@('/nologo','/noconfig','/unsafe-','/warnaserror+',"/out:$output")
 if($entryHost){$arguments+=@('/target:exe','/main:SodaNativeRoleHost')}else{$arguments+='/target:library'}
 foreach($name in $references){$arguments+="/reference:$(Join-Path $framework $name)"}
 foreach($name in $files){$path=Join-Path $source $name;$item=Get-Item -LiteralPath $path -Force;if($item.PSIsContainer -or $item.Length-gt2MB -or ($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'invalid bundled native source'};$arguments+=$path}
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $framework 'csc.exe';$start.Arguments=(($arguments|ForEach-Object{'"'+$_+'"'})-join' ');$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $compiler=[Diagnostics.Process]::Start($start)
 try{$stdout=$compiler.StandardOutput.ReadToEndAsync();$stderr=$compiler.StandardError.ReadToEndAsync();if(-not$compiler.WaitForExit(20000)){$compiler.Kill();if(-not$compiler.WaitForExit(5000)){throw 'owned native compiler did not retire'};throw 'native compilation timed out'};$diagnostics=$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult();if($compiler.ExitCode-ne0){throw "native compilation failed: $diagnostics"}}
 finally{$compiler.Dispose()}
}
$base=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if($base-notmatch'^[A-Za-z]:\\' -or -not(Test-SodaEndpointDrive ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($base))).DriveType)){throw 'fixed local profile required'}
Check-Root $base $false
$cache=Join-Path $base 'Sodashitsu-Native-Host';Private-Directory $cache
$hostSource=Join-Path $source 'WindowsNativeRoleHost.cs';$fullKey=Hash-File $hostSource;$key=$fullKey.Substring(0,32);$family=Join-Path $cache $key;Private-Directory $family
$pointer=Join-Path $family 'host.current';$lock=$null;$until=[Diagnostics.Stopwatch]::StartNew()
while($null-eq$lock){try{$lock=[IO.FileStream]::new((Join-Path $family 'build.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch [IO.IOException]{if($until.ElapsedMilliseconds-ge20000){throw 'native host build is busy'};Start-Sleep -Milliseconds 25}}
$stage=$null;$published=$false
try{
 $valid=$false
 if(Test-Path -LiteralPath $pointer){
  $item=Get-Item -LiteralPath $pointer -Force
  if($item.PSIsContainer -or ($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0 -or $item.Length-ne32){throw 'invalid native host pointer'}
  $id=[IO.File]::ReadAllText($pointer);if($id-notmatch'\A[a-f0-9]{32}\z'){throw 'invalid native host pointer'}
  $directory=Join-Path $family ('host-'+$id);Check-Root $directory;$binary=Join-Path $directory 'soda-native-host.exe';$receipt=Join-Path $directory 'host.sha256';$sourceReceipt=Join-Path $directory 'source.sha256'
  if((Test-Path -LiteralPath $binary)-and(Test-Path -LiteralPath $receipt)-and(Test-Path -LiteralPath $sourceReceipt)){$hash=Hash-File $binary;$valid=(Get-Item -LiteralPath $receipt).Length-eq64 -and [IO.File]::ReadAllText($receipt)-eq$hash -and (Get-Item -LiteralPath $sourceReceipt).Length-eq64 -and [IO.File]::ReadAllText($sourceReceipt)-eq$fullKey}
 }
 if($request.operation-eq'host'){
  if(-not$valid){
   if(@(Get-ChildItem -LiteralPath $family -Force).Count-ge24){throw 'native host cache limit exceeded'}
   $id=[Guid]::NewGuid().ToString('N');$stage=Join-Path $family ('stage-'+$id);Private-Directory $stage
   $built=Join-Path $stage 'soda-native-host.exe';Compile $built @('WindowsNativeRoleHost.cs') @('System.dll','System.Core.dll','System.Security.dll') $true
   $hash=Hash-File $built;[IO.File]::WriteAllText((Join-Path $stage 'host.sha256'),$hash,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $stage 'source.sha256'),$fullKey,[Text.UTF8Encoding]::new($false))
   $directory=Join-Path $family ('host-'+$id);[IO.Directory]::Move($stage,$directory);$stage=$null
   $temporary=Join-Path $family ('pointer-'+[Guid]::NewGuid().ToString('N'));[IO.File]::WriteAllText($temporary,$id,[Text.UTF8Encoding]::new($false))
   # Windows PowerShell binds $null to an empty backup path; use an owned explicit backup.
   $backup=Join-Path $family ('backup-'+[Guid]::NewGuid().ToString('N'))
   try{if(Test-Path -LiteralPath $pointer){[IO.File]::Replace($temporary,$pointer,$backup)}else{[IO.File]::Move($temporary,$pointer)}}finally{foreach($owned in @($temporary,$backup)){if(Test-Path -LiteralPath $owned){[IO.File]::Delete($owned)}}}
   $binary=Join-Path $directory 'soda-native-host.exe'
  }
  @{binary=$binary;directory=$directory;sha256=$hash}|ConvertTo-Json -Compress
 }else{
  if(-not$valid){throw 'prepare the common native host first'}
  if($request.expectedHost-ne$id -or $request.expectedHash-ne$hash){throw 'native host generation changed'}
  if(@(Get-ChildItem -LiteralPath $directory -Directory -Force -Filter 'role-*').Count-ge128){throw 'native role cache limit exceeded'}
  $stage=Join-Path $directory ('role-'+[Guid]::NewGuid().ToString('N'));Private-Directory $stage
  switch($request.role){
   'copy'{$files=@('WindowsNativeDragLease.cs','WindowsNativeDragStreams.cs','WindowsNativeDragDataObject.cs','WindowsNativeDragPackets.cs','WindowsNativeDragPump.cs','WindowsNativeDragSlot.cs','WindowsNativeDragWorker.cs');$refs=@('System.dll','System.Core.dll','System.Web.Extensions.dll','System.Security.dll','System.Windows.Forms.dll')}
   'audio'{$files=@('WindowsAudioPipeBridge.cs');$refs=@('System.dll','System.Core.dll','System.Web.Extensions.dll','System.Security.dll')}
   'selection'{$files=@('WindowsExplorerSelection.cs','WindowsExplorerSelectionWorker.cs');$refs=@('System.dll','System.Core.dll','System.Web.Extensions.dll','WPF\WindowsBase.dll','WPF\UIAutomationClient.dll','WPF\UIAutomationTypes.dll')}
  }
  $module=Join-Path $stage ($request.role+'.dll');Compile $module $files $refs $false;$moduleHash=Hash-File $module;$published=$true
  @{binary=$binary;directory=$stage;sha256=$moduleHash;hostSha256=$hash}|ConvertTo-Json -Compress
 }
}finally{
 if($null-ne$lock){$lock.Dispose()}
 if($null-ne$stage -and -not$published){[IO.Directory]::Delete($stage,$true)}
}
