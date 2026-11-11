param([switch]$ValidateOnly,[switch]$Uninstall,[string]$OwnerSid=([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$ErrorActionPreference='Stop'
if ($OwnerSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'Specify the Windows account which runs the Sodashitsu server.' }
$installer=Join-Path $PSScriptRoot 'install-unlock-service.ps1'
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $ValidateOnly -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    # The only UAC prompt is this explicit local preparation, never a background
    # lease retry. Preserve the intended owner even with another admin account.
    $command="& '"+$PSCommandPath.Replace("'","''")+"' -OwnerSid '"+$OwnerSid+"'"+$(if($Uninstall){' -Uninstall'}else{''})
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $child=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-EncodedCommand',$encoded) -Verb RunAs -PassThru -Wait
    if ($child.ExitCode -ne 0) { throw 'Desktop helper preparation was not completed.' };exit 0
}
& $installer -RuntimeTask -OwnerSid $OwnerSid -ValidateOnly:$ValidateOnly -Uninstall:$Uninstall
