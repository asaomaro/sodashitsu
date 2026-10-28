param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated configuration/ACL data only. Never invokes Inspect or any SCM API.
$names=@('WindowsSigninPackage.cs','WindowsSigninServicePolicy.cs','WindowsSigninControllerMutex.cs','WindowsSigninServicePolicyChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-service-policy-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe';$paths=($names|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninServicePolicyChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0";$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated service policy checks failed'}
 if($NegativeControls){
  $variants=@(
   @('mutex-owner','descriptor.Owner.Value!="S-1-5-18"&&descriptor.Owner.Value!="S-1-5-32-544"||','','Unsafe controller mutex ACL accepted','WindowsSigninControllerMutex.cs'),
   @('mutex-acl','if(mask!=0)return false;','','Unsafe controller mutex ACL accepted','WindowsSigninControllerMutex.cs'),
   @('buffer-range','if(pointer==IntPtr.Zero||bytes<0||offset<0||offset>Size||bytes>Size-offset)throw Failure();','','SCM accepted pointer before buffer'),
   @('action-count','if(actions.Count>16)throw Failure();','','SCM accepted excessive action count'),
   @('account','f.Account!="LocalSystem"||','','Non-System service account accepted'),
   @('type','f.Type!=0x10||','','Interactive service type accepted'),
   @('recovery','foreach(uint action in f.Actions)if(action!=0)throw Failure();','','Recovery restart action accepted'),
   @('owner','descriptor.Owner.Value!="S-1-5-18"&&descriptor.Owner.Value!="S-1-5-32-544"||','','Untrusted service owner accepted'),
   @('acl-control','else if((mask&~0x0002008du)!=0)return false;','','Untrusted service control right accepted: DC')
  )
  foreach($variant in $variants){$name=if($variant.Count -gt 4){$variant[4]}else{'WindowsSigninServicePolicy.cs'};$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{[IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}}
   finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored service policy checks failed'}
  'signin_service_policy_9_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
