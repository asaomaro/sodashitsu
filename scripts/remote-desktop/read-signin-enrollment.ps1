param([Parameter(Mandatory=$true)][string]$OwnerSid)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$plain=$null
# Called only after the verified Vault/policy types have been loaded.
function Read-SodaSigninEnrollment([string]$OwnerSid) {
 $stream=$null;$cipher=$null;$plain=$null;$transferred=$false
 try {
    if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeOutput() -or -not [SodaDesktopSigninVault]::UserAccount($OwnerSid)){throw 'readonly owner unavailable'}
    $path=[SodaDesktopSigninVault]::StoragePath($OwnerSid)
    if($path -notmatch '^[A-Za-z]:\\' -or $path.Substring(2).Contains(':')){throw 'local path required'}
    $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($path))
    if(-not (Test-SodaEndpointDrive $drive.DriveType)){throw 'fixed volume required'}
    $item=Get-Item -LiteralPath $path -Force
    if($item -isnot [IO.FileInfo]){throw 'regular file required'}
    $depth=0
    while($null -ne $item) {
        if($depth -gt 64 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'unsafe ancestor'}
        $acl=Get-Acl -LiteralPath $item.FullName
        if($depth -lt 2 -or $item.FullName -eq ([SodaDesktopSigninVault]::StateRoot())) {
            if(-not (Test-SodaSigninStorageAcl $acl)){throw 'confidential ACL required'}
        } else {
            $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
            $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
            if(-not (Test-SodaEndpointAcl $owner $rules 'S-1-5-18' $false)){throw 'unsafe ancestor ACL'}
        }
        if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent};$depth++
    }
    $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $before=[SodaDesktopSigninVault]::Facts($stream.SafeFileHandle)
    if(-not $before.Regular -or $stream.Length -lt 1 -or $stream.Length -gt 65536 -or -not (Test-SodaSigninStorageAcl ($stream.GetAccessControl()))){throw 'unsafe file handle'}
    $cipher=New-Object byte[] ([int]$stream.Length);$offset=0
    while($offset -lt $cipher.Length){$count=$stream.Read($cipher,$offset,$cipher.Length-$offset);if($count -eq 0){throw 'incomplete file'};$offset+=$count}
    if($stream.ReadByte() -ne -1){throw 'file grew'}
    $plain=[SodaDesktopSigninVault]::Unprotect($cipher,$OwnerSid)
    if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not $before.Same([SodaDesktopSigninVault]::Facts($stream.SafeFileHandle)) -or -not (Test-SodaSigninStorageAcl ($stream.GetAccessControl()))){throw 'file or owner changed'}
    $transferred=$true;return ,$plain
 } finally {
    if(-not $transferred -and $null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
    if($null -ne $cipher){[Array]::Clear($cipher,0,$cipher.Length)}
    if($null -ne $stream){$stream.Dispose()}
 }
}

try {
 Add-Type -Path (Join-Path $PSScriptRoot 'WindowsSigninVault.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll
 . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
 . (Join-Path $PSScriptRoot 'SigninAclPolicy.ps1')
 $plain=Read-SodaSigninEnrollment $OwnerSid;$out=[Console]::OpenStandardOutput();$out.Write($plain,0,$plain.Length);$out.Flush()
} catch {[Console]::Error.WriteLine('Signin enrollment is unavailable');exit 1}
finally {if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}}
