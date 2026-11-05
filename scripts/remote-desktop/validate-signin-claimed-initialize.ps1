param([switch]$NegativeControls,[string]$NodeFixture)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Ordinary generated files and ephemeral keys only. No real state, SCM, task or reboot.
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs','WindowsSigninPartialIdentityProof.cs','WindowsSigninClaimedInitializeRecovery.cs','WindowsSigninClaimedInitializeRecoveryChecks.cs')
if($NegativeControls){
 $temp=Join-Path ([IO.Path]::GetTempPath()) ('soda-claimed-check-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($temp)|Out-Null
 $all=$names+@('validate-signin-claimed-initialize.ps1');$original=@{};foreach($name in $all){$original[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $temp $name),$original[$name])}
 $variants=@(
  @('powershell-ticket','WindowsSigninClaimedInitializeRecovery.cs','string.IsNullOrEmpty(ticketHash)','ticketHash==null','PowerShell absent ticket was rejected'),
  @('history-link','WindowsSigninClaimedInitializeRecovery.cs','History(slot,owner,barrier,policy,active,wall);','/* generated omitted history linkage */'),
  @('same-scm','WindowsSigninClaimedInitializeRecovery.cs','R.RequireNewInstance((string)fields["scmInstance"],critical);','/* generated omitted new SCM guard */'),
  @('fresh-proof','WindowsSigninClaimedInitializeRecovery.cs','&&wall()-Convert.ToInt64(p["issuedAt"])<90000','&&true'),
  @('peer-empty','WindowsSigninPartialIdentityProof.cs','&&((object[])vault["peers"]).Length==0','&&true'),
  @('key-possession','WindowsSigninPartialIdentityProof.cs','VerifyPossession(secret,rawPublic);','/* generated omitted private/public key proof */')
 )
 try{
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -File (Join-Path $temp 'validate-signin-claimed-initialize.ps1');if($LASTEXITCODE -ne 0){throw 'Generated checks failed'}
  foreach($v in $variants){$source=[Text.Encoding]::UTF8.GetString($original[$v[1]]);if(([regex]::Matches($source,[regex]::Escape($v[2]))).Count -ne 1){throw 'Negative source guard changed'}
   try{[IO.File]::WriteAllText((Join-Path $temp $v[1]),$source.Replace($v[2],$v[3]));$ErrorActionPreference='Continue';$lines=& (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -File (Join-Path $temp 'validate-signin-claimed-initialize.ps1') 2>&1;$exit=$LASTEXITCODE;$ErrorActionPreference='Stop';'negative '+$v[0];$lines|ForEach-Object{[string]$_};if($exit -eq 0 -or -not (($lines|Out-String).Contains($(if($v.Length -gt 4){$v[4]}else{'was accepted'})))){throw 'Negative did not fail expected assertion'}}
   finally{[IO.File]::WriteAllBytes((Join-Path $temp $v[1]),$original[$v[1]])}
  }
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -File (Join-Path $temp 'validate-signin-claimed-initialize.ps1');if($LASTEXITCODE -ne 0){throw 'Restored checks failed'}
  foreach($name in $all){if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))) -cne [Convert]::ToBase64String($original[$name])){throw 'Production source changed'}}
  'claimed_initialize_6_negatives_and_exact_restore_passed'
 }finally{[IO.Directory]::Delete($temp,$true)}
 exit 0
}
Add-Type -Path ($names|ForEach-Object {Join-Path $PSScriptRoot $_}) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
try{if($NodeFixture){[SodaDesktopSigninClaimedInitializeRecoveryChecks]::ValidateGeneratedNodeFile($NodeFixture)}else{[SodaDesktopSigninClaimedInitializeRecoveryChecks]::Run()}}catch{[Console]::Error.WriteLine('generated_identity_failure_phase:'+ [SodaDesktopSigninPartialIdentityProof]::LastPhase);throw}
