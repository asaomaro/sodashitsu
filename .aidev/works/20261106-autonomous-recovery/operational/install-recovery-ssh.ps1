$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$owner='S-1-5-21-2255109513-3773794534-3440117263-1001';$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -ne $owner -or $identity.ImpersonationLevel -ne 'None' -or -not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $env:COMPUTERNAME -ne 'OSK2-024680-2'){throw 'Reviewed administrator/host required'}
$root='C:\Program Files\Sodashitsu\RecoverySsh20261106f';$sshRoot='C:\ProgramData\ssh';$sourceAddress='192.168.0.95';$phase='preflight';$installed=$false;$started=$false;$ownsSetup=$false;$ruleCreated=$false
if(Test-Path -LiteralPath $root){throw 'Fresh recovery SSH setup required'}
$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)');$null=[IO.Directory]::CreateDirectory($root,$acl)
function Write-Private([string]$path,[string]$text){
 $fs=[Security.AccessControl.FileSecurity]::new();$fs.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)')
 $f=[IO.FileStream]::new($path,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::FullControl,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough,$fs)
 try{$b=[Text.UTF8Encoding]::new($false).GetBytes($text);$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
}
function Private-File([string]$path){$fs=[Security.AccessControl.FileSecurity]::new();$fs.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)');[IO.File]::SetAccessControl($path,$fs)}
$result=@{ok=$false;sourceAddress=$sourceAddress;passwordAuthentication=$false;rebooted=$false}
try {
 $service=Get-Service -Name sshd -ErrorAction Stop
 if($service.Status -ne 'Stopped' -or $service.StartType -ne 'Manual'){throw 'Stopped manual stock SSH service required'}
 $settings=Get-CimInstance Win32_Service -Filter "Name='sshd'" -ErrorAction Stop
 $stock=Join-Path $env:WINDIR 'System32\OpenSSH\sshd.exe';$image=[Environment]::ExpandEnvironmentVariables([string]$settings.PathName).Trim().Trim('"')
 if($settings.StartName -ne 'LocalSystem' -or $settings.ProcessId -ne 0 -or -not [string]::Equals($image,$stock,[StringComparison]::OrdinalIgnoreCase)){throw 'Stock service binding differs'}
 if(@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 22}).Count -ne 0){throw 'SSH port already used'}
 $pins=@{'sshd.exe'='4a150a2881a040f7faaff82b57a896b116bb4cd8073b91c6c58d0edda60cd6b7';'ssh-keygen.exe'='c9dc170cd161db87e75eb6cf282f1325005b9e35628b9a36cb19883a8be1a34f'}
 foreach($name in $pins.Keys){$path=Join-Path (Split-Path $stock) $name;$signature=Get-AuthenticodeSignature -LiteralPath $path;if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation' -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pins[$name]){throw 'Pinned Windows SSH binary differs'}}
 $result.adoptedUnconfiguredService=$true
 $existingDirectory=$false;$originalDirectorySddl=$null
 if(Test-Path -LiteralPath $sshRoot){
  if(([IO.File]::GetAttributes($sshRoot) -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Existing SSH reparse directory must be preserved'}
  if(@(Get-ChildItem -LiteralPath $sshRoot -Force -ErrorAction Stop).Count -ne 0){throw 'Existing SSH files must be preserved'}
  $originalDirectorySddl=[IO.Directory]::GetAccessControl($sshRoot).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)
  $sd=[Security.AccessControl.RawSecurityDescriptor]::new($originalDirectorySddl)
  if($sd.Owner.Value -notin @('S-1-5-18','S-1-5-32-544') -or ($sd.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -eq 0 -or $sd.DiscretionaryAcl.Count -ne 3){throw 'Existing SSH directory policy differs'}
  $seen=@();foreach($ace in $sd.DiscretionaryAcl){if($ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed -or (($ace.SecurityIdentifier.Value -eq 'S-1-5-11' -and $ace.AccessMask -ne 0x1200a9) -or ($ace.SecurityIdentifier.Value -ne 'S-1-5-11' -and $ace.AccessMask -ne 2032127)) -or $ace.SecurityIdentifier.Value -notin @('S-1-5-18','S-1-5-32-544','S-1-5-11') -or [int]$ace.AceFlags -ne 3){throw 'Existing SSH directory rights differ'};$seen+=$ace.SecurityIdentifier.Value};if(@($seen|Select-Object -Unique).Count -ne 3){throw 'Existing SSH directory identities differ'}
  $existingDirectory=$true
 }
 $broadBefore=@(Get-NetFirewallRule -ErrorAction Stop|Where-Object {$_.Name -eq 'OpenSSH-Server-In-TCP'});if($broadBefore.Count -gt 1){throw 'Ambiguous default SSH rule'}
 $broadEnabledBefore=$null
 if($broadBefore.Count -eq 1){$rule=$broadBefore[0];$port=$rule|Get-NetFirewallPortFilter -ErrorAction Stop;$app=$rule|Get-NetFirewallApplicationFilter -ErrorAction Stop;$program=[Environment]::ExpandEnvironmentVariables([string]$app.Program)
  if($rule.PolicyStoreSourceType -ne 'Local' -or $rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow' -or [string]$port.LocalPort -ne '22' -or [string]$port.Protocol -notin @('TCP','6') -or ($program -ne 'Any' -and -not [string]::Equals($program,$stock,[StringComparison]::OrdinalIgnoreCase))){throw 'Default SSH firewall binding differs'}
  $broadEnabledBefore=[string]$rule.Enabled
 }
 if(Get-NetFirewallRule -Name 'SodashitsuRecoverySsh20261106' -ErrorAction SilentlyContinue){throw 'Existing dedicated firewall rule must be preserved'}
 $login=$env:USERNAME.ToLowerInvariant();if([string]::IsNullOrWhiteSpace($login) -or $login.Length -gt 128 -or $login -match '[\x00-\x1f"\\*?]'){throw 'Unsupported login name'}
 $sid=([Security.Principal.NTAccount]::new($env:COMPUTERNAME,$env:USERNAME)).Translate([Security.Principal.SecurityIdentifier]).Value;if($sid -ne $owner){throw 'Account binding mismatch'}
 $ownsSetup=$true;$phase='adopt-unconfigured-service';$installed=$false
 # Preserve the existing rule and restrict it before starting this unconfigured service.
 $phase='restrict-firewall';$broad=Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue;if($null -ne $broad){$broad|Disable-NetFirewallRule|Out-Null}
 $service=Get-Service -Name sshd -ErrorAction Stop;if($service.Status -ne 'Stopped'){Stop-Service sshd -ErrorAction Stop;$service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(20))}
 if((Test-Path -LiteralPath $sshRoot) -and (([IO.File]::GetAttributes($sshRoot) -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'Unexpected SSH reparse directory'}
 if($existingDirectory){if([IO.Directory]::GetAccessControl($sshRoot).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All) -cne $originalDirectorySddl){throw 'Existing SSH directory changed'}}elseif(-not(Test-Path -LiteralPath $sshRoot)){$null=[IO.Directory]::CreateDirectory($sshRoot,$acl)}else{[IO.Directory]::SetAccessControl($sshRoot,$acl)}
 $phase='write-config';$config=@"
Port 22
AddressFamily inet
ListenAddress 0.0.0.0
HostKey "$($root.Replace('\','/'))/ssh_host_ed25519_key"
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
AuthenticationMethods publickey
PermitEmptyPasswords no
AllowUsers "$login"
AllowTcpForwarding no
AllowAgentForwarding no
X11Forwarding no
GatewayPorts no
PermitTunnel no
PermitUserEnvironment no
AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys
LogLevel VERBOSE
"@
 $configPath=Join-Path $sshRoot 'sshd_config';if(Test-Path -LiteralPath $configPath){[IO.File]::Copy($configPath,(Join-Path $root 'created-default-sshd_config'));Private-File (Join-Path $root 'created-default-sshd_config');[IO.File]::Delete($configPath)}
 Write-Private $configPath ($config+"`r`n")
 $public='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM/vfkObXU6UWy3RwisFwQ2B8C9AJDLaR20nbZLcl6lq sodashitsu-srpc-recovery-20261106';if($public -notmatch '\Assh-ed25519 [A-Za-z0-9+/]+={0,2} [A-Za-z0-9-]+\z'){throw 'Invalid pinned public key'}
 Write-Private (Join-Path $sshRoot 'administrators_authorized_keys') ('from="'+$sourceAddress+'",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty '+$public+"`r`n")
 $bin=Join-Path $env:WINDIR 'System32\OpenSSH';$phase='host-keys'
 $keyScript=@'
$ErrorActionPreference='Stop'
if(-not ([Security.Principal.WindowsIdentity]::GetCurrent()).IsSystem -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0){throw 'SYSTEM key generation required'}
$root='__ROOT__';$key=Join-Path $root 'ssh_host_ed25519_key';if(Test-Path -LiteralPath $key){throw 'Fresh host key required'}
$info=[Diagnostics.ProcessStartInfo]::new('C:\Windows\System32\OpenSSH\ssh-keygen.exe',('-q -t ed25519 -N "" -f "'+$key+'"'));$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$p=[Diagnostics.Process]::Start($info)
try{$p.StandardInput.Close();if(-not $p.WaitForExit(20000)){$p.Kill();if(-not $p.WaitForExit(5000)){[Environment]::FailFast('Host key generator exit unknown')};throw 'Key generation timed out'};if($p.ExitCode -ne 0){throw 'Key generation failed'}}finally{$p.Dispose()}
'@
 $keyScript=$keyScript.Replace('__ROOT__',$root);$keyScriptPath=Join-Path $root 'make-host-key.ps1';Write-Private $keyScriptPath $keyScript
 $scheduler=New-Object -ComObject Schedule.Service;$scheduler.Connect();$folder=$scheduler.GetFolder('\');$t=$scheduler.NewTask(0);$t.Principal.UserId='S-1-5-18';$t.Principal.LogonType=5;$t.Principal.RunLevel=1;$t.Settings.ExecutionTimeLimit='PT1M';$t.Settings.DisallowStartIfOnBatteries=$false;$t.Settings.StopIfGoingOnBatteries=$false;$a=$t.Actions.Create(0);$a.Path='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe';$a.Arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$keyScriptPath+'"';$a.WorkingDirectory='C:\Windows\System32'
 $keyTaskName='SodashitsuRecoverySshHostKey20261106';$keyTask=$folder.RegisterTaskDefinition($keyTaskName,$t,18,'S-1-5-18',$null,5,'O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)')
 $taskSd=[Security.AccessControl.RawSecurityDescriptor]::new($keyTask.GetSecurityDescriptor(7));if($taskSd.Owner.Value -ne 'S-1-5-32-544' -or $taskSd.Group.Value -ne 'S-1-5-32-544' -or $taskSd.DiscretionaryAcl.Count -ne 2){throw 'Key task owner policy differs'}
 $seen=@();foreach($ace in $taskSd.DiscretionaryAcl){if($ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed -or $ace.AceFlags -ne [Security.AccessControl.AceFlags]::None -or $ace.AccessMask -ne 2032127 -or $ace.SecurityIdentifier.Value -notin @('S-1-5-18','S-1-5-32-544')){throw 'Key task rights differ'};$seen+=$ace.SecurityIdentifier.Value};if(@($seen|Select-Object -Unique).Count -ne 2){throw 'Key task identities differ'}
 $startedAt=[DateTime]::Now;$null=$keyTask.Run($null)
 for($i=0;$i -lt 100;$i++){Start-Sleep -Milliseconds 500;$keyTask=$folder.GetTask($keyTaskName);if($keyTask.LastRunTime -ge $startedAt.AddSeconds(-2) -and [int]$keyTask.State -ne 4 -and $keyTask.LastTaskResult -ne 267009 -and $i -gt 4){break}}
 if([int]$keyTask.State -eq 4 -or $keyTask.GetInstances(0).Count -ne 0){$result.hostKeyTaskPending=$true;throw 'Host key task exit unknown'}
 $keyResult=$keyTask.LastTaskResult;$folder.DeleteTask($keyTaskName,0);$result.hostKeyTaskRemoved=$true;if($keyResult -ne 0){throw 'Host key task failed'}
 $hostPrivate=Join-Path $root 'ssh_host_ed25519_key';Private-File $hostPrivate
 $phase='validate-config';& (Join-Path $bin 'sshd.exe') -t -f $configPath;if($LASTEXITCODE -ne 0){throw 'SSH configuration rejected'}
 $phase='allow-fixed-source';$name='SodashitsuRecoverySsh20261106';if(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue){throw 'Fresh firewall rule required'}
 New-NetFirewallRule -Name $name -DisplayName 'Sodashitsu recovery SSH (pinned source/key)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 -RemoteAddress $sourceAddress -Profile Any -Program (Join-Path $bin 'sshd.exe') -EdgeTraversalPolicy Block|Out-Null;$ruleCreated=$true
 $phase='start';Set-Service -Name sshd -StartupType Automatic;Start-Service sshd;$started=$true;(Get-Service sshd).WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
 $result.ok=$true;$result.account=$login;$result.hostPublicKey=[IO.File]::ReadAllText((Join-Path $root 'ssh_host_ed25519_key.pub')).Trim();$result.service='Running';$result.automatic=$true
}catch{
 $result.phase=$phase;$result.errorKind=$_.Exception.GetBaseException().GetType().Name
 # Attempt independent fail-closed cleanup; report any unconfirmed final state.
 if($ownsSetup){
 $errors=[Collections.Generic.List[string]]::new()
 $result.cleanupServiceStopped=$false;$result.cleanupStartupManual=$false
 $queried=$false;$services=@();try{$services=@(Get-Service -ErrorAction Stop|Where-Object {$_.Name -eq 'sshd'});$queried=$true}catch{$errors.Add('query-service-before-cleanup')}
 if($queried -and $services.Count -eq 1){
  try{Stop-Service sshd -ErrorAction Stop}catch{$errors.Add('stop')}
  try{Set-Service sshd -StartupType Manual -ErrorAction Stop}catch{$errors.Add('startup-manual')}
  try{$actual=Get-Service sshd -ErrorAction Stop;$result.cleanupServiceStopped=$actual.Status -eq 'Stopped';$result.cleanupStartupManual=$actual.StartType -eq 'Manual'}catch{$errors.Add('verify-service-cleanup')}
 }elseif($queried -and $services.Count -eq 0){$result.cleanupServiceStopped=$true;$result.cleanupStartupManual=$true}
 if($ruleCreated){try{Get-NetFirewallRule -Name 'SodashitsuRecoverySsh20261106' -ErrorAction Stop|Remove-NetFirewallRule -ErrorAction Stop|Out-Null}catch{$errors.Add('remove-owned-rule')}}
 try{$broad=@(Get-NetFirewallRule -ErrorAction Stop|Where-Object {$_.Name -eq 'OpenSSH-Server-In-TCP'});if($null -ne $broad){$broad|Disable-NetFirewallRule -ErrorAction Stop|Out-Null}}catch{$errors.Add('disable-new-broad-rule')}
 if($broadBefore.Count -eq 1 -and $result.cleanupServiceStopped -and $result.cleanupStartupManual){try{if($broadEnabledBefore -eq 'True'){Enable-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction Stop|Out-Null}else{Disable-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction Stop|Out-Null};$result.defaultFirewallRestored=$true}catch{$errors.Add('restore-default-firewall')}}
 $result.cleanupErrors=@($errors);$result.cleanupConfirmed=$result.cleanupServiceStopped -and $result.cleanupStartupManual -and $errors.Count -eq 0
 }else{$result.cleanupConfirmed=$true;$result.cleanupSkippedNoOwnedChanges=$true}

}finally{
 $result.installedCapability=$installed
 $fs=[Security.AccessControl.FileSecurity]::new();$fs.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;'+$owner+')');$p=Join-Path $root 'public-status.json';$f=[IO.FileStream]::new($p,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::FullControl,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough,$fs);try{$b=[Text.Encoding]::UTF8.GetBytes(($result|ConvertTo-Json -Depth 4));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
}
if(-not $result.ok){exit 1}
