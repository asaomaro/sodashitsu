$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$targetPid=18040;$owner='S-1-5-21-2255109513-3773794534-3440117263-1001'
if($env:COMPUTERNAME -ne 'OSK2-024680-2' -or ([Security.Principal.WindowsIdentity]::GetCurrent()).User.Value -ne $owner -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0){throw 'Expected maintenance caller required'}
$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$targetPid)
if($null -eq $p -or $p.Name -ne 'node.exe' -or $p.SessionId -ne 1 -or [string]$p.CommandLine -notmatch '(?i)sodashitsu[\\/]+packages[\\/]+server[\\/]+dist[\\/]+main\.js'){throw 'Expected normal server required'}
$token=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid;if($token.ReturnValue -ne 0 -or $token.Sid -ne $owner){throw 'Server owner differs'}
$listeners=@(Get-NetTCPConnection -LocalPort 7780 -State Listen -ErrorAction Stop);if(-not($listeners|Where-Object {$_.OwningProcess -eq $targetPid})){throw 'Normal server listener differs'}
$process=[Diagnostics.Process]::GetProcessById($targetPid);$created=$process.StartTime.ToUniversalTime().ToFileTimeUtc();$process.Dispose();if([string]$created -ne '134384363801563095'){throw 'Paused server instance differs'};$cimCreated=$p.CreationDate.ToUniversalTime().ToFileTimeUtc();if($created -lt $cimCreated -or ($created-$cimCreated) -gt 9){throw 'Server creation differs'}

$stage=Join-Path $env:LOCALAPPDATA 'sodashitsu\signin-layout-check-20261104';$target='C:\git\sodashitsu\packages\server\dist\infra\GitRunner.js'
$replacement=[IO.File]::ReadAllBytes((Join-Path $stage 'git-runner-fixed-92fe7e1d93f94f498e9020698547985b.js'));$oldExpected='cb5621dea252b3e36d5104a070cc67b178443d44994abdec5b6d78f87df7484e';$newExpected='9f919f9ec2ff1a4240fde2471662987d0f95518faf934fbb585a2225b10ba6ff'
function Hash([byte[]]$bytes){$sha=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
if((Hash $replacement) -ne $newExpected){throw 'Reviewed replacement changed'}
if(([IO.File]::GetAttributes($target) -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Expected regular module required'}
$f=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
try{
 if($f.Length -lt 1 -or $f.Length -gt 65536){throw 'Module size differs'};$before=New-Object byte[] ([int]$f.Length);$offset=0;while($offset -lt $before.Length){$n=$f.Read($before,$offset,$before.Length-$offset);if($n -le 0){throw 'Module read incomplete'};$offset+=$n}
 if((Hash $before) -ne $oldExpected){throw 'Running installation module differs; not replaced'}
 $backup=Join-Path $stage 'git-runner-before-92fe7e1d93f94f498e9020698547985b.js';$b=[IO.File]::Open($backup,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$b.Write($before,0,$before.Length);$b.Flush($true)}finally{$b.Dispose()}
 try{$f.Position=0;$f.Write($replacement,0,$replacement.Length);$f.SetLength($replacement.Length);$f.Flush($true)}catch{$f.Position=0;$f.Write($before,0,$before.Length);$f.SetLength($before.Length);$f.Flush($true);throw}
}finally{$f.Dispose()}
if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $newExpected){throw 'Installed replacement check failed'}
[pscustomobject]@{patched=$true;oldSha256=$oldExpected;newSha256=$newExpected;backup=$backup;serverRemainsPaused=$true;sourceCheckoutChanged=$false}|ConvertTo-Json -Compress
