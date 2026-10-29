# Generated pipe registration and stream data only; never starts OLE drag or reads a desktop.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-native-drag-pump-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'System.Web.Extensions.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  foreach ($name in @('WindowsNativeDragLease.cs', 'WindowsNativeDragPackets.cs', 'WindowsNativeDragPump.cs', 'WindowsNativeDragPumpChecks.cs')) { $arguments += (Join-Path $PSScriptRoot $name) }
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Native drag pump generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Native drag pump generated checks failed' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
