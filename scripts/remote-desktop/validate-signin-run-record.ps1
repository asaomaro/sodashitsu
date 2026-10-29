param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated lifecycle metadata/DPAPI only. No actual service/process or keys.
$names=@('WindowsSigninVault.cs','WindowsSigninRunRecord.cs','WindowsSigninRunRecordChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-run-record-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninRunRecordChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated run record checks failed'}
 if($NegativeControls){
  $variants=@(
   @('kind','if(!Known(kind))throw Failure();','','Unknown run kind accepted'),
   @('owner','||Text(raw["ownerSid"],184)!=owner','','Run owner mismatch accepted'),
   @('expiry','expires-issued>300000','expires-issued>300001','Overlong run admission accepted'),
   @('job-empty','||!(bool)raw["jobEmpty"]','','Nonempty native Job data accepted'),
   @('canonical','if(Convert.ToBase64String(bytes)!=Convert.ToBase64String(canonical))throw Failure();','','Noncanonical run JSON accepted'),
   @('kind-domain','+kind+"\0"','','Run DPAPI kind domain was ignored'),
   @('owner-domain','+owner+"\0"','','Run DPAPI owner domain was ignored'),
   @('nonce-domain','+runId);',');','Run DPAPI nonce domain was ignored')
  )
  $name='WindowsSigninRunRecord.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);foreach($variant in $variants){if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored run record checks failed'}
  'signin_run_record_8_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
