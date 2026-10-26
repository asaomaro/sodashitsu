param([switch]$ValidateOnly, [switch]$Uninstall, [string]$OwnerSid = ([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$ErrorActionPreference = 'Stop'
if ($OwnerSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'Specify the Windows account SID which runs Sodashitsu.' }
Add-Type -AssemblyName System.Drawing,System.Windows.Forms,System.Web.Extensions,System.ServiceProcess
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($OwnerSid)))).Replace('-','').Substring(0,16) } finally { $sha.Dispose() }
$name = 'SodaDesktopUnlock-' + $suffix
$programFiles = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit Windows PowerShell.' }
$container = Join-Path $programFiles 'Sodashitsu'
$destination = Join-Path $container $name
$executable = Join-Path $destination 'DesktopUnlock.exe'
$source = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs') -Raw).Replace('__OWNER_SID__',$OwnerSid).Replace('__SERVICE_NAME__',$name)
$hostSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs') -Raw
$virtualSource = @('WindowsVirtualDisplay.cs','WindowsVirtualDisplayNative.cs','WindowsVirtualDisplayChannel.cs') | ForEach-Object { Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw }
$combined = $source + "`n" + $hostSource + "`n" + ($virtualSource -join "`n")
$usings = [regex]::Matches($combined,'(?m)^using [^;]+;') | ForEach-Object { $_.Value } | Select-Object -Unique
$combined = ($usings -join "`n") + "`n" + [regex]::Replace($combined,'(?m)^using [^;]+;','')
$refs = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.ServiceProcess.dll')
if ($ValidateOnly) {
    # Compilation only: no desktop API, SCM, elevation, files in Program Files, or input.
    $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
    $parameters.CompilerOptions = '/platform:x64'
    $parameters.ReferencedAssemblies.AddRange([string[]]$refs)
    Add-Type -TypeDefinition $combined -CompilerParameters $parameters
    Write-Output 'desktop_unlock_compiled'
    exit 0
}
if ((Get-ItemPropertyValue -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name CurrentMajorVersionNumber) -lt 10) { throw 'Windows 10/11 x64 is required.' }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this installer once from an administrator PowerShell on the sharing PC.' }
# Refuse redirected install roots. Never install privileged executable into a user-writeable tree.
foreach ($path in @($programFiles,$container,$destination)) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse points are not permitted in the install path.' }
}
if (Test-Path -LiteralPath $container) {
    $acl = Get-Acl -LiteralPath $container
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($owner -notin @('S-1-5-18','S-1-5-32-544')) { throw 'The existing Sodashitsu install root is not administrator-owned. Inspect it locally before installation.' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and (([int]$rule.FileSystemRights -band 0xD0156) -ne 0) -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'The existing Sodashitsu install root is writeable by a non-administrator.' }
    }
}
if (Test-Path -LiteralPath $destination) {
    foreach ($item in Get-ChildItem -LiteralPath $destination -Force) {
        if ($item.Name -ne 'DesktopUnlock.exe' -or $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unexpected files in the old helper directory. Inspect and remove them locally before installation.' }
    }
}
$existing = Get-Service -Name $name -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -ne 'Stopped') { Stop-Service -Name $name; $existing.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(10)) }
    & sc.exe delete $name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot remove the previous service registration.' }
    $existing.Dispose()
    for ($i=0; $i -lt 50; $i++) { if (-not (Get-Service -Name $name -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 100 }
}
if ($Uninstall) {
    if (Test-Path -LiteralPath $executable) { Remove-Item -LiteralPath $executable -Force }; if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    Write-Output 'desktop_unlock_removed'; exit 0
}
# Never reuse a previously writeable app directory or leave DLL/config sidecars.
if (-not (Test-Path -LiteralPath $container)) {
    [IO.Directory]::CreateDirectory($container) | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm(('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;' + $OwnerSid + ')'))
    Set-Acl -LiteralPath $container -AclObject $acl
}
if (Test-Path -LiteralPath $executable) { Remove-Item -LiteralPath $executable -Force }
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
$stage = Join-Path $container ('install-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetSecurityDescriptorSddlForm(('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;' + $OwnerSid + ')'))
Set-Acl -LiteralPath $stage -AclObject $acl
$temp = Join-Path $stage 'DesktopUnlock.exe'
try {
    $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
    $parameters.CompilerOptions = '/platform:x64 /target:exe'
    $parameters.GenerateExecutable = $true
    $parameters.OutputAssembly = $temp
    $parameters.TempFiles = [System.CodeDom.Compiler.TempFileCollection]::new($stage,$false)
    $parameters.ReferencedAssemblies.AddRange([string[]]$refs)
    $compiler = New-Object Microsoft.CSharp.CSharpCodeProvider
    try {
        $result = $compiler.CompileAssemblyFromSource($parameters, [string[]]@($combined))
        if ($result.Errors.HasErrors) { throw ('Unlock helper compilation failed: ' + ($result.Errors | Out-String)) }
    } finally { $compiler.Dispose() }
    $parameters.TempFiles.Delete()
    foreach ($item in Get-ChildItem -LiteralPath $stage -Force) {
        if ($item.Name -ne 'DesktopUnlock.exe' -or $item.PSIsContainer) { throw 'Unexpected compiler output in the protected staging directory.' }
    }
    Move-Item -LiteralPath $stage -Destination $destination
    # LocalSystem, Manual (DemandStart). It is not started by installation.
    New-Service -Name $name -BinaryPathName ('"' + $executable + '"') -StartupType Manual -DisplayName ('Sodashitsu desktop unlock (' + $OwnerSid + ')') | Out-Null
    & sc.exe sdset $name ('D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;CCLCRP;;;' + $OwnerSid + ')') | Out-Null
    if ($LASTEXITCODE -ne 0) { & sc.exe delete $name | Out-Null; throw 'Could not restrict service permissions.' }
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }; if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force } }
Write-Output 'desktop_unlock_installed_demand_start'
