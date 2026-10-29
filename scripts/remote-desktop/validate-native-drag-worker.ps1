# Real worker compiled; fake OLE/desktop/slot drivers and owned console child only.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-native-drag-worker-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', '/main:NativeDragWorkerChecks', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'System.Security.dll', 'System.Web.Extensions.dll', 'System.Windows.Forms.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  foreach ($name in @('WindowsNativeDragLease.cs', 'WindowsNativeDragStreams.cs', 'WindowsNativeDragDataObject.cs', 'WindowsNativeDragPackets.cs', 'WindowsNativeDragPump.cs', 'WindowsNativeDragSlot.cs', 'WindowsNativeDragWorker.cs', 'WindowsNativeDragWorkerChecks.cs')) { $arguments += (Join-Path $PSScriptRoot $name) }
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Native drag worker generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Native drag worker generated checks failed' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
