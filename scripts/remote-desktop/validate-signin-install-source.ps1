param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated release files and fake SCM only. No installed state or real service.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninInstallSource.cs','WindowsSigninInstallSourceChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-install-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninInstallSourceChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated installation checks failed'}
 if($NegativeControls){
  $variants=@(
   @('manifest','if(Hash(bytes)!=expected)throw Failure();','','Unreviewed manifest accepted',1),
   @('hash','if(digest!=entry.Sha256)throw Failure();','','Changed release bytes accepted',2),
   @('scope','!current()','(current()==false&&current()==true)','Revoked copy continued publication',2),
   @('inventory','Inventory(root,names);foreach(var item in held)','foreach(var item in held)','Source inventory change retained lease',1)
  )
  $name='WindowsSigninInstallSource.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);foreach($variant in $variants){if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne $variant[4]){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored installation checks failed'}
  'signin_install_source_4_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
