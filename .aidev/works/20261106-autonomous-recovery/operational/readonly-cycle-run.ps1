$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$env:TEMP=$PSScriptRoot;$env:TMP=$PSScriptRoot;$env:PSModulePath=Join-Path $PSHOME 'Modules'
$source='C:\Program Files\Sodashitsu\.claimed-boot-46a1398019ed4525b5d870262fc5f66e'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs')
$gate=$null
try{Add-Type -Path (@($names|ForEach-Object{Join-Path $source $_})+@(Join-Path $PSScriptRoot 'gate.cs')+@(Join-Path $PSScriptRoot 'process.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
 $gate=[SodaReadonlyProbeGate]::new();$gate.Run();[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'verified.json'),'runtime-unchanged-job-zero')
}catch{[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'failure.json'),(@{errorKind=$_.Exception.GetBaseException().GetType().Name}|ConvertTo-Json -Compress));exit 1}finally{if($null -ne $gate){$gate.Dispose()}}
