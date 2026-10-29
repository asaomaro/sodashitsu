param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated input, desktop, monitor, clipboard and microphone callbacks only. No OS input or devices.
$names=@('WindowsResourceFence.cs','WindowsResourceFenceChecks.cs','WindowsDesktopHost.cs','WindowsDesktopUnlock.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-resource-fence-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll;[SodaDesktopResourceFenceChecks]::Run();[SodaDesktopHost]::VerifyResourceInputFailures()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated resource cleanup checks failed'}
 if($NegativeControls){
  $variants=@(
   @('input-fault-latch','WindowsDesktopHost.cs','Stopping=true;foreach(var fence in ResourceFences.Values)fence.GetType().GetMethod("Close").Invoke(fence,null);','','Input failure was not terminal: key',1),
   @('held-key','WindowsDesktopHost.cs','else if(held.Contains(key)){emit(key,false);held.Remove(key);}','else if(held.Remove(key))emit(key,false);','Failed release was forgotten: key',1),
   @('held-button','WindowsDesktopHost.cs','else if(action=="up" && Buttons.Contains(button)){Emit(ButtonInput(button,false));Buttons.Remove(button);}','else if(action=="up" && Buttons.Remove(button)) Emit(ButtonInput(button,false));','Failed release was forgotten: pointer',1),
   @('terminal-latch','WindowsResourceFence.cs','if(failed||!Current()){failed=true;return false;}','if(failed||!Current()){failed=false;return false;}','Failed cleanup revived',1),
   @('failed-release-forgotten','WindowsResourceFence.cs','catch{failed=true;}}','catch{keys.Clear();buttons.Clear();failed=true;}}','Failed key was silently forgotten',2)
  )
  foreach($variant in $variants){$name=$variant[1];$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne $variant[5]){throw 'Negative guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored resource cleanup checks failed'}
  'desktop_resource_cleanup_5_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
