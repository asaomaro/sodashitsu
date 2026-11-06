$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$id=[Security.Principal.WindowsIdentity]::GetCurrent();if(-not $id.IsSystem -or $id.ImpersonationLevel -ne 'None' -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0 -or $env:COMPUTERNAME -ne 'OSK2-024680-2'){exit 40}
$f=[IO.File]::Open((Join-Path $PSScriptRoot 'attempted'),[IO.FileMode]::CreateNew);$f.Dispose();$out=@{ok=$false};$child=$null
try{
 $exe='C:\Program Files\Sodashitsu\DesktopSignin-68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d\DesktopSigninNative.exe'
 if((Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne '1ab9050299dd9d1eb1d69e63d9d912a504e916f2b4ca98c9af57eb60ac34ca13'){throw 'Fixed installed presence image differs'}
 $i=[Diagnostics.ProcessStartInfo]::new($exe,'--broker presence');$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.RedirectStandardInput=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true;$i.WorkingDirectory='C:\Windows\System32'
 $i.EnvironmentVariables.Clear();foreach($key in @('SystemRoot','windir','PATH')){$i.EnvironmentVariables[$key]=if($key -eq 'PATH'){'C:\Windows\System32'}else{'C:\Windows'}};$i.EnvironmentVariables['TEMP']=$PSScriptRoot;$i.EnvironmentVariables['TMP']=$PSScriptRoot
 $counts=@{};$last='';$firstPulse=$null;$lastPulse=$null;$maxGap=0;$total=0;$clock=[Diagnostics.Stopwatch]::StartNew()
 function Record([string]$line){
  if(-not $line.Trim()){return};$script:total+=$line.Length;if($script:total -gt 65536){throw 'Presence output exceeds bound'};$record=$line|ConvertFrom-Json;$type=[string]$record.type
  if($type -notin @('signin_context','signin_presence','signin_inactive','signin_stopped')){throw 'Unexpected readonly record'};$script:counts[$type]=1+[int]$script:counts[$type];$script:last=$type
  if($type -eq 'signin_context'){$script:out.firstContextMs=$script:clock.ElapsedMilliseconds}
  if($type -eq 'signin_presence'){$at=$script:clock.ElapsedMilliseconds;if($null -eq $script:firstPulse){$script:firstPulse=$at};if($null -ne $script:lastPulse){$script:maxGap=[Math]::Max($script:maxGap,$at-$script:lastPulse)};$script:lastPulse=$at}
 }
 $child=[Diagnostics.Process]::Start($i);$null=$child.Handle;$next=$child.StandardOutput.ReadLineAsync();$stderr=$child.StandardError.ReadToEndAsync();$beat=0;$eof=$false
 while($clock.ElapsedMilliseconds -lt 18000 -and -not $child.HasExited){
  while($next.IsCompleted -and -not $eof){$line=$next.GetAwaiter().GetResult();if($null -eq $line){$eof=$true;break};Record $line;$next=$child.StandardOutput.ReadLineAsync()}
  if($clock.ElapsedMilliseconds -ge $beat){$child.StandardInput.WriteLine('{"type":"heartbeat"}');$child.StandardInput.Flush();$beat=$clock.ElapsedMilliseconds+1000};Start-Sleep -Milliseconds 20
 }
 if(-not $child.HasExited){$child.StandardInput.WriteLine('{"type":"stop"}');$child.StandardInput.Flush();$child.StandardInput.Close()}
 if(-not $child.WaitForExit(8000)){throw 'Presence completion unknown'};$out.exitCode=$child.ExitCode
 while(-not $eof){if(-not $next.Wait(1000)){throw 'Presence output incomplete'};$line=$next.GetAwaiter().GetResult();if($null -eq $line){$eof=$true;break};Record $line;$next=$child.StandardOutput.ReadLineAsync()}
 if(-not $stderr.Wait(1000) -or $stderr.Result.Length -ne 0){throw 'Presence stderr unavailable'};$out.firstPulseMs=$firstPulse;$out.maxPulseGapMs=$maxGap;$out.durationMs=$clock.ElapsedMilliseconds
 $out.counts=$counts;$out.terminal=$last -eq 'signin_stopped';$out.ok=$child.ExitCode -eq 0 -and $out.terminal -and $counts['signin_context'] -eq 1 -and $counts['signin_stopped'] -eq 1
}catch{$out.errorKind=$_.Exception.GetBaseException().GetType().Name}
finally{if($null -ne $child){if(-not $child.HasExited){$child.Kill();$out.forced=$true;if(-not $child.WaitForExit(5000)){$out.exitUnknown=$true}};$child.Dispose()}}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'result.json'),($out|ConvertTo-Json -Depth 5));if(-not $out.ok){exit 1}
