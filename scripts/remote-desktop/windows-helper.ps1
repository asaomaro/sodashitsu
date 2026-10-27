param([int]$MonitorIndex = 0, [switch]$AllowInput, [switch]$AllowClipboard, [switch]$AllowMonitors, [switch]$AllowVirtualDisplay, [switch]$AllowElevated, [switch]$AllowDisplayResize, [switch]$ValidateOnly, [switch]$AllowUnlock, [switch]$UnlockLease, [ValidateSet("auto","gdi")][string]$CaptureBackend = "auto")
$ErrorActionPreference = 'Stop'
# Loading and compilation are side-effect free: -ValidateOnly never opens a window,
# captures the screen, queries the input desktop, or sends input.
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, System.Web.Extensions, System.ServiceProcess
$unlock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs') -Raw
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs') -Raw
$audioPath = Join-Path $PSScriptRoot 'WindowsDesktopAudio.cs'
$audioSource = if (Test-Path -LiteralPath $audioPath) { Get-Content -LiteralPath $audioPath -Raw } else { '' }
$micPath = Join-Path $PSScriptRoot 'WindowsDesktopMicrophone.cs'
$micSource = if (Test-Path -LiteralPath $micPath) { Get-Content -LiteralPath $micPath -Raw } else { '' }
$richPath = Join-Path $PSScriptRoot 'WindowsDesktopRichClipboard.cs'
$richSource = if (Test-Path -LiteralPath $richPath) { Get-Content -LiteralPath $richPath -Raw } else { '' }
$codecPath = Join-Path $PSScriptRoot 'WindowsCodecProbe.cs'
$codecSource = if (Test-Path -LiteralPath $codecPath) { Get-Content -LiteralPath $codecPath -Raw } else { '' }
$virtualSource = @('WindowsVirtualDisplay.cs','WindowsVirtualDisplayNative.cs','WindowsVirtualDisplayChannel.cs') | ForEach-Object { Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw }
$protectedSource = @('WindowsProtectedEpoch.cs','WindowsProtectedScope.cs','WindowsProtectedScopeNative.cs','WindowsProtectedHandshake.cs','WindowsProtectedWorker.cs') | ForEach-Object { Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw }
$combined = ($protectedSource -join "`n") + "`n" + ($virtualSource -join "`n") + "`n" + $codecSource + "`n" + $unlock + "`n" + $source + "`n" + $audioSource + "`n" + $richSource + "`n" + $micSource
$usings = [regex]::Matches($combined,'(?m)^using [^;]+;') | ForEach-Object { $_.Value } | Select-Object -Unique
$combined = ($usings -join "`n") + "`n" + [regex]::Replace($combined,'(?m)^using [^;]+;','')
Add-Type -TypeDefinition $combined -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
if ($ValidateOnly) { Write-Output 'desktop_helper_compiled'; exit 0 }
if ($CaptureBackend -eq "gdi") { $env:SODA_DESKTOP_CAPTURE = "gdi" }
[SodaDesktopUnlock]::SetUtf8Console()
try {
    $virtualRequested = $AllowVirtualDisplay -and $env:SODA_DESKTOP_VIRTUAL_REQUEST -eq '1'
    $elevatedRequested = $AllowElevated -and $env:SODA_DESKTOP_ELEVATED_REQUEST -eq '1'
    if ($virtualRequested -and $elevatedRequested) { throw 'Conflicting desktop requests.' }
    if ($UnlockLease) {
        [SodaDesktopUnlock]::RunInstalled($true,$AllowVirtualDisplay.IsPresent,$AllowUnlock.IsPresent,$AllowElevated.IsPresent)
        exit 0
    }
    if ($elevatedRequested) {
        if (-not (Test-Path -LiteralPath ([SodaDesktopUnlock]::InstalledExecutable()))) {
            [Console]::Out.WriteLine('{"type":"protected_desktop_failure","code":"service_missing"}')
            exit 0
        }
        [SodaDesktopUnlock]::RunInstalled($false,$false,$false,$true)
        exit 0
    }
    $selected = 'normal'
    if (-not $UnlockLease -and $AllowUnlock -and -not $virtualRequested) { $selected = [SodaDesktopUnlock]::SelectSource() }
    if ($selected -eq 'transition') { [SodaDesktopUnlock]::SourceTransition(); exit 0 }
    if ($selected -eq 'cover') {
        [SodaDesktopUnlock]::RunUserLockScreen($AllowInput.IsPresent)
        exit 0
    }
    if ($selected -eq 'secure') {
        $executable = [SodaDesktopUnlock]::InstalledExecutable()
        if (-not (Test-Path -LiteralPath $executable)) { throw 'Install the unlock service first.' }
        [SodaDesktopUnlock]::RunInstalled($UnlockLease.IsPresent,$AllowVirtualDisplay.IsPresent,$AllowUnlock.IsPresent)
        exit 0
    }
    if ($AllowUnlock) {
        [SodaDesktopUnlock]::RunNormal($MonitorIndex, $AllowInput.IsPresent, $AllowClipboard.IsPresent, $AllowDisplayResize.IsPresent, (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'), $AllowMonitors.IsPresent, $AllowVirtualDisplay.IsPresent)
        exit 0
    }
    [SodaDesktopHost]::Run($MonitorIndex, $AllowInput.IsPresent, $AllowClipboard.IsPresent, $AllowDisplayResize.IsPresent, (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'), $null, $AllowMonitors.IsPresent, $AllowVirtualDisplay.IsPresent) }
catch { [Console]::Error.WriteLine('Desktop sharing stopped or unavailable.'); exit 1 }
