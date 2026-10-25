param([switch]$ValidateTimer)
$ErrorActionPreference = 'Stop'
# No desktop capture, OS input, screen files or system timer-resolution changes.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsH264Benchmark.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.H264Benchmark]::Run([bool]$ValidateTimer)
