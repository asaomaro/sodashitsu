param([string]$FixtureFile)
$ErrorActionPreference = 'Stop'
# Hardware encoder + generated pixels only. No desktop capture, input, or screen image files.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsH264Checks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.H264Checks]::Run($(if($FixtureFile){$FixtureFile}else{$null}))
