param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated scope facts and memory output only. No capture, encoder, OS input or service.
$names=@('WindowsDesktopUnlock.cs','WindowsDesktopHost.cs','WindowsDisplayLeaseChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-virtual-modes-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll;[SodaDesktopHost]::VerifyVirtualDesktopGuard();[SodaDesktopTests.DisplayModeChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated owned virtual mode checks failed'}
 if($NegativeControls){
  $variants=@(
   @('owned-source','if(!currentOwner)throw new InvalidOperationException("Virtual display scope changed");','if(!currentOwner&&clock.ElapsedMilliseconds<0)throw new InvalidOperationException("Virtual display scope changed");','Virtual mode source/budget guard missing'),
   @('original-budget','at-started>=3000','at-started>=300000','Virtual mode source/budget guard missing'),
   @('exact-monitor','String.Equals(virtualDevice,selectedDevice,StringComparison.OrdinalIgnoreCase)','true','Virtual resize escaped the owned monitor'),
   @('post-query-budget','bool currentOwner=owned();long at=now();','long at=now();bool currentOwner=owned();','Virtual mode committed after source/budget loss: scope-query-deadline')
  )
  foreach($variant in $variants){$name='WindowsDesktopHost.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw 'Negative guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains($variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored owned virtual mode checks failed'}
  'virtual_modes_4_source_negative_controls_and_restore_passed'
 }
 foreach($name in $names){if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Production source bytes changed'}}
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
