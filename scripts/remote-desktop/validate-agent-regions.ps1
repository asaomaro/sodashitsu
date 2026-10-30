# The actual input code is memory-backed before invocation. No real SendInput/window query.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-agent-regions-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', '/main:SodaAgentRegionChecks', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', 'System.ServiceProcess.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  foreach ($name in @('WindowsDesktopUnlock.cs', 'WindowsDesktopHost.cs', 'WindowsAgentRegionChecks.cs')) { $arguments += (Join-Path $PSScriptRoot $name) }
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Agent region generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Agent region generated checks failed' }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
