$ErrorActionPreference='Stop'
# Compile the normal helper but run geometry with a fake driver only.
$testCompiler=[CodeDom.Compiler.CompilerParameters]::new([string[]]@('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'));$testCompiler.CompilerOptions='/define:SODA_DESKTOP_TEST';Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHostChecks.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopUnlockChecks.cs'),(Join-Path $PSScriptRoot 'WindowsMonitorChecks.cs')) -CompilerParameters $testCompiler
[SodaDesktopTests.MonitorChecks]::Run()
