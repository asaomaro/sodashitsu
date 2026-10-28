param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated JSON, clocks and ownership callbacks only. No privileged entrypoint,
# credential/key read/write, service, private installed state or desktop action.
foreach($script in @('SigninAdminStorage.ps1','read-signin-admin.ps1','write-signin-admin-result.ps1')){
 $tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $script),[ref]$tokens,[ref]$errors)|Out-Null
 if($errors.Count -ne 0){throw ('Admin helper parse failed: '+$script)}
}
$files=@('WindowsSigninVault.cs','WindowsSigninAdminDeadline.cs','WindowsSigninAdminResult.cs','WindowsSigninAdminExecutionChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-admin-execution-checks-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$bytes=@{};$original=@{}
foreach($file in $files){$bytes[$file]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file));$original[$file]=[Text.Encoding]::UTF8.GetString($bytes[$file]);[IO.File]::WriteAllBytes((Join-Path $root $file),$bytes[$file])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($files|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninAdminExecutionChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated admin execution checks failed'}
 if($NegativeControls){
  $variants=@(
   @('wall','WindowsSigninAdminDeadline.cs','now>=expires','now>expires+1','Native wall expiry accepted'),
   @('monotonic','WindowsSigninAdminDeadline.cs','tick>=until','tick>until+1','Native monotonic expiry accepted'),
   @('owner','WindowsSigninAdminDeadline.cs','!active||','active&&false||','Native owner loss accepted'),
   @('reentry','WindowsSigninAdminDeadline.cs','if(ended||checking)','if(ended||checking&&lastMono<0)','Native reentrant deadline accepted'),
   @('result-nonce','WindowsSigninAdminResult.cs','Text(value["nonce"],36)!=expectedNonce||','','Native result accepted other nonce'),
   @('result-secret','WindowsSigninAdminResult.cs','if(value.Count!=keys.Length)throw Failure();','if(value.Count<keys.Length)throw Failure();','Native result accepted secret field'),
   @('result-role','WindowsSigninAdminResult.cs','Text(peer["role"],8)!="viewer"','Text(peer["role"],8)=="invalid"','Native result promoted agent role'),
   @('result-peers','WindowsSigninAdminResult.cs','peers.Length>8','peers.Length>64','Native result accepted ninth peer')
  )
  foreach($variant in $variants){$name=$variant[1];$before=$original[$name];if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
    'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($bytes[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored execution checks failed'}
  'signin_admin_execution_8_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
