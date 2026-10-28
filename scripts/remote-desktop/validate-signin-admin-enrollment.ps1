param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Fixed-destination file operations on generated ordinary-user temporary data.
# No SYSTEM/public entrypoint, user keys, SCM or installed storage is used.
$files=@('WindowsSigninVault.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninAdminJournal.cs','WindowsSigninAdminPersistence.cs','WindowsSigninAdminEnrollment.cs','WindowsSigninAdminEnrollmentChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-admin-persistence-checks-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$bytes=@{};$original=@{}
foreach($file in $files){$bytes[$file]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file));$original[$file]=[Text.Encoding]::UTF8.GetString($bytes[$file]);[IO.File]::WriteAllBytes((Join-Path $root $file),$bytes[$file])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($files|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninAdminEnrollmentChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated enrollment checks failed'}
 if($NegativeControls){
  $variants=@(
   @('token','token!=Text(operation["token"],43)||','','Enrollment claim field mismatch accepted: token'),
   @('machine','machineId!=Text(operation["machineId"],32)||','','Enrollment claim field mismatch accepted: machineId'),
   @('input','||input!=Boolean(operation["allowInput"])','','Enrollment input scope extended'),
   @('peer','||fingerprint!=Fingerprint(actual["fingerprint"])','','Enrollment peer scope extended'),
   @('owner','||Text(data["ownerSid"],184)!=owner','','Enrollment owner mismatch accepted'),
   @('unknown','if(value.Count!=keys.Length)throw Failure();','if(value.Count<keys.Length)throw Failure();','Enrollment peer agent role accepted')
  )
  foreach($variant in $variants){$name='WindowsSigninAdminEnrollment.cs';$before=$original[$name];if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
    'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($bytes[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored persistence checks failed'}
  'signin_admin_enrollment_6_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
