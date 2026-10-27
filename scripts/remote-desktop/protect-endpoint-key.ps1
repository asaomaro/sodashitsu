param([Parameter(Mandatory=$true)][ValidateSet('protect','unprotect')][string]$Operation)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$inputBytes=New-Object byte[] 65537
$outputBytes=$null
try {
    Add-Type -AssemblyName System.Security
    $source=[Console]::OpenStandardInput();$count=0
    while($count -lt $inputBytes.Length){$read=$source.Read($inputBytes,$count,$inputBytes.Length-$count);if($read -eq 0){break};$count+=$read}
    if($count -lt 1 -or $count -gt 65536){throw 'size'}
    $payload=New-Object byte[] $count
    [Array]::Copy($inputBytes,$payload,$count)
    $entropy=[Text.Encoding]::UTF8.GetBytes('Sodashitsu desktop endpoint identity v1')
    try {
        if($Operation -eq 'protect'){$outputBytes=[Security.Cryptography.ProtectedData]::Protect($payload,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
        else {$outputBytes=[Security.Cryptography.ProtectedData]::Unprotect($payload,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
    } finally {[Array]::Clear($payload,0,$payload.Length)}
    if($outputBytes.Length -gt 65536){throw 'size'}
    $destination=[Console]::OpenStandardOutput();$destination.Write($outputBytes,0,$outputBytes.Length);$destination.Flush()
} catch {
    [Console]::Error.WriteLine('Endpoint key protection failed')
    exit 1
} finally {
    [Array]::Clear($inputBytes,0,$inputBytes.Length)
    if($null -ne $outputBytes){[Array]::Clear($outputBytes,0,$outputBytes.Length)}
}
exit 0
