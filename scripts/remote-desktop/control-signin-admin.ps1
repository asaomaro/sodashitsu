param([switch]$ValidateOnly,[Parameter(Mandatory=$true)][string]$OwnerSid,[Parameter(Mandatory=$true)][ValidatePattern('\A[a-f0-9]{64}\z')][string]$ManifestSha256)
$ErrorActionPreference='Stop'
# One explicit command from stdin to the fixed SYSTEM service; secrets never
# enter argv, log files, durable requests or stored results.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninAdminPipe.cs','WindowsSigninAdminController.cs')
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
if($ValidateOnly){'signin_admin_controller_compiled_no_scm_storage_or_input_operations';exit 0}
$operation=$null
try{
 $inputStream=[Console]::OpenStandardInput();$memory=[IO.MemoryStream]::new();$buffer=New-Object byte[] 1024
 try{
  while(($count=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){if($memory.Length+$count -gt 16384){throw 'operation too large'};$memory.Write($buffer,0,$count)}
  $operation=$memory.ToArray()
 }finally{[Array]::Clear($buffer,0,$buffer.Length);$owned=$memory.GetBuffer();[Array]::Clear($owned,0,$owned.Length);$memory.Dispose()}
 [SodaDesktopSigninAdminController]::Run($OwnerSid,$ManifestSha256,$operation)|ConvertTo-Json -Depth 10 -Compress
}catch{[Console]::Error.WriteLine('Signin administration failed or returned an uncertain outcome. Inspect status before another explicit command.');exit 1}
finally{if($null -ne $operation){[Array]::Clear($operation,0,$operation.Length)}}
