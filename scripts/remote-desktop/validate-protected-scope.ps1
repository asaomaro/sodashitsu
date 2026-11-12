$ErrorActionPreference='Stop'
# Pure generated facts only. No token/session/desktop query, service, or OS input.
$testCompiler=[CodeDom.Compiler.CompilerParameters]::new([string[]]@('System.dll','System.Core.dll','System.Web.Extensions.dll','System.Drawing.dll','System.Windows.Forms.dll','System.ServiceProcess.dll'));$testCompiler.CompilerOptions='/define:SODA_DESKTOP_TEST';Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsProtectedScope.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedScopeNative.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedScopeChecks.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHostChecks.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopUnlockChecks.cs')) -CompilerParameters $testCompiler
[SodaDesktopProtectedScopeChecks]::Run()

[SodaDesktopProtectedScopeNative]::CheckLayouts()
