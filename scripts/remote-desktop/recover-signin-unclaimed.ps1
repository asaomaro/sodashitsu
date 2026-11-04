param(
 [switch]$ValidateOnly,
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [ValidatePattern('\A[a-f0-9]{64}\z')][string]$RunFileSha256,
 [ValidatePattern('\A[a-f0-9]{64}\z')][string]$AdminFileSha256
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs')
Add-Type -Path ($names|ForEach-Object{Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_unclaimed_recovery_compiled_no_operations';exit 0}
try{
 [SodaDesktopSigninUnclaimedRecovery]::Run($OwnerSid,$ManifestSha256,$RunFileSha256,$AdminFileSha256)|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('Unclaimed initialization cancellation requires verified expired evidence. No request is replayed or deleted; preserve maintenance marker and archives for explicit inspection.');exit 1}
