param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated ACLs and existing ancestor read-only handles. No secret file, SCM, input or service operations.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninInstallFiles.cs','WindowsSigninQuiescence.cs','WindowsSigninStateLayoutChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-state-layout-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninStateLayoutChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program));$shell=Join-Path $PSHOME 'powershell.exe'
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Signin state layout checks failed'}
 if($NegativeControls){
  $variants=@(
   @('WindowsSigninVault.cs','programdata','SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSigninData"','SpecialFolder.CommonApplicationData),"Sodashitsu","DesktopSigninData"','State root crossed into metadata-writable ProgramData'),
   @('WindowsSigninVault.cs','legacy-ignored','if(absent==null||!absent(legacy))throw Failure();','if(absent==null)throw Failure();','Legacy owner state was silently replaced'),
   @('WindowsSigninQuiescence.cs','readable-state','?Private(bytes):SodaDesktopSigninPackage.CodeAcl(bytes,false);','?SodaDesktopSigninPackage.CodeAcl(bytes,false):SodaDesktopSigninPackage.CodeAcl(bytes,false);','State root permitted ordinary reads')
  )
  foreach($variant in $variants){$before=[Text.Encoding]::UTF8.GetString($original[$variant[0]]);if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne 1){throw 'Signin state negative guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root $variant[0]),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[1];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains($variant[4]))){throw 'Signin state negative did not fail the intended assertion'}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $variant[0]),$original[$variant[0]]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $variant[0]))) -cne [Convert]::ToBase64String($original[$variant[0]])){throw 'Signin state source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored signin state source failed'}
  'signin_state_3_negative_controls_and_byte_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
