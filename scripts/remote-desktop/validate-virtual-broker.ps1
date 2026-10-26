$ErrorActionPreference='Stop'
# Compilation and pure policy/state checks only. Never starts a service, creates a
# device, captures a screen, changes modes, sends OS input, or accesses clipboard.
$names=@('WindowsDesktopUnlock.cs','WindowsDesktopHost.cs','WindowsVirtualDisplay.cs','WindowsVirtualDisplayNative.cs','WindowsVirtualDisplayChannel.cs','WindowsVirtualDisplayChecks.cs')
$combined=($names|ForEach-Object{Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw}) -join "`n"
$usings=[regex]::Matches($combined,'(?m)^using [^;]+;')|ForEach-Object{$_.Value}|Select-Object -Unique
$combined=($usings -join "`n")+"`n"+[regex]::Replace($combined,'(?m)^using [^;]+;','')
Add-Type -TypeDefinition $combined -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopUnlock]::VerifyLeasePurposes()
[SodaDesktopHost]::VerifyVirtualDesktopGuard()
[SodaDesktopVirtualClient]::VerifyReadyMessages()
[SodaDesktopVirtualDisplayChecks]::Run()
[SodaDesktopVirtualDisplayNative]::VerifyLayouts()
