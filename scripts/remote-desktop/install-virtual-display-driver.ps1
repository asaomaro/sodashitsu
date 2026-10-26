param(
    [Parameter(Mandatory=$true)][string]$PackagePath,
    [switch]$Inspect,
    [switch]$ValidateOnly,
    [string]$ManifestPath,
    [string]$ExpectedManifestSha256,
    [string]$SignerSha256
)
$ErrorActionPreference='Stop'
# Never creates a display, starts a service, changes certificate trust, or enables test signing.
$names=@('SodaVirtualDisplay.inf','SodaVirtualDisplay.dll','SodaVirtualDisplay.cat')
function LocalPath([string]$value){
    if($value -notmatch '^[A-Za-z]:\\' -or $value.Contains("`0")){throw 'Use an absolute path on a local Windows drive.'}
    $full=[IO.Path]::GetFullPath($value)
    $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
    if($drive.DriveType -notin @([IO.DriveType]::Fixed,[IO.DriveType]::Removable,[IO.DriveType]::CDRom,[IO.DriveType]::Ram)){throw 'Network or unavailable drives are not accepted.'}
    $current=[IO.Path]::GetPathRoot($full)
    $parts=$full.Substring($current.Length).Split([char[]]'\',[StringSplitOptions]::RemoveEmptyEntries)
    # Inspect root-to-leaf: never traverse an ancestor junction before rejecting it.
    foreach($part in @('')+$parts){
        if($part){$current=[IO.Path]::Combine($current,$part)}
        $item=Get-Item -LiteralPath $current -Force
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse points are not accepted.'}
    }
    return $full
}
function HashBytes([byte[]]$value){$sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash($value))).Replace('-','')}finally{$sha.Dispose()}}
function HashFile([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
$root=LocalPath $PackagePath
if(-not (Get-Item -LiteralPath $root).PSIsContainer){throw 'Package directory required.'}
$files=@{}
foreach($name in $names){$path=LocalPath (Join-Path $root $name);if((Get-Item -LiteralPath $path).PSIsContainer){throw 'Package file required.'};$files[$name]=HashFile $path}
$catalog=Get-AuthenticodeSignature -LiteralPath (Join-Path $root 'SodaVirtualDisplay.cat')
if($catalog.Status -ne 'Valid' -or -not $catalog.SignerCertificate){throw 'A valid signed catalog is required. Unsigned CI artifacts cannot be installed.'}
$actualSigner=HashBytes $catalog.SignerCertificate.RawData
if($Inspect){
    $manifest=@{version=1;files=$files}|ConvertTo-Json -Depth 3 -Compress
    @{manifest=$manifest;manifestSha256=(HashBytes ([Text.Encoding]::UTF8.GetBytes($manifest)));signerSha256=$actualSigner;installed=$false}|ConvertTo-Json -Compress
    return
}
if($ExpectedManifestSha256 -notmatch '^[A-Fa-f0-9]{64}$' -or $SignerSha256 -notmatch '^[A-Fa-f0-9]{64}$'){throw 'Supply the reviewed manifest SHA256 and signer certificate SHA256.'}
$manifestFile=LocalPath $ManifestPath
if((Get-Item -LiteralPath $manifestFile).Length -gt 4096){throw 'Manifest size limit.'}
if((HashFile $manifestFile) -ne $ExpectedManifestSha256 -or $actualSigner -ne $SignerSha256){throw 'Manifest or signer differs from the reviewed release.'}
$release=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
if($release.version -ne 1 -or @($release.PSObject.Properties).Count -ne 2 -or @($release.files.PSObject.Properties).Count -ne 3){throw 'Invalid release manifest.'}
foreach($name in $names){if($release.files.$name -notmatch '^[A-Fa-f0-9]{64}$' -or $files[$name] -ne $release.files.$name){throw 'Package differs from the reviewed release.'}}
$inf=Get-Content -LiteralPath (Join-Path $root 'SodaVirtualDisplay.inf') -Raw
if($inf -notmatch '(?im)^\s*%DeviceName%\s*=\s*MyDevice_Install,\s*Sodashitsu\\VirtualDisplayV1\s*$'){throw 'Unexpected virtual-display hardware ID.'}
if($ValidateOnly){Write-Output 'virtual_display_release_identity_verified: not installed; Windows will also verify catalog membership while staging';return}
if(-not [Environment]::Is64BitProcess){throw 'Use 64-bit Windows PowerShell.'}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Register the reviewed package from an administrator PowerShell on the sharing PC.'}
$programFiles=[Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
$container=Join-Path $programFiles 'Sodashitsu'
foreach($path in @($programFiles,$container)){if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Protected install root must not be redirected.'}}
if(Test-Path -LiteralPath $container){
    $acl=Get-Acl -LiteralPath $container
    if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'Install root is not administrator-owned.'}
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and (([int]$rule.FileSystemRights -band 0xD0156) -ne 0) -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'Install root is writable by a non-administrator.'}}
}else{
    [IO.Directory]::CreateDirectory($container)|Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)');Set-Acl -LiteralPath $container -AclObject $acl
}
$stage=Join-Path $container ('virtual-stage-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage)|Out-Null
try{
    foreach($name in $names){Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $stage $name);if((HashFile (Join-Path $stage $name)) -ne $release.files.$name){throw 'Package changed during staging.'}}
    $windows=[Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
    # Driver Store registration validates the signed catalog and file membership.
    # Omit /install: existing devices are not restarted and no monitor is created here.
    & (Join-Path $windows 'System32\pnputil.exe') /add-driver (Join-Path $stage 'SodaVirtualDisplay.inf')
    if($LASTEXITCODE -ne 0){throw 'Windows rejected the driver package.'}
    Write-Output 'virtual_display_driver_registered: no monitor created; update the protected broker separately and explicitly request a virtual share'
}finally{Remove-Item -LiteralPath $stage -Recurse -Force}
