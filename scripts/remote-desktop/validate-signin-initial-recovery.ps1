param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated release files and fake SCM only. No installed state or real service.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallFiles.cs','WindowsSigninInitialRecovery.cs','WindowsSigninInitialRecoveryChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-install-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninInitialRecoveryChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated installation checks failed'}
 if($NegativeControls){
  $variants=@(
   @('stopped-pid','WindowsSigninInitialRecovery.cs','status.Type==0x10&&status.State==1','status.Pid==0&&status.Type==0x10&&status.State==1','Stopped status incorrectly used invalid PID',1),
   @('initial','WindowsSigninInitialRecovery.cs','journal.State()=="initial"','journal.State()!="recovery"','Noninitial generation accepted',1),
   @('stopped','WindowsSigninInitialRecovery.cs','service.Stopped()','(service.Stopped()||true)','Running service accepted',3),
   @('inventory','WindowsSigninInitialRecovery.cs','if(entries.Length!=4)throw Failure();foreach(string path in entries)if(!expected.Remove(Path.GetFileName(path)))throw Failure();','','Unknown slot residue accepted',1),
   @('final-proof','WindowsSigninInitialRecovery.cs','Require(service.Stopped()&&evidence());','Require(service.Stopped());','Late marker accepted',2)
  )
  foreach($variant in $variants){$name=$variant[1];$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne $variant[5]){throw 'Negative guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored installation checks failed'}
  'signin_initial_recovery_5_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
