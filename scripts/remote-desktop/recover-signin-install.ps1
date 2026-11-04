param(
 [switch]$ValidateOnly,
 [ValidateSet('inspect','complete')][string]$Action='inspect',
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [string]$MarkerSha256
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallFiles.cs','WindowsSigninInstallerScm.cs','WindowsSigninInitialRecovery.cs','WindowsSigninInstallRecovery.cs')
Add-Type -Path ($names|ForEach-Object{Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_install_recovery_compiled_no_execution';exit 0}
try{[SodaDesktopSigninInstallRecovery]::Run($OwnerSid,$ManifestSha256,$MarkerSha256,($Action -eq 'complete'))|ConvertTo-Json -Compress}
catch{[Console]::Error.WriteLine('Initial signin install completion failed verification. No service was started. Existing or partial state requires explicit reviewed recovery.');exit 1}
