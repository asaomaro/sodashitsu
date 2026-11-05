$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -ne 'S-1-5-21-2255109513-3773794534-3440117263-1001' -or $identity.ImpersonationLevel -ne 'None' -or ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or [Diagnostics.Process]::GetCurrentProcess().SessionId -le 0){exit 40}
$env:SODA_RECOVERY_SESSION_ID=[string][Diagnostics.Process]::GetCurrentProcess().SessionId
& 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'test-user-server.mjs')
exit $LASTEXITCODE
