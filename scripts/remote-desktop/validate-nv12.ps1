param([switch]$Benchmark, [switch]$Gpu, [switch]$CaptureDesktop)
$ErrorActionPreference = 'Stop'
# Generated pixels only; -Gpu uses generated textures. No encoder, capture,
# input-desktop queries or OS input. A fixed cursor sprite is rendered in memory.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsNv12Checks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.Nv12Checks]::Run()
if ($Benchmark) { [SodaDesktopTests.Nv12Checks]::Benchmark() }
if ($Gpu) { [SodaDesktopTests.Nv12Checks]::Gpu([bool]$Benchmark) }
if ($CaptureDesktop) { [SodaDesktopTests.Nv12Checks]::Live() }
