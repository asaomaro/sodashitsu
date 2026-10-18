$ErrorActionPreference = 'Stop'
# No SCM, elevation, screen capture, desktop switching, or OS input.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs'),(Join-Path $PSScriptRoot 'WindowsDisplayLeaseChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopUnlock]::CheckPipeCancellation()
[SodaDesktopUnlock]::CheckPipeText()
[SodaDesktopTests.DisplayModeChecks]::Run()
Write-Output 'desktop_unlock_checks_passed'
# The installed lease/share proxy runs without a Windows console. Exercise the
# actual stream setup in a fresh CreateNoWindow process, not a code-page setter.
$command = @'
$ErrorActionPreference = 'Stop'
$root = '__ROOT__'
Add-Type -Path @((Join-Path $root 'WindowsDesktopUnlock.cs'),(Join-Path $root 'WindowsDesktopHost.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
[SodaDesktopUnlock]::SetUtf8Console()
$expected = [string][char]0x65e5 + [char]0x672c + [char]0x8a9e + [char]::ConvertFromUtf32(0x1f600)
if ([Console]::In.ReadLine() -cne $expected) { throw 'UTF-8 mismatch' }
[Console]::Out.WriteLine('desktop_unlock_no_console_utf8_passed')
'@
$command = $command.Replace('__ROOT__',$PSScriptRoot.Replace("'","''"))
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = Join-Path $PSHOME 'powershell.exe'
$start.Arguments = '-NoProfile -NonInteractive -EncodedCommand ' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($start)
try {
    $writer = [IO.StreamWriter]::new($process.StandardInput.BaseStream,[Text.UTF8Encoding]::new($false))
    $writer.WriteLine(([string][char]0x65e5 + [char]0x672c + [char]0x8a9e + [char]::ConvertFromUtf32(0x1f600)))
    $writer.Close()
    if (-not $process.WaitForExit(15000)) { $process.Kill(); throw 'No-console helper check timed out' }
    if ($process.ExitCode -ne 0) { throw 'No-console helper check failed' }
    Write-Output $process.StandardOutput.ReadToEnd().Trim()
} finally { if (-not $process.HasExited) { $process.Kill() }; $process.Dispose() }
