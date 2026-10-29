param(
 [switch]$ValidateOnly,
 [Parameter(Mandatory=$true)][string]$SourceDirectory,
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256
)
$ErrorActionPreference='Stop'
# Local source bytes are inspected, never executed. ValidateOnly never checks or
# modifies SCM, target paths, privileges, identity/trust or an installed service.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninInstallSource.cs','WindowsSigninInstallFiles.cs','WindowsSigninInstallerScm.cs','WindowsSigninInstaller.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
try{
 if($ValidateOnly){[SodaDesktopSigninInstaller]::Preview($SourceDirectory,$OwnerSid,$ManifestSha256)|ConvertTo-Json -Compress;exit 0}
 [SodaDesktopSigninInstaller]::Install($SourceDirectory,$OwnerSid,$ManifestSha256)|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('Signin installation failed verification. Existing or partial code/data/service is not overwritten or reset. Use explicit reviewed recovery; the installer does not start the service.');exit 1}
