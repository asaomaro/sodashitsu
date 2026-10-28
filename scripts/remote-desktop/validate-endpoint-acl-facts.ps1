$ErrorActionPreference='Stop'
# In-memory Windows descriptors only. No filesystem ACL is read or changed.
. (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
$user='S-1-5-21-1-2-3-1001'
$sid=[Security.Principal.SecurityIdentifier]::new($user)
function Test-GeneratedDescriptor([string]$kind,[string]$name,[Security.AccessControl.ControlFlags]$flags,[Security.AccessControl.RawAcl]$dacl,[bool]$expected) {
    $raw=[Security.AccessControl.RawSecurityDescriptor]::new($flags,$sid,$sid,$null,$dacl)
    $bytes=New-Object byte[] $raw.BinaryLength;$raw.GetBinaryForm($bytes,0)
    if($kind -eq 'file'){$security=[Security.AccessControl.FileSecurity]::new()}else{$security=[Security.AccessControl.DirectorySecurity]::new()}
    $security.SetSecurityDescriptorBinaryForm($bytes)
    $roundtrip=[Security.AccessControl.RawSecurityDescriptor]::new($security.GetSecurityDescriptorBinaryForm(),0)
    $owner=$security.GetOwner([Security.Principal.SecurityIdentifier]).Value
    $rules=@($security.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    $storage=Test-SodaEndpointAcl $owner $rules $user $true
    $parent=Test-SodaEndpointAcl $owner $rules $user $false
    @{kind=$kind;name=$name;daclPresent=(($roundtrip.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -ne 0);daclNull=($null -eq $roundtrip.DiscretionaryAcl);ruleCount=$rules.Count;storage=$storage;parent=$parent}|ConvertTo-Json -Compress
    if($storage -ne $expected -or $parent -ne $expected){throw ('Unexpected descriptor policy: '+$kind+'/'+$name)}
}
foreach($kind in @('file','directory')) {
    Test-GeneratedDescriptor $kind 'absent-dacl' ([Security.AccessControl.ControlFlags]::None) $null $false
    Test-GeneratedDescriptor $kind 'null-dacl' ([Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) $null $false
    $empty=[Security.AccessControl.RawAcl]::new(2,0)
    Test-GeneratedDescriptor $kind 'empty-dacl' ([Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) $empty $true
    $private=[Security.AccessControl.RawAcl]::new(2,1)
    $private.InsertAce(0,[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None,[Security.AccessControl.AceQualifier]::AccessAllowed,[int][Security.AccessControl.FileSystemRights]::FullControl,$sid,$false,$null))
    Test-GeneratedDescriptor $kind 'private-dacl' ([Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) $private $true
}
'endpoint_acl_descriptor_generated_checks_passed'
