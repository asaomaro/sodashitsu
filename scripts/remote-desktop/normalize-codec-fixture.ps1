param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputFile,[ValidateSet('hevc','av1')][string]$Family)
$ErrorActionPreference='Stop'
# Test fixture bytes only. Does not query any OS capture/input/clipboard APIs.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsCodecPacketChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopTests.CodecPacketChecks]::NormalizeFixture($InputFile,$OutputFile,$Family)
