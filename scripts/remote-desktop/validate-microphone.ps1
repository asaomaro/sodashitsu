$ErrorActionPreference = 'Stop'
# Generated PCM and an in-memory sink only: no audio endpoint activation.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopAudio.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopMicrophone.cs'),(Join-Path $PSScriptRoot 'WindowsMicrophoneChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll
[SodaMicrophoneChecks]::Run()
