param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$files=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunAdmission.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninRunStorage.cs','WindowsSigninRunSession.cs','WindowsSigninHost.cs','WindowsSigninProcess.cs','WindowsSigninHostChecks.cs','WindowsSigninRunSessionChecks.cs')
$combined=($files|ForEach-Object{[IO.File]::ReadAllText((Join-Path $PSScriptRoot $_))}) -join "`n"
$combined=$combined.Replace('__SIGNIN_OWNER_SID__','S-1-5-21-1-2-3-1001')
$usings=[regex]::Matches($combined,'(?m)^using [^;]+;')|ForEach-Object{$_.Value}|Select-Object -Unique
$combined=($usings -join "`n")+"`n"+[regex]::Replace($combined,'(?m)^using [^;]+;','')
$refs=@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll','System.ServiceProcess.dll')
Add-Type -TypeDefinition $combined -ReferencedAssemblies $refs
if([SodaDesktopSigninVault]::SystemPrimary()){throw 'Generated service checks require ordinary account'}
[SodaDesktopSigninHostChecks]::ServiceLifecycle()
if($NegativeControls){
 $root=Join-Path ([IO.Path]::GetTempPath()) ('soda-scm-'+[guid]::NewGuid().ToString('N'))
 [IO.Directory]::CreateDirectory($root)|Out-Null
 $shell=Join-Path $PSHOME 'powershell.exe'
 $variants=@(
  @('managed-name','Name="SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(Owner);','Name="SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(Owner);new System.ServiceProcess.ServiceBase{ServiceName=Name};','Fixed service name exceeded managed limit'),
  @('shutdown-accept','Accepted=state==4?5u:0u','Accepted=state==4?1u:0u','Service accepted controls incorrect'),
  @('stop-event','stop.Set();if(status.State==4)Report(3);','if(status.State==4)Report(3);','Service stop event missing'),
  @('start-arguments','if(count!=1||arguments==IntPtr.Zero||Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments))!=Name)throw Failure();','if(count==UInt32.MaxValue)throw Failure();','Invalid service start arguments executed runner'),
  @('deadline','if(status.State==4)deadline=new StopDeadline(schedule,()=>Environment.FailFast("Signin host could not stop within deadline"));','if(status.State==4){}','Service stop deadline missing or not canceled'),
  @('stage-report','Specific=ExitCode==0?0u:specific','Specific=ExitCode==0?0u:1u','Fixed startup stage lost or unbounded'),
  @('stage-bound','Code=code>=101&&code<=109?code:1u;','Code=code;','Fixed startup stage lost or unbounded'),
  @('failure-exit','}catch{ExitCode=1;}','}catch{ExitCode=0;}','Service failure lost exit status')
 )
 try{
  foreach($variant in $variants){
   if(([regex]::Matches($combined,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   $path=Join-Path $root 'mutant.cs';$bytes=[Text.Encoding]::UTF8.GetBytes($combined)
   try{
    [IO.File]::WriteAllText($path,$combined.Replace($variant[1],$variant[2]))
    $literal="'"+$path.Replace("'","''")+"'"
    $program="`$ErrorActionPreference='Stop';try{Add-Type -Path $literal -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll;[SodaDesktopSigninHostChecks]::ServiceLifecycle()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
    $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
    'negative '+$variant[0];$output|ForEach-Object{Write-Output ([string]$_)}
    if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes($path,$bytes);if([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -cne [Convert]::ToBase64String($bytes)){throw 'Restoration failed'}}
  }
  [SodaDesktopSigninHostChecks]::ServiceLifecycle()
  'signin_native_service_source_negatives_and_restore_passed'
 }finally{[IO.Directory]::Delete($root,$true)}
}
