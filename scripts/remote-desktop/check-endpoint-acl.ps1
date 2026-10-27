param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
try {
    if($Path -notmatch '^[A-Za-z]:\\'){throw 'local path required'}
    . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
    $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path)))
    if(-not (Test-SodaEndpointDrive $drive.DriveType)){throw 'fixed volume required'}
    $user=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $item=Get-Item -LiteralPath $Path -Force;$first=$true
    while($null -ne $item) {
        if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'reparse'}
        $acl=Get-Acl -LiteralPath $item.FullName
        $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
        if(-not (Test-SodaEndpointAcl -Owner $owner -Rules $rules -User $user -Storage $first)){throw 'permissions'}
        if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent};$first=$false
    }
    'endpoint_acl_valid'
} catch {[Console]::Error.WriteLine('Endpoint storage permissions are unsafe');exit 1}
exit 0
