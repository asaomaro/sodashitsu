param([switch]$BuildOnly)
# Actual C# pump and Node host, generated memory target only; no real OLE.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-native-host-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
$ownedByCaller = $false
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', '/main:NativeHostFixture', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'System.Security.dll', 'System.Web.Extensions.dll', 'System.Windows.Forms.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  foreach ($name in @('WindowsNativeDragLease.cs', 'WindowsNativeDragStreams.cs', 'WindowsNativeDragDataObject.cs', 'WindowsNativeDragPackets.cs', 'WindowsNativeDragPump.cs', 'WindowsNativeDragSlot.cs', 'WindowsNativeDragWorker.cs', 'WindowsNativeDragHostFixture.cs')) { $arguments += (Join-Path $PSScriptRoot $name) }
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Native host generated compilation failed' }
  if ($BuildOnly) { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); Write-Output $output; $ownedByCaller = $true; return }
  & node (Join-Path $PSScriptRoot 'verify-native-host.mjs') $output
  if ($LASTEXITCODE -ne 0) { throw 'Native host generated checks failed' }
} finally { if (!$ownedByCaller -and (Test-Path -LiteralPath $fixture)) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
