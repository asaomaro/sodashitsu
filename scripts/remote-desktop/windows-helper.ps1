param([int]$MonitorIndex = 0, [switch]$AllowInput, [switch]$AllowClipboard, [switch]$AllowDisplayResize, [switch]$ValidateOnly, [switch]$AllowUnlock, [switch]$UnlockLease, [ValidateSet("auto","gdi")][string]$CaptureBackend = "auto")
$ErrorActionPreference = 'Stop'
# Loading and compilation are side-effect free: -ValidateOnly never opens a window,
# captures the screen, queries the input desktop, or sends input.
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, System.Web.Extensions, System.ServiceProcess
$unlock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs') -Raw
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs') -Raw
$combined = $unlock + "`n" + $source
$usings = [regex]::Matches($combined,'(?m)^using [^;]+;') | ForEach-Object { $_.Value } | Select-Object -Unique
$combined = ($usings -join "`n") + "`n" + [regex]::Replace($combined,'(?m)^using [^;]+;','')
Add-Type -TypeDefinition $combined -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
if ($ValidateOnly) { Write-Output 'desktop_helper_compiled'; exit 0 }
if ($CaptureBackend -eq "gdi") { $env:SODA_DESKTOP_CAPTURE = "gdi" }
[SodaDesktopUnlock]::SetUtf8Console()
try {
    $selected = 'normal'
    if (-not $UnlockLease -and $AllowUnlock) { $selected = [SodaDesktopUnlock]::SelectSource() }
    if ($selected -eq 'transition') { [SodaDesktopUnlock]::SourceTransition(); exit 0 }
    if ($selected -eq 'cover') {
        [SodaDesktopUnlock]::RunUserLockScreen($AllowInput.IsPresent)
        exit 0
    }
    if ($UnlockLease -or $selected -eq 'secure') {
        $executable = [SodaDesktopUnlock]::InstalledExecutable()
        if (-not (Test-Path -LiteralPath $executable)) { throw 'Install the unlock service first.' }
        [SodaDesktopUnlock]::RunInstalled($UnlockLease.IsPresent)
        exit 0
    }
    if ($AllowUnlock) {
        [SodaDesktopUnlock]::RunNormal($MonitorIndex, $AllowInput.IsPresent, $AllowClipboard.IsPresent, $AllowDisplayResize.IsPresent, (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'))
        exit 0
    }
    [SodaDesktopHost]::Run($MonitorIndex, $AllowInput.IsPresent, $AllowClipboard.IsPresent, $AllowDisplayResize.IsPresent, (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs')) }
catch { [Console]::Error.WriteLine('Desktop sharing stopped or unavailable.'); exit 1 }
