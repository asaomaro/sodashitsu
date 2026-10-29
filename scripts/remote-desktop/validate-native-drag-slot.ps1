# Only new private disposable fixture directories and owned child console processes.
# Never changes an existing directory ACL, desktop, input, service, or machine trust.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-native-drag-slot-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'System.Security.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  foreach ($name in @('WindowsNativeDragSlot.cs', 'WindowsNativeDragSlotChecks.cs')) { $arguments += (Join-Path $PSScriptRoot $name) }
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Native drag slot generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Native drag slot generated checks failed' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
