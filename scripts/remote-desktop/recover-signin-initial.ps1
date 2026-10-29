param(
 [switch]$ValidateOnly,
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallFiles.cs','WindowsSigninInitialRecovery.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_initial_recovery_compilation_only_passed';exit 0}
try{[SodaDesktopSigninInitialRecovery]::Run($OwnerSid,$ManifestSha256)|ConvertTo-Json -Compress}catch{[Console]::Error.WriteLine('Initial recovery refused. Only a fully committed, disabled, never-started installation can be restored to manual. No files are repaired or deleted and no service is started.');exit 1}
