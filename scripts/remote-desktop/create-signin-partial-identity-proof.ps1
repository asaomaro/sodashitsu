param([Parameter(Mandatory=$true)][string]$OwnerSid,[Parameter(Mandatory=$true)][string]$ManifestSha256,[Parameter(Mandatory=$true)][string]$Nonce)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# The administrator must first copy/pin this whole source set in a private
# directory. This fixed SYSTEM-only entry accepts no source/state/output paths.
$env:TEMP=$PSScriptRoot;$env:TMP=$PSScriptRoot
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs','WindowsSigninPartialIdentityProof.cs')
$phase='compile'
try{
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
$phase='entry';[SodaDesktopSigninPartialIdentityProof]::Run($OwnerSid,$ManifestSha256,$Nonce)|ConvertTo-Json -Compress}
catch{if($phase -ne 'compile'){$phase=[SodaDesktopSigninPartialIdentityProof]::LastPhase};$diagnostic=Join-Path $PSScriptRoot 'proof-failure.json';$bytes=[Text.Encoding]::UTF8.GetBytes((@{phase=$phase;errorKind=$_.Exception.GetBaseException().GetType().Name}|ConvertTo-Json -Compress));$file=[IO.File]::Open($diagnostic,[IO.FileMode]::CreateNew);try{$file.Write($bytes,0,$bytes.Length)}finally{$file.Dispose()};[Console]::Error.WriteLine('Readonly partial identity proof failed; no key or request was changed.');exit 1}
