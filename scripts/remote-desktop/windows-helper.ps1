param([int]$MonitorIndex = 0, [switch]$AllowInput, [switch]$AllowClipboard, [switch]$AllowDisplayResize, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
# Loading and compilation are side-effect free: -ValidateOnly never opens a window,
# captures the screen, queries the input desktop, or sends input.
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, System.Web.Extensions
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs') -Raw
Add-Type -TypeDefinition $source -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll
if ($ValidateOnly) { Write-Output 'desktop_helper_compiled'; exit 0 }
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try { [SodaDesktopHost]::Run($MonitorIndex, $AllowInput.IsPresent, $AllowClipboard.IsPresent, $AllowDisplayResize.IsPresent, (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs')) }
catch { [Console]::Error.WriteLine('Desktop sharing stopped or unavailable.'); exit 1 }
