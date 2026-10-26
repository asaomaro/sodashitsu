$ErrorActionPreference='Stop'
# Memory-only fake clipboard. No OS clipboard/capture/input calls.
Add-Type -AssemblyName System.Drawing,System.Windows.Forms,System.Web.Extensions
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopRichClipboard.cs'),(Join-Path $PSScriptRoot 'WindowsRichClipboardChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll
[SodaDesktopTests.RichClipboardChecks]::Run()
