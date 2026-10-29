param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Ordinary generated Host/child/Job/journal, with fake SCM calls only. Never
# real service queries/control, privileged Host Main, installed ProgramData,
# credentials/trust setup or external-process termination. Fixture cleanup may
# terminate only its own generated Host on test failure.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunAdmission.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninRunStorage.cs','WindowsSigninRunSession.cs','WindowsSigninHost.cs','WindowsSigninProcess.cs','WindowsSigninHostChecks.cs','WindowsSigninRunSessionChecks.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninController.cs','WindowsSigninControllerChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-process-evidence-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program=@'
$ErrorActionPreference='Stop'
try {
 $paths=@(__PATHS__);$exe=Join-Path '__ROOT__' ('generated-'+[guid]::NewGuid().ToString('N')+'.exe')
 $parameters=[CodeDom.Compiler.CompilerParameters]::new();$parameters.GenerateExecutable=$true;$parameters.IncludeDebugInformation=$true;$parameters.OutputAssembly=$exe;$parameters.CompilerOptions='/platform:x64 /main:SodaDesktopSigninControllerChecks';$parameters.ReferencedAssemblies.AddRange([string[]]@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'))
 $compiler=[Microsoft.CSharp.CSharpCodeProvider]::new()
 try{$result=$compiler.CompileAssemblyFromFile($parameters,[string[]]$paths);if($result.Errors.HasErrors){throw ($result.Errors|Out-String)}}finally{$compiler.Dispose()}
 [Reflection.Assembly]::LoadFrom($exe)|Out-Null
 [SodaDesktopSigninControllerChecks]::Run($exe)
}catch{[Console]::Out.WriteLine($_.Exception.ToString());exit 1};exit 0
'@
$program=$program.Replace('__PATHS__',$paths).Replace('__ROOT__',$root.Replace("'","''"));$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated controller checks failed'}
 if($NegativeControls){
  $variants=@(
   @('reader-lock','WindowsSigninRunJournal.cs','Snapshot Inspect(){using(var lease=enter()){if(lease==null)throw Failure();return InspectLocked();}}','Snapshot Inspect(){return InspectLocked();}','Reader observed incomplete run publication',1),
   @('writer-lock','WindowsSigninRunJournal.cs','shared=enter();','shared=new EmptyLease();','Reader observed incomplete run publication',1),
   @('admin-observer','WindowsSigninController.cs','if(mode=="admin")return Observe(context,pin,journal,process,started,barrier,false);','','Short admin completion was not independently observed',1),
   @('normal-host-lifetime','WindowsSigninHost.cs','if(!run.Admin)while','if(run.Admin)while','Clean normal Host exited before stop observer could pin it',1),
   @('scm-before-exit','WindowsSigninController.cs','if(latest.State==1){Require(latest.Clean);uint exit;','if(latest.State==1){Require(latest.Clean&&process.CleanExit());uint exit;','Stopped SCM status was mistaken for process exit',1),
   @('scope','WindowsSigninScm.cs','if(!scope()||ended)','if(scope()==false&&false||ended)','Revoked SCM scope started service',1),
   @('intent','WindowsSigninScm.cs','calls.Query().State!=1||!intent()','calls.Query().State!=1||intent()&&false','Unready start intent reached SCM',1),
   @('query-reentry','WindowsSigninScm.cs','if(busy){ended=true;throw Failure();}','if(busy&&ended){ended=true;throw Failure();}','SCM query reentry retained authority',1),
   @('stop-pid','WindowsSigninScm.cs','status.Pid!=process.Process.Pid||','','Wrong SCM process was stopped',2),
   @('host-exit','WindowsSigninController.cs','process.CleanExit()','true','Nonzero host exit was accepted',3)
  )
  foreach($variant in $variants){$name=$variant[1];$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne $variant[5]){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Controller source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored controller checks failed'}
  'signin_controller_10_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
