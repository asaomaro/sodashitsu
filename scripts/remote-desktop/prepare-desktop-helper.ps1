param([switch]$ValidateOnly, [switch]$Uninstall, [string]$OwnerSid = ([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$ErrorActionPreference = 'Stop'
if ($OwnerSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'Specify the Windows account SID which runs Sodashitsu.' }
Add-Type -AssemblyName System.Drawing,System.Windows.Forms,System.Web.Extensions
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($OwnerSid)))).Replace('-','').Substring(0,16) } finally { $sha.Dispose() }
$name = 'SodaDesktopRuntime-' + $suffix
$programFiles = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit Windows PowerShell.' }
$container = Join-Path $programFiles 'Sodashitsu'
$destination = Join-Path $container $name
$executable = Join-Path $destination 'DesktopUnlock.exe'
function New-SodaRuntimeTaskDefinition($scheduler,[string]$executable,[string]$destination) {
    $definition=$scheduler.NewTask(0);$definition.RegistrationInfo.Description='Sodashitsu on-demand desktop helper; no boot or login trigger.'
    $definition.Principal.UserId='SYSTEM';$definition.Principal.LogonType=5;$definition.Principal.RunLevel=1
    $settings=$definition.Settings;$settings.Enabled=$true;$settings.AllowDemandStart=$true;$settings.MultipleInstances=2;$settings.ExecutionTimeLimit='PT0S';$settings.RestartCount=0
    $settings.DisallowStartIfOnBatteries=$false;$settings.StopIfGoingOnBatteries=$false;$settings.RunOnlyIfIdle=$false;$settings.RunOnlyIfNetworkAvailable=$false;$settings.StartWhenAvailable=$false;$settings.WakeToRun=$false
    $action=$definition.Actions.Create(0);$action.Path=$executable;$action.Arguments='--runtime-broker $(Arg0) $(Arg1) $(Arg2)';$action.WorkingDirectory=$destination
    return $definition
}
$source = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs') -Raw).Replace('__OWNER_SID__',$OwnerSid).Replace('__TASK_NAME__',$name)
$hostSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsDesktopHost.cs') -Raw
$virtualSource = @('WindowsVirtualDisplay.cs','WindowsVirtualDisplayNative.cs','WindowsVirtualDisplayChannel.cs') | ForEach-Object { Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw }
$protectedSource = @('WindowsProtectedScope.cs','WindowsProtectedScopeNative.cs','WindowsProtectedHandshake.cs','WindowsProtectedWorker.cs') | ForEach-Object { Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw }
$combined =  ($protectedSource -join "`n") + "`n" + $source + "`n" + $hostSource + "`n" + ($virtualSource -join "`n")
$usings = [regex]::Matches($combined,'(?m)^using [^;]+;') | ForEach-Object { $_.Value } | Select-Object -Unique
$combined = ($usings -join "`n") + "`n" + [regex]::Replace($combined,'(?m)^using [^;]+;','')
$refs = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll')
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
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $ValidateOnly -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    # The only UAC prompt is this explicit local preparation, never a background
    # lease retry. Preserve the intended owner even with another admin account.
    $command="& '"+$PSCommandPath.Replace("'","''")+"' -OwnerSid '"+$OwnerSid+"'"+$(if($Uninstall){' -Uninstall'}else{''})
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $child=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-EncodedCommand',$encoded) -Verb RunAs -PassThru -Wait
    if ($child.ExitCode -ne 0) { throw 'Desktop helper preparation was not completed.' };exit 0
}
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
# Runtime preparation never reads or mutates a Windows service registration.
$taskFolder=$null;$existingTask=$null
$scheduler=New-Object -ComObject 'Schedule.Service';$scheduler.Connect();$taskFolder=$scheduler.GetFolder('\')
try { $existingTask=$taskFolder.GetTask($name) } catch { if ($_.Exception.GetBaseException().HResult -ne -2147024894) { throw } }
if ($existingTask) {
    $definition=$existingTask.Definition
    if ($existingTask.State -notin @(1,3) -or $definition.Actions.Count -ne 1 -or $definition.Actions.Item(1).Path -ine $executable -or $definition.Actions.Item(1).Arguments -cne '--runtime-broker $(Arg0) $(Arg1) $(Arg2)') { throw 'Stop the old Sodashitsu server before updating its runtime helper.' }
}
if ($Uninstall) {
    if ($existingTask) { $taskFolder.DeleteTask($name,0) }
    if (Test-Path -LiteralPath $executable) { Remove-Item -LiteralPath $executable -Force }
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    Write-Output 'desktop_runtime_helper_removed';exit 0
}
# Never reuse a previously writeable app directory or leave DLL/config sidecars.
if (-not (Test-Path -LiteralPath $container)) {
    [IO.Directory]::CreateDirectory($container) | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm(('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;' + $OwnerSid + ')'))
    Set-Acl -LiteralPath $container -AclObject $acl
}
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
    if ($existingTask -and $existingTask.State -notin @(1,3)) { throw 'The old runtime helper is still running.' }
    if (Test-Path -LiteralPath $executable) {
        $oldAcl=Get-Acl -LiteralPath $executable
        [IO.File]::Replace($temp,$executable,$null,$false)
        Set-Acl -LiteralPath $executable -AclObject $oldAcl
    } else { Move-Item -LiteralPath $stage -Destination $destination }
    $definition=New-SodaRuntimeTaskDefinition $scheduler $executable $destination
    $taskSddl='O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;'+$OwnerSid+')'
    $registered=$taskFolder.RegisterTaskDefinition($name,$definition,22,'SYSTEM',$null,5,$taskSddl)
    $descriptor=[Security.AccessControl.RawSecurityDescriptor]::new($registered.GetSecurityDescriptor(7))
    if ($descriptor.Owner.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'Runtime task owner is not protected.' }
    foreach ($ace in $descriptor.DiscretionaryAcl) { if ($ace.AceQualifier -eq 'AccessAllowed' -and $ace.SecurityIdentifier.Value -notin @('S-1-5-18','S-1-5-32-544')) { if ($ace.SecurityIdentifier.Value -cne $OwnerSid -or ($ace.AccessMask -band 0x500D0156) -ne 0) { throw 'Runtime task definition is writable by a non-administrator.' } } }
    if ($registered.Definition.Triggers.Count -ne 0 -or $registered.Definition.Actions.Count -ne 1 -or $registered.Definition.Actions.Item(1).Path -ine $executable) { throw 'Runtime task definition did not match.' }
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }; if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force } }
Write-Output 'desktop_runtime_helper_prepared_not_started'
