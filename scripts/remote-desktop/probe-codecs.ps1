$ErrorActionPreference='Stop'
# Query encoder registration metadata only; does not capture a screen or send OS input.
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsCodecProbe.cs') -ReferencedAssemblies System.dll,System.Core.dll
[SodaDesktopCodecProbe]::Read() | ConvertTo-Json -Compress
