# Generated memory/COM buffers only. Never inspects a real desktop or injects input.
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (!(Test-Path -LiteralPath $compiler)) { throw 'Native drag compiler is unavailable' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-native-drag-lease-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', "/reference:$(Join-Path (Split-Path -Parent $compiler) 'System.dll')", "/reference:$(Join-Path (Split-Path -Parent $compiler) 'System.Core.dll')", "/reference:$(Join-Path (Split-Path -Parent $compiler) 'System.Web.Extensions.dll')", "/out:$output", (Join-Path $PSScriptRoot 'WindowsNativeDragLease.cs'), (Join-Path $PSScriptRoot 'WindowsNativeDragStreams.cs'), (Join-Path $PSScriptRoot 'WindowsNativeDragDataObject.cs'), (Join-Path $PSScriptRoot 'WindowsNativeDragPackets.cs'), (Join-Path $PSScriptRoot 'WindowsNativeDragLeaseChecks.cs'))
  & $compiler @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Native drag generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Native drag generated checks failed' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
