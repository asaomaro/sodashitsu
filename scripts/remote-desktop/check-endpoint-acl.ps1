param([Parameter(Mandatory=$true)][string]$Path,[switch]$AllowMissing)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
try {
    if($Path -notmatch '^[A-Za-z]:\\'){throw 'local path required'}
    . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
    $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path)))
    if(-not (Test-SodaEndpointDrive $drive.DriveType)){throw 'fixed volume required'}
    $user=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $candidate=[IO.Path]::GetFullPath($Path)
    while($true) {
        try {$item=Get-Item -LiteralPath $candidate -Force -ErrorAction Stop;break}
        catch [System.Management.Automation.ItemNotFoundException] {
            if(-not $AllowMissing){throw 'missing directory'}
            $parent=[IO.Path]::GetDirectoryName($candidate)
            if(-not $parent -or $parent -eq $candidate){throw 'missing ancestor'}
            $candidate=$parent
        }
    }
    $first=$true
    while($null -ne $item) {
        if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'reparse'}
        $acl=$item.GetAccessControl()
        $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
        if(-not (Test-SodaEndpointAcl -Owner $owner -Rules $rules -User $user -Storage $first)){throw ('permissions at '+$item.Name)}
        if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent};$first=$false
    }
    'endpoint_acl_valid'
} catch {[Console]::Error.WriteLine('GENERATED ACL: '+$_.Exception.Message);exit 1}
exit 0
