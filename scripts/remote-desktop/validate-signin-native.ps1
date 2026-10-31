param([switch]$NegativeControls)
$ErrorActionPreference='Stop'
# Compile fixed sources and inspect metadata only. Never start a service/native role.
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
 if($LASTEXITCODE -ne 0 -or -not $out.Contains('signin_native_closed_roles_generated_pass')){throw ('Native generated roles failed: '+$out)}
 & $shell -NoLogo -NoProfile -NonInteractive -File $builder -OutputDirectory $stage -OwnerSid $owner
 if($LASTEXITCODE -ne 0){throw 'Native staging compilation failed'}
 $images=[IO.Directory]::GetFiles($stage,'*.exe');if($images.Length -ne 1 -or [IO.Path]::GetFileName($images[0]) -cne 'DesktopSigninNative.exe'){throw 'Native image inventory changed'}
 $metadata=[Reflection.Assembly]::ReflectionOnlyLoad([IO.File]::ReadAllBytes($images[0]));if($metadata.EntryPoint.DeclaringType.FullName -cne 'SodaDesktopSigninNativeHost'){throw 'Native entry point changed'}
 if($NegativeControls){
  $path=Join-Path $source 'WindowsSigninNativeHost.cs';$original=[IO.File]::ReadAllBytes($path);$text=[Text.Encoding]::UTF8.GetString($original)
  $variants=@(
   @('unknown-role','if(args.Length==1&&args[0]=="--context")return "worker";','if(args.Length==1)return "worker";','Native role accepted unknown arguments'),
   @('empty-nonce','nonce!=Guid.Empty&&','true&&','Native role accepted unknown arguments')
  )
  foreach($variant in $variants){
   if(-not $text.Contains($variant[1])){throw ('Negative anchor missing: '+$variant[0])}
   try{
    [IO.File]::WriteAllText($path,$text.Replace($variant[1],$variant[2]),[Text.UTF8Encoding]::new($false))
    $preference=$ErrorActionPreference
    try{$ErrorActionPreference='Continue';$failure=(& $shell -NoLogo -NoProfile -NonInteractive -File $builder -ValidateOnly -OwnerSid $owner 2>&1|Out-String);$failedCode=$LASTEXITCODE}finally{$ErrorActionPreference=$preference}
    if($failedCode -eq 0 -or -not $failure.Contains($variant[3])){throw ('Negative control failed: '+$variant[0]+' '+$failure)}
    'signin_native_negative_pass '+$variant[0]
   }finally{[IO.File]::WriteAllBytes($path,$original)}
   if([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -cne [Convert]::ToBase64String($original)){throw 'Negative source restore failed'}
  }
 }
 'signin_native_single_image_generated_pass'
}finally{if([IO.Directory]::Exists($root)){[IO.Directory]::Delete($root,$true)}}

exit 0
