# Dedicated machine-scope secrets. The existing CurrentUser policy intentionally
# permits foreign read-only ACEs; that is insufficient for this storage.
function Test-SodaSigninStorageAcl([Security.AccessControl.FileSystemSecurity]$Descriptor) {
    try {
        if($null -eq $Descriptor){return $false}
        $raw=[Security.AccessControl.RawSecurityDescriptor]::new($Descriptor.GetSecurityDescriptorBinaryForm(),0)
        if(($raw.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -eq 0 -or $null -eq $raw.DiscretionaryAcl){return $false}
        $owner=$Descriptor.GetOwner([Security.Principal.SecurityIdentifier]).Value
        $rules=@($Descriptor.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
        if(-not (Test-SodaEndpointAcl $owner $rules 'S-1-5-18' $true)){return $false}
        foreach($rule in $rules) {
            if($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
            $sid=$rule.IdentityReference.Value
            if($sid -eq 'S-1-5-18' -or $sid -eq 'S-1-5-32-544'){continue}
            $inheritOnly=($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0
            if($sid -eq 'S-1-3-0' -and $inheritOnly){continue}
            if(($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData) -ne 0){return $false}
        }
        return $true
    } catch {return $false}
}
