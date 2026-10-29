param(
 [switch]$ValidateOnly,
 [ValidateSet('inspect','resume','restore')][string]$Action='inspect',
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [string]$OldManifestSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [string]$MarkerSha256
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallFiles.cs','WindowsSigninInstallSource.cs','WindowsSigninUpgradeFiles.cs','WindowsSigninUpgradeScm.cs','WindowsSigninUpgrade.cs','WindowsSigninUpgradeRecord.cs','WindowsSigninMaintenanceState.cs','WindowsSigninMaintenanceRecovery.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_maintenance_recovery_compilation_only_passed';exit 0}
try{[SodaDesktopSigninMaintenanceRecovery]::Run($Action,$OwnerSid,$OldManifestSha256,$ManifestSha256,$MarkerSha256)|ConvertTo-Json -Compress}catch{[Console]::Error.WriteLine('Signin maintenance refused or incomplete. Unknown data and incomplete archives are preserved. No automatic start, stop, rollback, deletion or key reset is performed.');exit 1}
