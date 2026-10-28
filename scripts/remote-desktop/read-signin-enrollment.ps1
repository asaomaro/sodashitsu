param([Parameter(Mandatory=$true)][string]$OwnerSid)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$stream=$null;$cipher=$null;$plain=$null
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'WindowsSigninVault.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll
    if(-not [SodaDesktopSigninVault]::SystemPrimary()){throw 'SYSTEM primary token required'}
    if(-not [SodaDesktopSigninVault]::PipeOutput()){throw 'private pipe output required'}
    if(-not [SodaDesktopSigninVault]::UserAccount($OwnerSid)){throw 'owner account unavailable'}
    . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
    . (Join-Path $PSScriptRoot 'SigninAclPolicy.ps1')
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
        if($depth -lt 2) {
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
    $output=[Console]::OpenStandardOutput();$output.Write($plain,0,$plain.Length);$output.Flush()
} catch {[Console]::Error.WriteLine('Signin enrollment is unavailable');exit 1}
finally {
    if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
    if($null -ne $cipher){[Array]::Clear($cipher,0,$cipher.Length)}
    if($null -ne $stream){$stream.Dispose()}
}
exit 0
