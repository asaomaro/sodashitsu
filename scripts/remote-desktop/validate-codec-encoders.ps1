param([string]$FixtureFolder)
$ErrorActionPreference='Stop'
# Generated pixels only; hardware MFT success and unsupported paths are distinct.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsCodecEncodeChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.CodecEncodeChecks]::Run($(if($FixtureFolder){$FixtureFolder}else{$null}))
