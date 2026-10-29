param(
 [switch]$ValidateOnly,
 [ValidateSet('status','start','stop')][string]$Action='status',
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [ValidateSet('normal','admin')][string]$Mode='normal',
 [string]$AdminNonce,[string]$AdminSha256
)
$ErrorActionPreference='Stop'
# Explicit elevated local invocation only. ValidateOnly compiles without any
# administrator check, SCM query/control, installed state or key access.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninRunStorage.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninController.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_controller_compiled_no_scm_or_storage_operations';exit 0}
try{
 $nonce=if($PSBoundParameters.ContainsKey('AdminNonce')){$AdminNonce}else{$null};$digest=if($PSBoundParameters.ContainsKey('AdminSha256')){$AdminSha256}else{$null}
 [SodaDesktopSigninController]::Run($Action,$OwnerSid,$ManifestSha256,$Mode,$nonce,$digest)|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('Signin controller could not verify installation, run evidence, or the requested transition. Inspect the dedicated run/admin journals; do not reset keys, trust, or replay an unknown request.');exit 1}
