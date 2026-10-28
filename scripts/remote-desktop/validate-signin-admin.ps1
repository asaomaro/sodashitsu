param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated plaintext/ciphertext only. No real keys, SYSTEM token, ACL/SCM,
# enrollment file, credential input, service or privileged Main is touched.
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-admin-check-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$path=Join-Path $root 'WindowsSigninVault.cs';$original=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'WindowsSigninVault.cs'));$source=[Text.Encoding]::UTF8.GetString($original)
[IO.File]::Copy((Join-Path $PSScriptRoot 'WindowsSigninAdminEnvelope.cs'),(Join-Path $root 'WindowsSigninAdminEnvelope.cs'))
$checks=@'
using System;
using System.Text;
public static class SigninAdminGeneratedChecks {
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Denied(Action operation,string message){bool failed=false;try{operation();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
 public static void Run(){
  const string owner="S-1-5-21-1-2-3-1001",nonce="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
  byte[] plain=Encoding.UTF8.GetBytes("generated admin payload only"),snapshot=(byte[])plain.Clone(),cipher=null,decoded=null;
  try{
   cipher=SodaDesktopSigninVault.ProtectAdmin(plain,owner,nonce);decoded=SodaDesktopSigninVault.UnprotectAdmin(cipher,owner,nonce);
   Check(Convert.ToBase64String(plain)==Convert.ToBase64String(snapshot)&&Convert.ToBase64String(decoded)==Convert.ToBase64String(snapshot),"Admin roundtrip or caller bytes changed");
   Denied(()=>SodaDesktopSigninVault.Unprotect(cipher,owner),"Admin cipher accepted by enrollment domain");
   Denied(()=>SodaDesktopSigninVault.UnprotectAdmin(cipher,owner,other),"Admin nonce binding omitted");
   Denied(()=>SodaDesktopSigninVault.UnprotectAdmin(cipher,"S-1-5-21-1-2-3-1002",nonce),"Admin owner binding omitted");
   byte[] enrollment=SodaDesktopSigninVault.Protect(plain,owner);try{Denied(()=>SodaDesktopSigninVault.UnprotectAdmin(enrollment,owner,nonce),"Enrollment cipher accepted by admin domain");}finally{Array.Clear(enrollment,0,enrollment.Length);}
   foreach(string bad in new[]{"",Guid.Empty.ToString("D"),"11111111111141118111111111111111","ABCDEFAB-1111-4111-8111-111111111111"})Denied(()=>SodaDesktopSigninVault.ProtectAdmin(plain,owner,bad),"Admin noncanonical nonce accepted");
   using(var envelope=SodaDesktopSigninAdminEnvelope.Protect(plain,owner,nonce)){
    byte[] encoded=envelope.Encode();try{
     using(var parsed=SodaDesktopSigninAdminEnvelope.Decode(encoded,owner)){byte[] clear=parsed.Decrypt();try{Check(Convert.ToBase64String(clear)==Convert.ToBase64String(snapshot),"Admin envelope roundtrip changed");}finally{Array.Clear(clear,0,clear.Length);}}
     Denied(()=>SodaDesktopSigninAdminEnvelope.Decode(encoded,"S-1-5-21-1-2-3-1002"),"Admin envelope owner mismatch accepted");
     string text=Encoding.UTF8.GetString(encoded);byte[] extra=Encoding.UTF8.GetBytes(text.Replace("\"version\":1","\"extra\":true,\"version\":1"));try{Denied(()=>SodaDesktopSigninAdminEnvelope.Decode(extra,owner),"Admin envelope noncanonical fields accepted");}finally{Array.Clear(extra,0,extra.Length);}
     byte[] changed=Encoding.UTF8.GetBytes(text.Replace(nonce,other));try{using(var mismatch=SodaDesktopSigninAdminEnvelope.Decode(changed,owner))Denied(()=>mismatch.Decrypt(),"Admin envelope nonce transplant accepted");}finally{Array.Clear(changed,0,changed.Length);}
    }finally{Array.Clear(encoded,0,encoded.Length);}
   }
   Denied(()=>SodaDesktopSigninVault.ProtectAdmin(new byte[16385],owner,nonce),"Admin plaintext bound omitted");
   Denied(()=>SodaDesktopSigninVault.UnprotectAdmin(new byte[65537],owner,nonce),"Admin ciphertext bound omitted");
   Denied(()=>SodaDesktopSigninVault.ProtectAdmin(plain,"S-1-5-18",nonce),"Admin SYSTEM owner accepted");
  }finally{Array.Clear(plain,0,plain.Length);Array.Clear(snapshot,0,snapshot.Length);if(cipher!=null)Array.Clear(cipher,0,cipher.Length);if(decoded!=null)Array.Clear(decoded,0,decoded.Length);}
  Console.WriteLine("signin_admin_generated_crypto_domains_passed");
 }
}
'@
[IO.File]::WriteAllText((Join-Path $root 'Checks.cs'),$checks)
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @('"+$path.Replace("'","''")+"','"+(Join-Path $root 'Checks.cs').Replace("'","''")+"','"+(Join-Path $root 'WindowsSigninAdminEnvelope.cs').Replace("'","''")+"') -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SigninAdminGeneratedChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try{
 [IO.File]::WriteAllBytes($path,$original);$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Generated admin crypto checks failed'}
 if($NegativeControls){
  $variants=@(
   @('nonce','+"\0"+nonce','+""','Admin nonce binding omitted'),
   @('owner','"Sodashitsu signin admin v1\0"+Owner(owner)','"Sodashitsu signin admin v1\0"+Owner("S-1-5-21-1-2-3-1001")','Admin owner binding omitted'),
   @('domain','"Sodashitsu signin admin v1\0"+Owner(owner)+"\0"+nonce','"Sodashitsu signin enrollment v1\0"+Owner(owner)','Admin cipher accepted by enrollment domain')
  )
  foreach($variant in $variants){
   if(([regex]::Matches($source,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{
    [IO.File]::WriteAllText($path,$source.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
    'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes($path,$original);if([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -cne [Convert]::ToBase64String($original)){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored admin crypto checks failed'}
  $envelopePath=Join-Path $root 'WindowsSigninAdminEnvelope.cs';$envelopeBytes=[IO.File]::ReadAllBytes($envelopePath);$envelopeSource=[Text.Encoding]::UTF8.GetString($envelopeBytes)
  foreach($variant in @(
   @('envelope-canonical','if(new UTF8Encoding(false,true).GetString(canonical)!=text)throw Failure();','if(canonical.Length==0)throw Failure();','Admin envelope noncanonical fields accepted'),
   @('envelope-owner','data.ownerSid!=SodaDesktopSigninVault.Owner(owner)||','','Admin envelope owner mismatch accepted')
  )){
   if(([regex]::Matches($envelopeSource,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
   try{
    [IO.File]::WriteAllText($envelopePath,$envelopeSource.Replace($variant[1],$variant[2]));$output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
    'negative '+$variant[0];$output|ForEach-Object{[string]$_};if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
   }finally{[IO.File]::WriteAllBytes($envelopePath,$envelopeBytes);if([Convert]::ToBase64String([IO.File]::ReadAllBytes($envelopePath)) -cne [Convert]::ToBase64String($envelopeBytes)){throw 'Source bytes not restored'}}
  }
  $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object{[string]$_};if($code -ne 0){throw 'Restored envelope checks failed'}
  'signin_admin_5_source_negative_controls_and_restore_passed'
 }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
