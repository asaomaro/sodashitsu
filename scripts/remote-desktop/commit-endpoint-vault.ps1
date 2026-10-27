param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SodaEndpointCommit {
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    public static extern bool MoveFileEx(string source,string destination,uint flags);
}
'@
    # Same private directory/volume; no reboot registration or cross-volume copy.
    if(-not [SodaEndpointCommit]::MoveFileEx($Source,$Destination,9)){throw 'replace'}
    'endpoint_vault_committed'
} catch {[Console]::Error.WriteLine('Endpoint vault commit failed');exit 1}
exit 0
