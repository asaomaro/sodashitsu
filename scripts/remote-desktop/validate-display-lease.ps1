$ErrorActionPreference = 'Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'), (Join-Path $PSScriptRoot 'WindowsDisplayLeaseChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll
[SodaDesktopTests.DisplayModeChecks]::Run()
