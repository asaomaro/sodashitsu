# Compile the real adapter, execute only the generated driver. Never inspect Explorer.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-explorer-selection-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'WPF\WindowsBase.dll', 'WPF\UIAutomationClient.dll', 'WPF\UIAutomationTypes.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  $arguments += @((Join-Path $PSScriptRoot 'WindowsExplorerSelection.cs'), (Join-Path $PSScriptRoot 'WindowsExplorerSelectionChecks.cs'))
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Explorer selection generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Explorer selection generated checks failed' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
