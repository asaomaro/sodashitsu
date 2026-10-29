# Fixed trusted sources; no command, path, or compiler option is accepted from a viewer.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
if (!(Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User
$security = New-Object Security.AccessControl.DirectorySecurity
$security.SetOwner($user)
$security.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$security.AddAccessRule($rule)
$directory = Join-Path ([IO.Path]::GetTempPath()) ('soda-native-copy-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($directory, $security) | Out-Null
try {
  $output = Join-Path $directory 'native-copy.exe'
  $arguments = @('/nologo', '/noconfig', '/unsafe-', '/warnaserror+', '/target:exe', '/main:Sodashitsu.NativeDrag.NativeDragWorker', "/out:$output")
  foreach ($name in @('System.dll', 'System.Core.dll', 'System.Web.Extensions.dll', 'System.Security.dll', 'System.Windows.Forms.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
  foreach ($name in @('WindowsNativeDragLease.cs', 'WindowsNativeDragStreams.cs', 'WindowsNativeDragDataObject.cs', 'WindowsNativeDragPackets.cs', 'WindowsNativeDragPump.cs', 'WindowsNativeDragSlot.cs', 'WindowsNativeDragWorker.cs')) { $arguments += (Join-Path $PSScriptRoot $name) }
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = Join-Path $framework 'csc.exe'
  $start.Arguments = (($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' ')
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $compiler = [Diagnostics.Process]::Start($start)
  try {
    $stdout = $compiler.StandardOutput.ReadToEndAsync()
    $stderr = $compiler.StandardError.ReadToEndAsync()
    if (!$compiler.WaitForExit(20000)) { $compiler.Kill(); if (!$compiler.WaitForExit(5000)) { throw 'Owned compiler did not exit' }; throw 'Selection worker compilation timed out' }
    $diagnostics = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    if ($compiler.ExitCode -ne 0) { throw "Selection worker compilation failed: $diagnostics" }
  } finally { $compiler.Dispose() }
  [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
  Write-Output (@{binary=$output;directory=$directory} | ConvertTo-Json -Compress)
} catch {
  # This newly allocated directory belongs only to this build.
  if (Test-Path -LiteralPath $output) { [IO.File]::Delete($output) }
  [IO.Directory]::Delete($directory)
  throw
}
