param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated ordinary temp-file lifecycle journal only. No installed state or service.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninHost.cs','WindowsSigninProcess.cs','WindowsSigninRunRecord.cs','WindowsSigninRunAdmission.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninRunStorage.cs','WindowsSigninRunSession.cs','WindowsSigninRunSessionChecks.cs','WindowsSigninHostChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-run-record-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll;[SodaDesktopSigninRunSessionChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated host lifecycle checks failed'}
 if($NegativeControls){
  $variants=@(
   @('resume','WindowsSigninRunSession.cs','||!resumed||!finalized||','||','Unresumed run published receipt'),
   @('child-clean','WindowsSigninRunSession.cs','||!childClean()||','||childClean()&&false||','Unclean child published receipt'),
   @('retained','WindowsSigninRunSession.cs','if(ended||!retained()||ended)throw Failure();journal.Stopped','if(ended||retained()==true&&retained()==false||ended)throw Failure();journal.Stopped','Final retained proof was ignored'),
   @('reentry','WindowsSigninRunSession.cs','||completing){','||completing&&completed){','Reentrant completion published receipt'),
   @('post-clock','WindowsSigninRunSession.cs','if(ended||!retained()||ended)throw Failure();journal.Stopped','if(!retained())throw Failure();journal.Stopped','Clock callback restored completion authority'),
   @('normal-fallback','WindowsSigninRunStorage.cs','files.Length==0&&current()','files.Length<=1&&current()','Pending admin request fell back to normal mode'),
   @('admin-nonce','WindowsSigninRunStorage.cs','envelope.Nonce==(string)intent.Field("adminNonce")&&','','Wrong admin nonce admitted child branch'),
   @('admin-digest','WindowsSigninRunStorage.cs','BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()==(string)intent.Field("adminSha256")&&','','Wrong actual admin digest admitted child branch')
  )
  foreach($variant in $variants){$name=$variant[1];$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored host lifecycle checks failed'}
  'signin_host_lifecycle_8_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
