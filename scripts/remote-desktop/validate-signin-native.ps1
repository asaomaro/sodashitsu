param([switch]$NegativeControls)
$ErrorActionPreference='Stop'
# Compile fixed release sources and run explicit pure role checks separately. Never start a service/native role.
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-native-'+[Guid]::NewGuid().ToString('N'))
$source=Join-Path $root 'sdk';$stage=Join-Path $root 'stage'
[IO.Directory]::CreateDirectory($source)|Out-Null;[IO.Directory]::CreateDirectory($stage)|Out-Null
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$owner='S-1-5-21-1-2-3-1001'
try {
 foreach($file in [IO.Directory]::GetFiles($PSScriptRoot,'*.cs')){[IO.File]::Copy($file,(Join-Path $source ([IO.Path]::GetFileName($file))))}
 [IO.File]::Copy((Join-Path $PSScriptRoot 'build-signin-host.ps1'),(Join-Path $source 'build-signin-host.ps1'))
 $builder=Join-Path $source 'build-signin-host.ps1'
 $out=(& $shell -NoLogo -NoProfile -NonInteractive -File $builder -ValidateOnly -OwnerSid $owner 2>&1|Out-String)
 if($LASTEXITCODE -ne 0 -or -not $out.Contains('signin_native_compiled_no_execution')){throw ('Native compile-only validation failed: '+$out)}
 & $shell -NoLogo -NoProfile -NonInteractive -File $builder -OutputDirectory $stage -OwnerSid $owner
 if($LASTEXITCODE -ne 0){throw 'Native staging compilation failed'}
 $images=[IO.Directory]::GetFiles($stage,'*.exe');if($images.Length -ne 1 -or [IO.Path]::GetFileName($images[0]) -cne 'DesktopSigninNative.exe'){throw 'Native image inventory changed'}
 $metadata=[Reflection.Assembly]::ReflectionOnlyLoad([IO.File]::ReadAllBytes($images[0]));if($metadata.EntryPoint.DeclaringType.FullName -cne 'SodaDesktopSigninNativeHost'){throw 'Native entry point changed'}
 if($metadata.GetType('SodaDesktopSigninNativeHost').GetMethod('VerifyGeneratedData') -ne $null){throw 'Generated role checks leaked into release image'}
 $names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninProcessEvidence.cs','WindowsSigninScm.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninHost.cs','WindowsSigninAdminPipe.cs','WindowsSigninProcess.cs','WindowsSigninCandidate.cs','WindowsSigninCandidateNative.cs','WindowsSigninScope.cs','WindowsSigninTarget.cs','WindowsSigninScopeNative.cs','WindowsSigninWorkerNative.cs','WindowsSigninWorker.cs','WindowsSigninPresence.cs','WindowsSigninNativeHost.cs','WindowsSigninNativeHostGeneratedChecks.cs')
 $combined=($names|ForEach-Object {[IO.File]::ReadAllText((Join-Path $source $_))}) -join "`n"
 foreach($marker in @('__SIGNIN_OWNER_SID__','__SIGNIN_WORKER_OWNER_SID__')){$combined=$combined.Replace($marker,$owner)}
 $usings=[regex]::Matches($combined,'(?m)^using [^;]+;')|ForEach-Object {$_.Value}|Select-Object -Unique
 $combined=($usings -join "`n")+"`n"+[regex]::Replace($combined,'(?m)^using [^;]+;','')
 $checkPath=Join-Path $root 'role-checks.cs';[IO.File]::WriteAllText($checkPath,$combined,[Text.UTF8Encoding]::new($false))
 $literal=$checkPath.Replace("'","''")
 $program="`$ErrorActionPreference='Stop';try{Add-Type -Path '$literal' -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll,System.Drawing.dll,System.Windows.Forms.dll;[SodaDesktopSigninNativeHost]::VerifyGeneratedData()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
 $output|ForEach-Object {Write-Output ([string]$_)}
 if($code -ne 0 -or -not (($output|Out-String).Contains('signin_native_closed_roles_generated_pass'))){throw 'Explicit generated native role checks failed'}
 if($NegativeControls){
  $path=$checkPath;$original=[IO.File]::ReadAllBytes($path);$text=[Text.Encoding]::UTF8.GetString($original)
  $variants=@(
   @('unknown-role','if(args.Length==2&&args[0]=="--broker"&&Purpose(args[1]))return "worker";','if(args.Length>=1)return "worker";','Native role accepted unknown arguments'),
   @('empty-nonce','nonce!=Guid.Empty&&','true&&','Native role accepted unknown arguments')
  )
  foreach($variant in $variants){
   if(-not $text.Contains($variant[1])){throw ('Negative anchor missing: '+$variant[0])}
   try{
    [IO.File]::WriteAllText($path,$text.Replace($variant[1],$variant[2]),[Text.UTF8Encoding]::new($false))
    $preference=$ErrorActionPreference
    try{$ErrorActionPreference='Continue';$failure=(& $shell -NoLogo -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1|Out-String);$failedCode=$LASTEXITCODE}finally{$ErrorActionPreference=$preference}
    if($failedCode -eq 0 -or -not $failure.Contains($variant[3])){throw ('Negative control failed: '+$variant[0]+' '+$failure)}
    'signin_native_negative_pass '+$variant[0]
   }finally{[IO.File]::WriteAllBytes($path,$original)}
   if([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -cne [Convert]::ToBase64String($original)){throw 'Negative source restore failed'}
  }
 }
 'signin_native_single_image_generated_pass'
}finally{if([IO.Directory]::Exists($root)){[IO.Directory]::Delete($root,$true)}}

exit 0
