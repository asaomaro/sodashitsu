param(
 [switch]$ValidateOnly,
 [ValidateSet('status','start','stop')][string]$Action='status',
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256
)
$ErrorActionPreference='Stop'
# Explicit elevated local invocation only. ValidateOnly compiles without any
# administrator check, SCM query/control, installed state or key access.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninController.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
if($ValidateOnly){'signin_controller_compiled_no_scm_or_storage_operations';exit 0}
try{
 [SodaDesktopSigninController]::Run($Action,$OwnerSid,$ManifestSha256)|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('Signin service control failed. Inspect the service status; do not reset identity, trust, or enrollment.');exit 1}
