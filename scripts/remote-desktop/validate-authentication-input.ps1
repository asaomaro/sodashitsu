param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated callbacks only. No actual desktop, input, SCM or service operations.
$names=@('WindowsDesktopHost.cs','WindowsDesktopHostChecks.cs','WindowsDesktopUnlockChecks.cs','WindowsDesktopUnlock.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-authentication-input-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{`$testCompiler=[CodeDom.Compiler.CompilerParameters]::new([string[]]@('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'));`$testCompiler.CompilerOptions='/define:SODA_DESKTOP_TEST';Add-Type -Path @($paths) -CompilerParameters `$testCompiler;[SodaDesktopHost]::VerifyAuthenticationInput();[SodaDesktopHost]::VerifyControlCompletion();[SodaDesktopHost]::VerifyLiveInputDeadline();[SodaDesktopHost]::VerifySnapshotRequests()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program));$shell=Join-Path $PSHOME 'powershell.exe'
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Authentication input checks failed'}
 if($NegativeControls){
  $variants=@(
   @('enter-two-messages','if(Secure&&SecureLockState!=null&&ProtectedMode==null&&down&&','if(Secure&&SecureLockState==null&&ProtectedMode==null&&down&&','Authentication pulse retained input'),
   @('pin-two-messages','(key==13||key==(13|0x100)||key>=48&&key<=57||key>=96&&key<=105)','(key==13||key==(13|0x100))','Authentication pulse retained input'),
   @('unicode-two-calls','EmitInputs(new[]{a,up});','Emit(a);Emit(up);','Authentication pulse retained input'),
   @('partial-accepted','if(sent!=values.Length)throw','if(sent==uint.MaxValue)throw','Partial authentication input was accepted or forgotten')
  )
  foreach($variant in $variants){$before=[Text.Encoding]::UTF8.GetString($original['WindowsDesktopHost.cs']);if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw 'Authentication negative guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $root 'WindowsDesktopHost.cs'),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains($variant[3]))){throw 'Authentication negative did not fail the intended assertion'}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root 'WindowsDesktopHost.cs'),$original['WindowsDesktopHost.cs']);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root 'WindowsDesktopHost.cs'))) -cne [Convert]::ToBase64String($original['WindowsDesktopHost.cs'])){throw 'Authentication source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored authentication source failed'}
  'authentication_4_negative_controls_and_byte_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
