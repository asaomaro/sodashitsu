$ErrorActionPreference='Stop'
# Pure generated facts only. No token/session/desktop query, service, or OS input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsProtectedEpoch.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedScope.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedScopeNative.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedScopeChecks.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll,System.Drawing.dll,System.Windows.Forms.dll,System.ServiceProcess.dll
[SodaDesktopProtectedScopeChecks]::Run()

[SodaDesktopProtectedScopeNative]::VerifyLayouts()
