param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated ordinary temporary admin requests/results and bounded stdin pipes.
# No real SCM, installed paths, privileged entry, provider keys/trust or desktop.
# Fixture cleanup may terminate only its own generated input reader on failure.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninRunStorage.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninAdminDeadline.cs','WindowsSigninAdminJournal.cs','WindowsSigninAdminResult.cs','WindowsSigninAdminEnrollment.cs','WindowsSigninAdminController.cs','WindowsSigninAdminInput.cs','WindowsSigninAdminControllerChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-process-evidence-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program=@'
$ErrorActionPreference='Stop'
try {
 $paths=@(__PATHS__);$exe=Join-Path '__ROOT__' ('generated-'+[guid]::NewGuid().ToString('N')+'.exe')
 $parameters=[CodeDom.Compiler.CompilerParameters]::new();$parameters.GenerateExecutable=$true;$parameters.IncludeDebugInformation=$true;$parameters.OutputAssembly=$exe;$parameters.CompilerOptions='/platform:x64 /main:SodaDesktopSigninAdminControllerChecks';$parameters.ReferencedAssemblies.AddRange([string[]]@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'))
 $compiler=[Microsoft.CSharp.CSharpCodeProvider]::new()
 try{$result=$compiler.CompileAssemblyFromFile($parameters,[string[]]$paths);if($result.Errors.HasErrors){throw ($result.Errors|Out-String)}}finally{$compiler.Dispose()}
 [Reflection.Assembly]::LoadFrom($exe)|Out-Null
 [SodaDesktopSigninAdminControllerChecks]::Run($exe)
}catch{[Console]::Out.WriteLine($_.Exception.ToString());exit 1};exit 0
'@
$program=$program.Replace('__PATHS__',$paths).Replace('__ROOT__',$root.Replace("'","''"));$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated controller checks failed'}
 if($NegativeControls){
  $variants=@(
   @('scope','WindowsSigninAdminController.cs','CheckCore(parent,policy);Require(active());','CheckCore(parent,policy);Require(true);','Revoked preparation published request',1),
   @('stage','WindowsSigninAdminController.cs','Require(written.Same(SodaDesktopSigninVault.Facts(held.Handle)));','Require(written.Regular);','Replaced pending stage was published',1),
   @('claim-hash','WindowsSigninAdminController.cs','Require(cipher==expectedCipher);','Require(cipher==cipher);','Wrong claim hash acknowledged result',1),
   @('result-hash','WindowsSigninAdminController.cs','expectedResult!=null&&digest==expectedResult','expectedResult!=null','Wrong result hash acknowledged result',1),
   @('input-deadline','WindowsSigninAdminInput.cs','at-began>=10000','at-began>10000','Unclosed operation pipe ignored deadline',1),
   @('input-final','WindowsSigninAdminInput.cs','if(end<last||end-began>=10000)throw Failure();','if(end<last)throw Failure();','EOF operation input crossed deadline',1),
   @('input-size','WindowsSigninAdminInput.cs','16384','16385','Overlong operation pipe input accepted',4)
  )
  foreach($variant in $variants){$name=$variant[1];$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne $variant[5]){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Controller source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored controller checks failed'}
  'signin_admin_controller_7_source_negative_controls_and_restore_passed'
 }
 # Exercise the public PowerShell input path with generated UTF8 enrollment
 # data. Validation has no SCM/storage/owner operations and exposes kind only.
 $priorEncoding=[Console]::InputEncoding;$child=$null;$payload=$null
 try {
  [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
  $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$shell;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $script=Join-Path $PSScriptRoot 'control-signin-admin.ps1'
  $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'" -ValidateOperationOnly -OwnerSid S-1-5-21-1-2-3-1001 -ManifestSha256 '+('a'*64)
  $child=[Diagnostics.Process]::Start($info);$outputTask=$child.StandardOutput.ReadToEndAsync();$errorTask=$child.StandardError.ReadToEndAsync()
  $token='t'*43;$request=@{kind='enroll';origin='https://root.example';machineId=('c'*32);token=$token;allowInput=$false;peers=@(@{fingerprint=('b'*64);label=([string][char]0x65e5+[char]0x672c+[char]0x8a9e)})}|ConvertTo-Json -Depth 6 -Compress
  $payload=[Text.UTF8Encoding]::new($false).GetBytes($request);$child.StandardInput.BaseStream.Write($payload,0,$payload.Length);$child.StandardInput.BaseStream.Close()
  if(-not $child.WaitForExit(30000)){throw 'Public generated input validation timeout'}
  $actual=$outputTask.Result;$errors=$errorTask.Result;if($child.ExitCode -ne 0){throw 'Public generated input validation failed'}
  $data=$actual|ConvertFrom-Json;if($data.state -cne 'operation-validated' -or $data.operation -cne 'enroll' -or @($data.PSObject.Properties).Count -ne 2 -or $actual.Contains($token) -or $errors.Contains($token)){throw 'Public generated input validation leaked or changed data'}
  'signin_admin_public_powershell_utf8_pipe_validation_without_payload_output_passed'
 } finally {
  try{
   if($null -ne $payload){[Array]::Clear($payload,0,$payload.Length)}
   if($null -ne $child){try{if(-not $child.HasExited){$child.Kill();$child.WaitForExit(5000)|Out-Null}}finally{$child.Dispose()}}
  }finally{[Console]::InputEncoding=$priorEncoding}
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
