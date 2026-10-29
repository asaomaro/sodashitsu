param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Actual ordinary generated child handles only. Never service, SYSTEM, desktop,
# installed ProgramData, credentials or trust setup. No external/service process
# termination; fixture cleanup may stop only its own generated child.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninServicePolicy.cs','WindowsSigninRunRecord.cs','WindowsSigninProcessEvidence.cs','WindowsSigninProcessEvidenceChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-process-evidence-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program=@'
$ErrorActionPreference='Stop'
try {
 $paths=@(__PATHS__);$exe=Join-Path '__ROOT__' ('generated-'+[guid]::NewGuid().ToString('N')+'.exe')
 $parameters=[CodeDom.Compiler.CompilerParameters]::new();$parameters.GenerateExecutable=$true;$parameters.OutputAssembly=$exe;$parameters.CompilerOptions='/platform:x64 /main:SodaDesktopSigninProcessEvidenceChecks';$parameters.ReferencedAssemblies.AddRange([string[]]@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll'))
 $compiler=[Microsoft.CSharp.CSharpCodeProvider]::new()
 try{$result=$compiler.CompileAssemblyFromFile($parameters,[string[]]$paths);if($result.Errors.HasErrors){throw ($result.Errors|Out-String)}}finally{$compiler.Dispose()}
 [Reflection.Assembly]::LoadFrom($exe)|Out-Null
 [SodaDesktopSigninProcessEvidenceChecks]::Run($exe)
}catch{[Console]::Out.WriteLine($_.Exception.ToString());exit 1};exit 0
'@
$program=$program.Replace('__PATHS__',$paths).Replace('__ROOT__',$root.Replace("'","''"));$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated process evidence failed'}
 if($NegativeControls){
  $variants=@(
   @('creation','||GetProcessId(handle)!=Process.Pid||Creation(handle)!=Process.Created||!Image','||GetProcessId(handle)!=Process.Pid||!Image','Creation mismatch retained process pin'),
   @('image','||!Image(handle,image)','','Image mismatch retained process pin'),
   @('system','||system&&!SystemSessionZero(handle)','||system&&SystemSessionZero(handle)&&false','Ordinary process became SYSTEM session0 evidence'),
   @('exit','code!=0','code==UInt32.MaxValue','Retained handle ignored actual exit code 7'),
   @('inspection','||system&&!SystemSessionZero(handle)||!Scope()','||system&&!SystemSessionZero(handle)','Inspection-time process scope remained current'),
   @('exit-inspection','||Creation(handle)!=Process.Created||!Scope()','||Creation(handle)!=Process.Created','Exit inspection ignored revoked process scope'),
   @('scope','scope==null||!scope()||ended','scope==null||scope()==false&&false||ended','Revoked process scope remained current')
  )
  $name='WindowsSigninProcessEvidence.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);foreach($variant in $variants){if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Process evidence bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored process evidence failed'}
  'signin_process_evidence_7_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
