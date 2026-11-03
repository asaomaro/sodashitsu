$ErrorActionPreference = 'Stop'
# Only disposable cmd.exe children; no SCM, desktop switching, capture or input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsUnlockProcessChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopUnlock]::SetUtf8Console()
[SodaDesktopTests.UnlockProcessChecks]::RunExitCodes()
