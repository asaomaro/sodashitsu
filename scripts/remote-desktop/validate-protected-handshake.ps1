$ErrorActionPreference='Stop'
# Pure fake streams and generated owner/process scope only. No OS peer or worker.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsProtectedScope.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedHandshake.cs'),(Join-Path $PSScriptRoot 'WindowsProtectedHandshakeChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll
[SodaDesktopProtectedHandshakeChecks]::Run()
