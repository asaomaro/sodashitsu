$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$owner='S-1-5-21-2255109513-3773794534-3440117263-1001';$manifest='8e6d72110ffafcbfbe4b8e4e582dcecf83976e8a2d645a2c37066a31cb8429d9';$root='C:\Program Files\Sodashitsu\.claimed-boot-46a1398019ed4525b5d870262fc5f66e'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs','WindowsSigninPartialIdentityProof.cs')
$env:TEMP=Join-Path $PSScriptRoot 'system-temp';$env:TMP=$env:TEMP;$env:PSModulePath=Join-Path $PSHOME 'Modules'
$id=[Security.Principal.WindowsIdentity]::GetCurrent();if(-not $id.IsSystem -or $id.ImpersonationLevel -ne 'None' -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0){exit 40}
$result=@{at=[DateTime]::UtcNow.ToString('o');sessionId=0;mutatesInstalledState=$false};$phase='compile'
try{
 $facade=@'

public static class SodaFixedSigninInspection {
 public static object Read(string manifest){
  string owner="S-1-5-21-2255109513-3773794534-3440117263-1001";var clock=System.Diagnostics.Stopwatch.StartNew();
  if(!SodaDesktopSigninVault.SystemPrimary())throw new System.InvalidOperationException("SYSTEM only");
  using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
   System.Func<bool> active=()=>clock.ElapsedMilliseconds<30000&&mutex.Current()&&package.Current()&&SodaDesktopSigninVault.SystemPrimary();
   using(var service=SodaDesktopSigninScm.Open(owner,false,active)){var state=service.Query();return new{packageSha256=manifest,state=state.State,pid=state.Pid,exit=state.Exit,specific=state.Specific};}
  }
 }
}
'@
 $all=(@($names|ForEach-Object{[IO.File]::ReadAllText((Join-Path $root $_))})+@($facade)) -join "`n"
 $using=@([regex]::Matches($all,'(?m)^using [^;]+;')|ForEach-Object {$_.Value}|Select-Object -Unique)
 $all=($using -join "`n")+"`n"+[regex]::Replace($all,'(?m)^using [^;]+;','')
 Add-Type -TypeDefinition $all -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
 $phase='manifest';$code='C:\Program Files\Sodashitsu\DesktopSignin-68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d'
 $manifest=(Get-FileHash -LiteralPath (Join-Path $code 'signin-package.json') -Algorithm SHA256).Hash.ToLowerInvariant()
 $phase='inspect';$result.inspection=[SodaFixedSigninInspection]::Read($manifest);$result.ok=$true
}catch{$result.ok=$false;$result.phase=$phase;$result.errorKind=$_.Exception.GetBaseException().GetType().Name}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'signin-status.json'),($result|ConvertTo-Json -Depth 5))
if(-not $result.ok){exit 1}
