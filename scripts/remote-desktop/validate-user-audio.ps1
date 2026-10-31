param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated facts and PCM in authenticated owned pipes. No audio device, OS input or service.
$names=@('WindowsDesktopPipeKernel.cs','WindowsDesktopAudio.cs','WindowsUserAudioRole.cs','WindowsAudioChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-user-audio-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll;[SodaDesktopUserAudioRole]::GeneratedChecks();[SodaDesktopTests.AudioChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated ordinary user audio checks failed'}
 if($NegativeControls){
  $variants=@(
   @('source','return Thread.VolatileRead(ref stopping)==0&&','return Thread.VolatileRead(ref stopping)>=0&&','Audio source survived revocation'),
   @('startup','Now()-started<2500','Now()-started<250000','Original audio startup deadline extended'),
   @('heartbeat','now-Interlocked.Read(ref heartbeat)<2000','now-Interlocked.Read(ref heartbeat)<2000000','Audio source survived heartbeat expiry'),
   @('stream','&&(string)command["id"]==id&&','&&','Audio stream proof missing'),
   @('clock','return checked(ticks/frequency*1000000+(ticks%frequency)*1000000/frequency);','return Clock.ElapsedMilliseconds*1000;','Audio QPC clock')
  )
  foreach($variant in $variants){$name='WindowsUserAudioRole.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw 'Negative guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains($variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored ordinary user audio checks failed'}
  'user_audio_5_source_negative_controls_and_restore_passed'
 }
 foreach($name in $names){if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Production source bytes changed'}}
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
