$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$id=[Security.Principal.WindowsIdentity]::GetCurrent();if(-not $id.IsSystem -or $id.ImpersonationLevel -ne 'None' -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0 -or $env:COMPUTERNAME -ne 'OSK2-024680-2'){exit 40}
$env:TEMP=$PSScriptRoot;$env:TMP=$PSScriptRoot;$env:PSModulePath=Join-Path $PSHOME 'Modules'
$f=[IO.File]::Open((Join-Path $PSScriptRoot 'boot.attempted'),[IO.FileMode]::CreateNew);$f.Dispose();$phase='guard';$out=@{ok=$false;starts=0};$guard=$null
function Run-Fixed([string]$action){
 if(-not $guard.Current()){throw 'Boot identity changed'}
 $operator='C:\Program Files\Sodashitsu\.signin-pump-upgrade-a15b9911742845a1b6e05530617ecd51';$script=Join-Path $operator 'run.ps1'
 if((Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9c4627cab59e20a621c76b215cad93d3ddc8923a2fc13ab82a41cb12a41a3905'){throw 'Frozen controller wrapper changed'}
 $info=[Diagnostics.ProcessStartInfo]::new('C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe',('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'" -Action '+$action));$info.WorkingDirectory='C:\Windows\System32';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=[Diagnostics.Process]::Start($info);try{$stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync();$child.StandardInput.Close();if(-not $child.WaitForExit(340000)){throw 'Controller completion unknown; no replay'};if($child.ExitCode -ne 0 -or -not $guard.Current()){throw 'Fixed controller refused'};if($stdout.Result.Length -gt 65536 -or $stderr.Result.Length -gt 65536){throw 'Controller output exceeds bound'}}finally{$child.Dispose()}
 $result=[IO.File]::ReadAllText((Join-Path $operator ($action+'.json')))|ConvertFrom-Json;if($result.ok -ne $true -or $result.code -ne 0){throw 'Controller receipt missing'};return $result.receipt
}
try{
 $names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs','WindowsSigninPartialIdentityProof.cs')
 Add-Type -Path (@($names|ForEach-Object{Join-Path $PSScriptRoot ('sdk\'+$_)})+@(Join-Path $PSScriptRoot 'guard.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
 $guard=[SodaSigninUpgradeBootGuard]::new();$out.scmInstance=$guard.Instance
 $slot='C:\Program Files\Sodashitsu\DesktopSigninData\68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d'
 $checks=@(@{p=(Join-Path $slot 'enrollment.dpapi');h='0d0a534873932e4a2cc9f8e1907e55f817b34b0fdc1dfcdf0a11ac2ed91425be'},@{p=(Join-Path $slot 'runtime\desktop-endpoint-required.json');h='418127bfcfdbee3ff86c11d3eac51665c083f980da0d3e605e3003003e58cc98'},@{p=(Join-Path $slot 'runtime\desktop-endpoint\identity.json');h='946a8c3d1deb3b31ef66f405800823fcef199a2fcf2d4f3add43162f3bd258e3'})
 foreach($check in $checks){if((Get-FileHash -LiteralPath $check.p -Algorithm SHA256).Hash.ToLowerInvariant() -ne $check.h){throw 'Preserved key file changed'}}
 $phase='upgrade';$out.upgrade=Run-Fixed 'upgrade';if($out.upgrade.state -ne 'upgraded' -or $out.upgrade.packageSha256 -ne '44060f73ad96499138b9b168657edd1a4c01c1ed3514c69a906d83c57322c816' -or $out.upgrade.started -ne $false){throw 'Upgrade was not confirmed'}
 $guard.Stopped();foreach($check in $checks){if((Get-FileHash -LiteralPath $check.p -Algorithm SHA256).Hash.ToLowerInvariant() -ne $check.h){throw 'Key file changed during upgrade'}}
 $phase='start';$out.start=Run-Fixed 'start';if($out.start.state -ne 'observation-acknowledged'){throw 'Start not acknowledged'};$out.starts=1;$out.ok=$true
}catch{$out.phase=$phase;$out.errorKind=$_.Exception.GetBaseException().GetType().Name}finally{if($null -ne $guard){$guard.Dispose()}}
$f=[IO.File]::Open((Join-Path $PSScriptRoot 'boot-result.json'),[IO.FileMode]::CreateNew);try{$b=[Text.Encoding]::UTF8.GetBytes(($out|ConvertTo-Json -Depth 8));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
if(-not $out.ok){exit 1}
