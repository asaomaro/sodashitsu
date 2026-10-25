param([string]$FixtureFile, [switch]$Benchmark, [ValidateSet(30,60)][int]$Fps=30)
$ErrorActionPreference = 'Stop'
# Generated GPU textures and hardware encoder only. No desktop capture or input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsGpuSurfaceChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.GpuSurfaceChecks]::Run($(if($FixtureFile){$FixtureFile}else{$null}),640,360,$Fps)
if ($Benchmark) { [SodaDesktopTests.GpuSurfaceChecks]::Run($null,1280,800,$Fps); [SodaDesktopTests.GpuSurfaceChecks]::Run($null,1920,1200,$Fps) }
