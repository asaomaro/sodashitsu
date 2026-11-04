param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninRunStorage.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninInstallSource.cs','WindowsSigninInstallSourceChecks.cs','WindowsSigninUpgradeFiles.cs','WindowsSigninUpgradeScm.cs','WindowsSigninUpgrade.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninUnclaimedRecoveryChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('uc-src-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};foreach($name in $names){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name])}
$shell=Join-Path $PSHOME 'powershell.exe';$paths=($names|ForEach-Object{"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninUnclaimedRecoveryChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
function Invoke-Checks {
 $text=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$script:code=$LASTEXITCODE
 $script:output=$text;$text|ForEach-Object{[string]$_}
}
try{
 Invoke-Checks;if($code -ne 0){throw 'Generated unclaimed cancellation checks failed'}
 if($NegativeControls){
  $variants=@(
   @('admin-expiry','&&expires<=now&&','&&true&&','Unexpired admin request canceled',1),
   @('nonce-binding','Require(envelope.Nonce==(string)intent.Field("adminNonce"));','Require(true);','Different admin nonce canceled',1),
   @('source-hash','Hash(runBytes)==runHash&&','true&&','Bad hash changed state',1),
   @('slot-inventory','Require(actual.Length==entries.Count);foreach(string path in actual)Require(entries.Contains(Path.GetFileName(path)));','','Existing key or claimed state canceled',1),
   @('archive-identity','Require(File.Before.Same(actual.File.Before,false,16384)&&Hash(actual.Bytes)==hash);','Require(Hash(actual.Bytes)==hash);','Replaced archive identity accepted',1),
   @('marker-first','storage.Write("install.transition",marker,createFile);','','Cancellation marker did not block startup',1),
   @('late-admin','Require(Directory.GetFileSystemEntries(storage.PathOf("admin")).Length==0);','','Late admin modification accepted',1),
   @('stopped-scope','&&stopped()','&&true','Running service canceled pending request',2)
  )
  foreach($variant in $variants){
   $name='WindowsSigninUnclaimedRecovery.cs';$before=[Text.Encoding]::UTF8.GetString($original[$name]);if(([regex]::Matches($before,[regex]::Escape($variant[1]))).Count -ne $variant[4]){throw ('Negative guard changed: '+$variant[0])}
   try{
    [IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[1],$variant[2]));'negative '+$variant[0];Invoke-Checks
    if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes((Join-Path $root $name),$original[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Restoration failed'}}
  }
  Invoke-Checks;if($code -ne 0){throw 'Restored source failed'}
  'signin_unclaimed_cancellation_source_negatives_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
