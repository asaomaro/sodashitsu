$ErrorActionPreference='Stop'
# Pure process/session/consent/replay facts; no native entry point or OS input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninScope.cs'),(Join-Path $PSScriptRoot 'WindowsSigninScopeChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll
[SodaDesktopSigninScopeChecks]::Run()
