param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated ordinary temp-file lifecycle journal only. No installed state or service.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninRunJournalChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-run-record-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninRunJournalChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated run journal checks failed'}
 if($NegativeControls){
  $variants=@(
   @('role','if(busy||role!=required)','if(busy)','Observation-only owner prepared a start'),
   @('same-run','previous.RunId==intent.RunId','false','Previous run id was reused'),
   @('mode','||!mode(s.Intent)','','Mismatched admin mode claimed start'),
   @('process','s.State!="started"||value.Kind!="observation"||!s.Started.SameProcess(value)||','s.State!="started"||value.Kind!="observation"||','Wrong observed process accepted'),
   @('receipt','s.State=="complete"?s.Observed:null','s.State=="stopped"?s.Stopped:s.State=="complete"?s.Observed:null','Host receipt alone admitted next generation'),
   @('scope','!scope()||ended','ended','Open-time revoked scope consumed intent'),
   @('post-inspection','CheckCore(item,policy);if(!scope()||ended)','CheckCore(item,policy);if(ended)','Inspection-time revoked scope retained authority'),
   @('stage-identity','!written.Same(SodaDesktopSigninVault.Facts(file.Handle))||','','Replaced staged file identity was published'),
   @('claim-content','if(ReadOpened(pending,"intent",s.Intent.RunId).Digest()!=s.Intent.Digest())throw Failure();','ReadOpened(pending,"intent");','Replaced pending intent consumed with old claim data')
  )
  $name='WindowsSigninRunJournal.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);foreach($variant in $variants){$expected=if($variant[0] -eq 'scope'){2}else{1};if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne $expected){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored run journal checks failed'}
  'signin_run_journal_9_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
