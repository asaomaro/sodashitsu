$ErrorActionPreference='Stop'
# Pure fake state checks. Never invokes a native backend or installs a driver.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsVirtualDisplay.cs'),(Join-Path $PSScriptRoot 'WindowsVirtualDisplayNative.cs'),(Join-Path $PSScriptRoot 'WindowsVirtualDisplayChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll
[SodaDesktopVirtualDisplayChecks]::Run()

[SodaDesktopVirtualDisplayNative]::VerifyLayouts()
