param(
 [switch]$ValidateOnly,
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$OldManifestSha256,
 [Parameter(Mandatory=$true)][string]$SourceDirectory,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallFiles.cs','WindowsSigninInstallSource.cs','WindowsSigninUpgradeFiles.cs','WindowsSigninUpgradeScm.cs','WindowsSigninUpgrade.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_upgrade_compilation_only_passed';exit 0}
try{[SodaDesktopSigninUpgrade]::Run($OwnerSid,$OldManifestSha256,$SourceDirectory,$ManifestSha256)|ConvertTo-Json -Compress}catch{[Console]::Error.WriteLine('Signin upgrade refused or incomplete. Existing code and run archives are preserved; no automatic rollback, cleanup, start or stop occurs. Explicit reviewed recovery is required after an interrupted disabled transition.');exit 1}
