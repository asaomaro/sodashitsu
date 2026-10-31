# Compile the real adapter, execute only the generated driver. Never inspect Explorer.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('soda-explorer-selection-worker-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
  $output = Join-Path $fixture 'checks.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', '/main:ExplorerSelectionWorkerChecks', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'WPF\WindowsBase.dll', 'WPF\UIAutomationClient.dll', 'WPF\UIAutomationTypes.dll', 'System.Web.Extensions.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  $arguments += @((Join-Path $PSScriptRoot 'WindowsExplorerSelection.cs'), (Join-Path $PSScriptRoot 'WindowsExplorerSelectionWorker.cs'), (Join-Path $PSScriptRoot 'WindowsExplorerSelectionWorkerChecks.cs'))
  & (Join-Path $framework 'csc.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Explorer selection generated compilation failed' }
  & $output
  if ($LASTEXITCODE -ne 0) { throw 'Explorer selection generated checks failed' }
  # The private generated-fixture builder is exercised, but its worker receives no request:
  # its independent timer must end a blocked private stdin without touching UIA.
  $built = (& (Join-Path $PSScriptRoot 'build-explorer-selection-fixture.ps1') | ConvertFrom-Json)
  $child = $null
  try {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $built.binary
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $child = [Diagnostics.Process]::Start($start)
    if (!$child.WaitForExit(8500) -or $child.ExitCode -ne 124) { throw 'Selection worker stdin watchdog failed' }
    if ($child.StandardOutput.ReadToEnd() -ne '') { throw 'Unrequested selection output' }
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $owner = (Get-Acl -LiteralPath $built.directory).GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $user) { throw 'Selection build directory owner mismatch' }
    [Console]::WriteLine('explorer_selection_owned_builder_private_owner_blocked_input_exit_passed')
  } finally {
    if ($child) { if (!$child.HasExited) { $child.Kill(); if (!$child.WaitForExit(5000)) { throw 'Owned selection fixture did not exit' } }; $child.Dispose() }
    if ($built) { [IO.File]::Delete($built.binary); [IO.Directory]::Delete($built.directory) }
  }
} finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force } }
