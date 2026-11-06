param([Parameter(Mandatory=$true)][ValidateSet('upgrade','start','status','stop')][string]$Action)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$id=[Security.Principal.WindowsIdentity]::GetCurrent();if(-not $id.IsSystem -or $id.ImpersonationLevel -ne 'None' -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0 -or $env:COMPUTERNAME -ne 'OSK2-024680-2'){exit 40}
$env:TEMP=$PSScriptRoot;$env:TMP=$PSScriptRoot;$env:PSModulePath=Join-Path $PSHOME 'Modules'
$f=[IO.File]::Open((Join-Path $PSScriptRoot ($Action+'.attempted')),[IO.FileMode]::CreateNew);$f.Dispose()
$owner='S-1-5-21-2255109513-3773794534-3440117263-1001';$old='44060f73ad96499138b9b168657edd1a4c01c1ed3514c69a906d83c57322c816';$fresh='a84100a52c4b67c33580d8989d1c109605003f32c6a233cdbd892f8586f69aff';$out=@{ok=$false;action=$Action};$child=$null
try{
 $source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('QzpcVXNlcnNc5rWF6ZuEIOmAsuS5n++8oOWkp+mYqlxBcHBEYXRhXExvY2FsXHNvZGFzaGl0c3Vcc2lnbmluLXNoYXJlZC1waXBlLTczYS1wYWNrYWdlLTIwMjYxMTA3'))
 $tool=if($Action -eq 'upgrade'){'upgrade-signin-service.ps1'}else{'control-signin-service.ps1'}
 $toolArgs=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot ('tools\'+$tool)),'-OwnerSid',$owner)
 if($Action -eq 'upgrade'){$toolArgs+=@('-OldManifestSha256',$old,'-SourceDirectory',$source,'-ManifestSha256',$fresh)}else{$toolArgs+=@('-ManifestSha256',$fresh,'-Action',$Action,'-Mode','normal')}
 foreach($arg in $toolArgs){if($arg -match '["\x00-\x1f]'){throw 'Fixed argument invalid'}}
 $info=[Diagnostics.ProcessStartInfo]::new('C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe',(($toolArgs|ForEach-Object{'"'+$_+'"'}) -join ' '));$info.WorkingDirectory='C:\Windows\System32';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=[Diagnostics.Process]::Start($info);$stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync();$child.StandardInput.Close();[IO.File]::WriteAllText((Join-Path $PSScriptRoot ($Action+'-child.json')),(@{pid=$child.Id;createdAt=$child.StartTime.ToUniversalTime().ToString('o');tool=$tool}|ConvertTo-Json -Compress))
 if(-not $child.WaitForExit(320000)){throw 'Controller completion unknown; no replay'}
 $out.code=$child.ExitCode;if($stdout.Result.Length -gt 65536 -or $stderr.Result.Length -gt 65536){throw 'Controller output unavailable'};$out.stderrLength=$stderr.Result.Length
 if($child.ExitCode -ne 0){throw 'Controller refused; inspect before further action'}
 $out.receipt=$stdout.Result|ConvertFrom-Json
 if($Action -eq 'upgrade' -and ($out.receipt.state -ne 'upgraded' -or $out.receipt.oldPackageSha256 -ne $old -or $out.receipt.packageSha256 -ne $fresh -or $out.receipt.started -ne $false)){throw 'Upgrade not confirmed'}
 if($Action -eq 'start' -and $out.receipt.state -ne 'observation-acknowledged'){throw 'Admission not confirmed'}
 if($Action -eq 'stop' -and ($out.receipt.state -ne 'stopped' -or $out.receipt.journal -ne 'complete')){throw 'Clean stop not confirmed'}
 $out.ok=$true
}catch{$out.errorKind=$_.Exception.GetBaseException().GetType().Name}
finally{if($null -ne $child){$child.Dispose()}}
$f=[IO.File]::Open((Join-Path $PSScriptRoot ($Action+'.json')),[IO.FileMode]::CreateNew);try{$b=[Text.Encoding]::UTF8.GetBytes(($out|ConvertTo-Json -Depth 8));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
if(-not $out.ok){exit 1}
