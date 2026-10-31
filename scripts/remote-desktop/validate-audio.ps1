$ErrorActionPreference='Stop'
# Generated PCM and current-process pipe only. No render endpoint is opened.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopPipeKernel.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopAudio.cs'),(Join-Path $PSScriptRoot 'WindowsAudioChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll
[SodaDesktopTests.AudioChecks]::Run()
