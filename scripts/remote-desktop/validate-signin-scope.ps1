$ErrorActionPreference='Stop'
# Pure generated facts. No native queries, capture, input, account or service.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninScope.cs'),(Join-Path $PSScriptRoot 'WindowsSigninScopeChecks.cs'),(Join-Path $PSScriptRoot 'WindowsSigninScopeNative.cs'),(Join-Path $PSScriptRoot 'WindowsSigninCandidate.cs'),(Join-Path $PSScriptRoot 'WindowsSigninCandidateNative.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedEpoch.cs'),(Join-Path $PSScriptRoot 'WindowsSigninVault.cs'),(Join-Path $PSScriptRoot 'WindowsSigninPackage.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.Windows.Forms.dll,System.Drawing.dll
[SodaDesktopSigninScopeChecks]::Run()
[SodaDesktopSigninScopeNative]::VerifyLayouts()
[SodaDesktopSigninScopeNative]::VerifyPrivateMarker()
