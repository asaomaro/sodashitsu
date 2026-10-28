$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated crypto and in-memory ACLs only. Never opens a real vault or service.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninVault.cs'),(Join-Path $PSScriptRoot 'WindowsSigninVaultChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll
[SodaDesktopSigninVaultChecks]::Run()
. (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
. (Join-Path $PSScriptRoot 'SigninAclPolicy.ps1')
function Descriptor([string]$sddl,[bool]$directory=$false) {
    if($directory){$value=[Security.AccessControl.DirectorySecurity]::new()}else{$value=[Security.AccessControl.FileSecurity]::new()}
    $value.SetSecurityDescriptorSddlForm($sddl);return $value
}
$private=Descriptor 'O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)'
if(-not (Test-SodaSigninStorageAcl $private)){throw 'Generated confidential ACL rejected'}
$user='S-1-5-21-1-2-3-1001'
foreach($sddl in @('O:SYG:SYD:P(A;;FA;;;SY)(A;;FR;;;WD)',('O:SYG:SYD:P(A;;FA;;;SY)(A;;FR;;;'+$user+')'),'O:SYG:SYD:P(A;;FA;;;SY)(A;;FW;;;WD)',('O:'+$user+'G:SYD:P(A;;FA;;;SY)'), 'O:SYG:SY')) {
    if(Test-SodaSigninStorageAcl (Descriptor $sddl)){throw 'Generated unsafe confidential ACL accepted'}
}
$inherited=Descriptor 'O:SYG:SYD:P(A;;FA;;;SY)(A;OICIIO;FR;;;WD)' $true
if(Test-SodaSigninStorageAcl $inherited){throw 'Generated public child inheritance accepted'}
$empty=Descriptor 'O:SYG:SYD:'
if(-not (Test-SodaSigninStorageAcl $empty)){throw 'Generated deny-all ACL rejected'}
$read=Descriptor 'O:SYG:SYD:P(A;;FA;;;SY)(A;;FR;;;WD)'
$rules=@($read.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
if(-not (Test-SodaEndpointAcl 'S-1-5-18' $rules 'S-1-5-18' $true)){throw 'Existing CurrentUser read-only policy changed'}
if(Test-SodaSigninStorageAcl $read){throw 'Machine-scope storage reused CurrentUser read permission'}
'signin_vault_generated_acl_passed'

# The runtime reader must refuse the CI's ordinary account before account/path
# lookup. Skip this invocation if a future runner itself is SYSTEM.
if(-not [SodaDesktopSigninVault]::SystemPrimary()) {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
    $info.Arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'read-signin-enrollment.ps1')+'" -OwnerSid '+$user
    $info.WorkingDirectory=[Environment]::GetFolderPath('System');$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $child=[Diagnostics.Process]::new();$child.StartInfo=$info
    try {
        [void]$child.Start();$output=$child.StandardOutput.ReadToEndAsync();$errors=$child.StandardError.ReadToEndAsync()
        if(-not $child.WaitForExit(15000) -or -not $output.Wait(1000) -or -not $errors.Wait(1000)){throw 'Generated reader refusal timed out'}
        if($child.ExitCode -ne 1 -or $output.Result.Length -ne 0 -or -not $errors.Result.Contains('Signin enrollment is unavailable')){throw 'Non-SYSTEM reader refusal failed'}
    } finally {try{if(-not $child.HasExited){$child.Kill()}}finally{$child.Dispose()}}
    'signin_vault_non_system_refused'
} else {'signin_vault_non_system_check_skipped_system_runner'}
