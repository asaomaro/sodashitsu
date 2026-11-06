$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$id=[Security.Principal.WindowsIdentity]::GetCurrent();if(-not $id.IsSystem -or $id.ImpersonationLevel -ne 'None' -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0 -or $env:COMPUTERNAME -ne 'OSK2-024680-2'){exit 40}
$env:TEMP=$PSScriptRoot;$env:TMP=$PSScriptRoot;$env:PSModulePath=Join-Path $PSHOME 'Modules'
$f=[IO.File]::Open((Join-Path $PSScriptRoot 'boot.attempted'),[IO.FileMode]::CreateNew);$f.Dispose();$phase='guard';$out=@{ok=$false;starts=0};$guard=$null
function Run-Fixed([string]$action){
 if(-not $guard.Current()){throw 'Boot identity changed'}
 $operator='C:\Program Files\Sodashitsu\.signin-session-jobs-upgrade-19106899fb0b4cecbf7daad98e876c68';$script=Join-Path $operator 'run.ps1'
 if((Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant() -ne '50f69c1a7fa1e452d7014b13f931191fc2edeb00169b5c4b1672799fd6a9f091'){throw 'Frozen controller wrapper changed'}
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
 $phase='upgrade';$out.upgrade=Run-Fixed 'upgrade';if($out.upgrade.state -ne 'upgraded' -or $out.upgrade.packageSha256 -ne '1ba65bb05719ddad0756e973d7299fb3ca51242cb1bc88f7e6ed35151346ede1' -or $out.upgrade.started -ne $false){throw 'Upgrade was not confirmed'}
 $guard.Stopped();foreach($check in $checks){if((Get-FileHash -LiteralPath $check.p -Algorithm SHA256).Hash.ToLowerInvariant() -ne $check.h){throw 'Key file changed during upgrade'}}
 $phase='start';$out.start=Run-Fixed 'start';if($out.start.state -ne 'observation-acknowledged'){throw 'Start not acknowledged'};$out.starts=1;$out.ok=$true
}catch{$out.phase=$phase;$out.errorKind=$_.Exception.GetBaseException().GetType().Name}finally{if($null -ne $guard){$guard.Dispose()}}
$f=[IO.File]::Open((Join-Path $PSScriptRoot 'boot-result.json'),[IO.FileMode]::CreateNew);try{$b=[Text.Encoding]::UTF8.GetBytes(($out|ConvertTo-Json -Depth 8));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
if(-not $out.ok){exit 1}
