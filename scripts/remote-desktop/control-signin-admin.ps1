param(
 [switch]$ValidateOnly,[switch]$ValidateOperationOnly,
 [ValidateSet('prepare','result','acknowledge')][string]$Action='result',
 [Parameter(Mandatory=$true)][string]$OwnerSid,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256,
 [string]$Nonce,[string]$CipherSha256,[string]$ResultSha256
)
$ErrorActionPreference='Stop'
if($ValidateOnly -and $ValidateOperationOnly){throw 'Choose compilation or input validation'}
# Prepare reads only a bounded pipe, before acquiring any installation lease.
# No request JSON, token, certificate or private key is a command-line argument.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninRunStorage.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninAdminDeadline.cs','WindowsSigninAdminJournal.cs','WindowsSigninAdminResult.cs','WindowsSigninAdminEnrollment.cs','WindowsSigninAdminController.cs','WindowsSigninAdminInput.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
if($ValidateOnly){'signin_admin_controller_compiled_no_scm_storage_or_input_operations';exit 0}
$operation=$null
try{
 if($Action -eq 'prepare' -or $ValidateOperationOnly){$operation=[SodaDesktopSigninAdminInput]::Read()}
 if($ValidateOperationOnly){[SodaDesktopSigninAdminController]::ValidateOperation($operation)|ConvertTo-Json -Compress;exit 0}
 $requestNonce=if($PSBoundParameters.ContainsKey('Nonce')){$Nonce}else{$null};$cipher=if($PSBoundParameters.ContainsKey('CipherSha256')){$CipherSha256}else{$null};$result=if($PSBoundParameters.ContainsKey('ResultSha256')){$ResultSha256}else{$null}
 [SodaDesktopSigninAdminController]::Run($Action,$OwnerSid,$ManifestSha256,$operation,$requestNonce,$cipher,$result)|ConvertTo-Json -Depth 10 -Compress
}catch{[Console]::Error.WriteLine('Signin administrative preparation or acknowledgment failed. No request is replayed automatically. Confirm the explicit operation, quiescence and result bindings.');exit 1}
finally{if($null -ne $operation){[Array]::Clear($operation,0,$operation.Length)}}
