param([switch]$ValidateOnly)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninRunStorage.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninController.cs','BootStartGuard.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot ('tools\'+$_)}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'boot_start_compiled_no_state_or_scm_action';exit 0}
$guard=$null;$child=$null;$claim=$null;$resultPath=$null;$out=@{ok=$false;admissionOnly=$true}
try{
 $guard=[SodaSigninBootStartGuard]::new();if(-not $guard.Current()){throw 'New boot unavailable'}
 $instance=$guard.Instance;if($instance -notmatch '\A[1-9][0-9]{0,9}:[1-9][0-9]{0,19}\z'){throw 'SCM identity unavailable'}
 $name='boot-'+$instance.Replace(':','-');$claim=[IO.File]::Open((Join-Path $PSScriptRoot ($name+'.attempted')),[IO.FileMode]::CreateNew);$b=[Text.Encoding]::UTF8.GetBytes($instance);$claim.Write($b,0,$b.Length);$claim.Flush($true)
 $resultPath=Join-Path $PSScriptRoot ($name+'.json');$out.scmInstance=$instance;$out.startedAt=[DateTime]::UtcNow.ToString('o')
 if(-not $guard.Current()){throw 'Boot lost before start'}
 $env:TEMP=$PSScriptRoot;$env:TMP=$PSScriptRoot;$env:PSModulePath=Join-Path $PSHOME 'Modules'
 $toolArgs=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'tools\control-signin-service.ps1'),'-OwnerSid','S-1-5-21-2255109513-3773794534-3440117263-1001','-ManifestSha256','17a1b46bdfec1633292e1a8c0f8c911fcb88435e92b65007787cf73f151c0394','-Action','start','-Mode','normal')
 foreach($arg in $toolArgs){if($arg -match '["\x00-\x1f]'){throw 'Fixed argument unavailable'}}
 $i=[Diagnostics.ProcessStartInfo]::new('C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe',(($toolArgs|ForEach-Object{'"'+$_+'"'}) -join ' '));$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.WorkingDirectory='C:\Windows\System32';$i.RedirectStandardInput=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
 $child=[Diagnostics.Process]::Start($i);$stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync();$child.StandardInput.Close()
 if(-not $child.WaitForExit(110000)){$out.completionUnknown=$true;throw 'Start completion unknown; no replay'}
 $out.exitCode=$child.ExitCode;if(-not $stdout.Wait(1000) -or -not $stderr.Wait(1000) -or $stdout.Result.Length -gt 65536 -or $stderr.Result.Length -gt 65536){throw 'Start output unavailable'};$out.stderrLength=$stderr.Result.Length
 if($child.ExitCode -ne 0 -or -not $guard.Current()){throw 'Standard start refused'};$receipt=$stdout.Result|ConvertFrom-Json
 if($receipt.state -ne 'observation-acknowledged' -or $receipt.journal -ne 'observed' -or [string]$receipt.runId -notmatch '\A[0-9a-f-]{36}\z'){throw 'Start admission unavailable'}
 $out.receipt=$receipt;$out.ok=$true
}catch{$out.errorKind=$_.Exception.GetBaseException().GetType().Name}
finally{
 if($null -ne $child){$child.Dispose()};if($null -ne $guard){$guard.Dispose()}
 if($null -ne $resultPath){$out.finishedAt=[DateTime]::UtcNow.ToString('o');$f=[IO.File]::Open($resultPath,[IO.FileMode]::CreateNew);try{$b=[Text.Encoding]::UTF8.GetBytes(($out|ConvertTo-Json -Depth 5));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}}
 if($null -ne $claim){$claim.Dispose()}
}
if(-not $out.ok){exit 1}
