param(
 [switch]$ValidateOnly,
 [switch]$GeneratedChecks,
 [ValidateSet('bind','recover')][string]$Action,
 [string]$OwnerSid,
 [ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [ValidatePattern('\A[a-f0-9]{64}\z')][string]$RunFileSha256,
 [ValidatePattern('\A[a-f0-9]{64}\z')][string]$AdminFileSha256,
 [ValidatePattern('\A[a-f0-9]{64}\z')][string]$TicketSha256
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs')
if($GeneratedChecks){$names+='WindowsSigninRestartRecoveryChecks.cs'}
Add-Type -Path ($names|ForEach-Object{Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($GeneratedChecks){[SodaDesktopSigninRestartRecoveryChecks]::Run();exit 0}
if($ValidateOnly){'signin_restart_recovery_compiled_no_operations';exit 0}
try{[SodaDesktopSigninRestartRecovery]::Run($Action,$OwnerSid,$ManifestSha256,$RunFileSha256,$AdminFileSha256,$TicketSha256)|ConvertTo-Json -Compress}
catch{[Console]::Error.WriteLine('Restart recovery refused. Preserve original journals, marker and archives; do not replay or delete an unknown request.');exit 1}
