param([switch]$CaptureDesktop)
$ErrorActionPreference = 'Stop'
# Explicit GPU opt-in, generated pixels only; never captures the desktop or sends input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsDxgiChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.DxgiChecks]::Run()

if ($CaptureDesktop) { [SodaDesktopTests.DxgiLiveChecks]::Run() }
