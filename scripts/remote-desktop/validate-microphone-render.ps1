$ErrorActionPreference = 'Stop'
# Pure arithmetic/staging only: no Wasapi/COM/pipe/token/audio endpoint instance.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopPipeKernel.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopMicrophone.cs'),(Join-Path $PSScriptRoot 'WindowsMicrophoneRenderChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll
exit [SodaMicrophoneRenderChecks]::Main()
