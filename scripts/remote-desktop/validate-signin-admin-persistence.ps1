param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Fixed-destination file operations on generated ordinary-user temporary data.
# No SYSTEM/public entrypoint, user keys, SCM or installed storage is used.
$files=@('WindowsSigninVault.cs','WindowsSigninAdminJournal.cs','WindowsSigninAdminPersistence.cs','WindowsSigninAdminPersistenceChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-admin-persistence-checks-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$bytes=@{};$original=@{}
foreach($file in $files){$bytes[$file]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file));$original[$file]=[Text.Encoding]::UTF8.GetString($bytes[$file]);[IO.File]::WriteAllBytes((Join-Path $root $file),$bytes[$file])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($files|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll;[SodaDesktopSigninAdminPersistenceChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated persistence checks failed'}
 if($NegativeControls){
  $variants=@(
   @('kind','kind!="initialize"&&kind!="trust"&&kind!="revoke"','kind=="invalid"','Native commit accepted unrelated request kind'),
   @('destination','!marker&&!identity||','!marker&&!identity&&kind=="invalid"||','Native commit escaped fixed destinations'),
   @('marker','||marker&&kind!="initialize"','','Trust request changed required marker'),
   @('missing','if(!exists&&kind!="initialize")throw Failure();','','Trust request recreated missing identity'),
   @('deadline','Current(current);if(!MoveFileExW(source,destination,9))throw Failure();','if(!MoveFileExW(source,destination,9))throw Failure();','Expired request changed target'),
   @('directory-acl','||!policy(path)','','Unsafe directory policy accepted'),
   @('file-acl','!before.Regular||!filePolicy(file)','!before.Regular','Unsafe file policy changed target')
  )
  foreach($variant in $variants){$name='WindowsSigninAdminPersistence.cs';$before=$original[$name];if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
    'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($bytes[$name])){throw 'Source bytes not restored'}}
  }
  $name='WindowsSigninAdminPersistence.cs';$before=$original[$name];$facts='if(!before.Same(SodaDesktopSigninVault.Facts(file.SafeFileHandle)))throw Failure();';$commit='Current(current);if(!MoveFileExW(source,destination,9))throw Failure();'
  if(([regex]::Matches($before,[regex]::Escape($facts))).Count -ne 1 -or ([regex]::Matches($before,[regex]::Escape($commit))).Count -ne 1){throw 'Metadata-order negative guard changed'}
  try{
   [IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($facts,'Current(current);'+$facts).Replace($commit,'if(!MoveFileExW(source,destination,9))throw Failure();'))
   $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative metadata-order';$output|ForEach-Object{[string]$_}
   if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: Late metadata completion committed expired request'))){throw 'Metadata-order control did not fail intended assertion'}
  }finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($bytes[$name])){throw 'Source bytes not restored'}}
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored persistence checks failed'}
  'signin_admin_persistence_8_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
