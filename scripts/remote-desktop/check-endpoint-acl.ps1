param([string]$Path,[string]$PathsBase64,[switch]$AllowMissing)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
try {
    if($PSBoundParameters.ContainsKey('PathsBase64')) {
        if($PSBoundParameters.ContainsKey('Path') -or $AllowMissing -or $PathsBase64.Length -gt 49152 -or $PathsBase64 -notmatch '\A[A-Za-z0-9+/]*={0,2}\z'){throw 'invalid batch'}
        $PathsJson=[Text.UTF8Encoding]::new($false,$true).GetString([Convert]::FromBase64String($PathsBase64))
        if($PathsJson.Length -gt 32768 -or -not $PathsJson.TrimStart().StartsWith('[') -or -not $PathsJson.TrimEnd().EndsWith(']')){throw 'invalid batch'}
        $paths=ConvertFrom-Json -InputObject $PathsJson
        if($paths.Count -lt 1 -or $paths.Count -gt 8){throw 'invalid batch'}
        foreach($value in $paths){if($value -isnot [string] -or $value.Length -gt 4096){throw 'invalid batch'}}
    } else {if(-not $PSBoundParameters.ContainsKey('Path')){throw 'path required'};$paths=@($Path)}
    foreach($Path in $paths) {
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
        # Read ACLs through the fixed CLR API without optional PowerShell module loading.
        $acl=$item.GetAccessControl()
        $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
        if(-not (Test-SodaEndpointAcl -Owner $owner -Rules $rules -User $user -Storage $first)){throw 'permissions'}
        if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent};$first=$false
    }
    }
    'endpoint_acl_valid'
} catch {[Console]::Error.WriteLine('Endpoint storage permissions are unsafe');exit 1}
exit 0
