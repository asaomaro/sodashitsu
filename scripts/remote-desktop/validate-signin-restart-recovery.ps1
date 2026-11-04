param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated ordinary-user files only. No service, real state or reboot.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs','WindowsSigninRestartRecoveryChecks.cs','recover-signin-restart.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-restart-check-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path $PSHOME 'powershell.exe'
function InvokeGenerated {$ErrorActionPreference='Continue';$lines=& $shell -NoProfile -NonInteractive -File (Join-Path $root 'recover-signin-restart.ps1') -GeneratedChecks 2>&1;$code=$LASTEXITCODE;return @{lines=$lines;code=$code}}
try{
 $r=InvokeGenerated;$output=$r.lines;$code=$r.code;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated restart checks failed'}
 if($NegativeControls){
  $name='WindowsSigninRestartRecovery.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);$variants=@(
   @('unknown-root','Exact(slot,allowed.ToArray());','/* generated omitted closed root */'),
   @('same-instance','&&before!=after','&&true'),
   @('history-digest','&&initial.Digest()==(string)fields["newBoundarySha256"]','&&true')
  )
  foreach($variant in $variants){if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw 'Negative source guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$r=InvokeGenerated;$output=$r.lines;$code=$r.code;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('Unknown key/history or same SCM instance was accepted'))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $r=InvokeGenerated;$output=$r.lines;$code=$r.code;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored restart checks failed'}
  'signin_restart_3_source_negatives_and_exact_restore_passed'
 }
 foreach($name in $names){if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Production bytes changed'}}
}finally{[IO.Directory]::Delete($root,$true)}
