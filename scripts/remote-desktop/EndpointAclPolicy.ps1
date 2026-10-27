# Pure policy. The generated validator supplies in-memory ACLs; no ACL is changed.
function Test-SodaEndpointAcl([string]$Owner,[object[]]$Rules,[string]$User,[bool]$Storage) {
    $allowed=@($User,'S-1-5-18','S-1-5-32-544')
    $installer='S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
    if($allowed -notcontains $Owner -and -not (-not $Storage -and $Owner -eq $installer)){return $false}
    $replace=[Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    $write=$replace -bor [Security.AccessControl.FileSystemRights]::Write
    foreach($rule in $Rules) {
        if($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
        $sid=$rule.IdentityReference.Value
        $inheritOnly=($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0
        if($allowed -contains $sid -or ($sid -eq 'S-1-3-0' -and $inheritOnly) -or (-not $Storage -and $sid -eq $installer)){continue}
        if($Storage){$danger=$write}else{if($inheritOnly){continue};$danger=$replace}
        if(($rule.FileSystemRights -band $danger) -ne 0){return $false}
    }
    return $true
}
function Test-SodaEndpointDrive([IO.DriveType]$Type) {
    # A drive letter may name a mapped SMB share. Never trust its reported ACLs.
    return $Type -eq [IO.DriveType]::Fixed
}
