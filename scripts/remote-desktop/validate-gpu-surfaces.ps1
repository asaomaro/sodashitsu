param([string]$FixtureFile, [switch]$Benchmark)
$ErrorActionPreference = 'Stop'
# Generated GPU textures and hardware encoder only. No desktop capture or input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsGpuSurfaceChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.GpuSurfaceChecks]::Run($(if($FixtureFile){$FixtureFile}else{$null}))
if ($Benchmark) { [SodaDesktopTests.GpuSurfaceChecks]::Run($null,1280,800); [SodaDesktopTests.GpuSurfaceChecks]::Run($null,1920,1200) }
