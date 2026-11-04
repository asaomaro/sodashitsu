param([string]$Device='\\.\DISPLAY1')
$ErrorActionPreference='Stop'
# Requires an active Windows display. Starts the real guardian and reads its
# current mode, but never applies a mode: the generated target has zero size and
# cannot match a real display, including if the parent exits unexpectedly.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
$driver=New-Object SodaDesktopDisplay+NativeDriver((Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'))
$sentinel=New-Object SodaDesktopDisplay+Mode
try {
    $driver.Arm($Device,$sentinel,$sentinel)
} finally {
    $driver.Disarm()
}
[SodaDesktopDisplay]::WaitForPrevious($Device)
'display_guardian_live_start_stop_passed: native mode read only; no display mode applied'
