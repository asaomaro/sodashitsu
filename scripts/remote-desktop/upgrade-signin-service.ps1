param(
 [switch]$ValidateOnly,
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$OldManifestSha256,
 [Parameter(Mandatory=$true)][string]$SourceDirectory,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [ValidateSet('Automatic','Manual')][string]$StartupType
)
$ErrorActionPreference='Stop'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallFiles.cs','WindowsSigninInstallSource.cs','WindowsSigninUpgradeScm.cs','WindowsSigninInstallerScm.cs','WindowsSigninUpgrade.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_upgrade_compilation_only_passed';exit 0}
$startup=if($StartupType -eq 'Automatic'){2}elseif($StartupType -eq 'Manual'){3}else{0}
try{[SodaDesktopSigninUpgrade]::Run($OwnerSid,$OldManifestSha256,$SourceDirectory,$ManifestSha256,$startup)|ConvertTo-Json -Compress}catch{[Console]::Error.WriteLine('Signin update refused or incomplete. Inspect the stopped service and preserved code archive before further local maintenance. Identity, trust and enrollment were not reset.');exit 1}
