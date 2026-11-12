$ErrorActionPreference='Stop'
# Compilation and pure policy/state checks only. Never starts a service, creates a
# device, captures a screen, changes modes, sends OS input, or accesses clipboard.
$names=@('WindowsDesktopUnlock.cs','WindowsDesktopHost.cs','WindowsDesktopHostChecks.cs','WindowsDesktopUnlockChecks.cs','WindowsVirtualDisplay.cs','WindowsVirtualDisplayNative.cs','WindowsVirtualDisplayNativeChecks.cs','WindowsVirtualDisplayChannel.cs','WindowsVirtualDisplayChecks.cs')
$combined=($names|ForEach-Object{Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw}) -join "`n"
$usings=[regex]::Matches($combined,'(?m)^using [^;]+;')|ForEach-Object{$_.Value}|Select-Object -Unique
$combined=($usings -join "`n")+"`n"+[regex]::Replace($combined,'(?m)^using [^;]+;','')
$testCompiler=[CodeDom.Compiler.CompilerParameters]::new([string[]]@('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'));$testCompiler.CompilerOptions='/define:SODA_DESKTOP_TEST';Add-Type -TypeDefinition $combined -CompilerParameters $testCompiler
[SodaDesktopUnlock]::VerifyLeasePurposes()
[SodaDesktopHost]::VerifyVirtualDesktopGuard()
[SodaDesktopVirtualClient]::VerifyReadyMessages()
[SodaDesktopVirtualDisplayChecks]::Run()
[SodaDesktopVirtualDisplayNative]::VerifyLayouts()
