param([Parameter(Mandatory=$true)][string]$OwnerSid,[Parameter(Mandatory=$true)][string]$Nonce,[Parameter(Mandatory=$true)][string]$ClaimSha256,[Parameter(Mandatory=$true)][ValidateSet('enroll','disable')][string]$Operation)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$watch=[Diagnostics.Stopwatch]::StartNew()
$claim=$null;$envelope=$null;$plain=$null;$deadline=$null;$memory=$null;$inputBytes=$null;$record=$null
try{
 Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninVault.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminEnvelope.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminJournal.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminDeadline.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminEnrollment.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminPersistence.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
 if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeInput()){throw 'private SYSTEM input required'}
 . (Join-Path $PSScriptRoot 'SigninAdminStorage.ps1')
 $journal=Open-SodaSigninAdminStorage $OwnerSid ([Func[bool]]{[SodaDesktopSigninVault]::SystemPrimary()})
 $claim=$journal.Claimed();if($claim.Sha256 -cne $ClaimSha256){throw 'claim changed'}
 $envelope=[SodaDesktopSigninAdminEnvelope]::Decode($claim.CipherEnvelope,$OwnerSid);if($envelope.Nonce -cne $Nonce){throw 'nonce changed'};$plain=$envelope.Decrypt()
 $deadline=[SodaDesktopSigninAdminDeadline]::new($plain,$OwnerSid,$Nonce,[Func[long]]{[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()},[Func[long]]{$watch.ElapsedMilliseconds},[Func[bool]]{[SodaDesktopSigninVault]::SystemPrimary()})
 if($deadline.Kind -cne $Operation){throw 'wrong request operation'}
 $memory=[IO.MemoryStream]::new();$inputStream=[Console]::OpenStandardInput()
 while($true){if(-not $deadline.Current()){throw 'expired'};$value=$inputStream.ReadByte();if($value -eq -1){break};if($memory.Length -ge 16384){throw 'oversized enrollment'};$memory.WriteByte([byte]$value)}
 $inputBytes=$memory.ToArray()
 $directoryPolicy=[Func[string,bool]]{param($path) Test-SodaSigninStorageAcl (Get-Acl -LiteralPath $path)};$filePolicy=[Func[IO.FileStream,bool]]{param($file) Test-SodaSigninStorageAcl ($file.GetAccessControl())}
 if($Operation -eq 'enroll'){
  $record=[SodaDesktopSigninAdminEnrollment]::Canonical($inputBytes,$plain,$OwnerSid)
  [SodaDesktopSigninAdminPersistence]::Enrollment($OwnerSid,$Nonce,$record,$deadline.Kind,[Func[bool]]{$deadline.Current()},$directoryPolicy,$filePolicy)
  [Console]::Out.WriteLine('signin_admin_enrollment_committed')
 }else{
  if($inputBytes.Length -ne 0){throw 'disable has no payload'}
  [SodaDesktopSigninAdminPersistence]::DisableEnrollment($OwnerSid,$deadline.Kind,[Func[bool]]{$deadline.Current()},$directoryPolicy,$filePolicy)
  [Console]::Out.WriteLine('signin_admin_enrollment_disabled')
 }
}catch{[Console]::Error.WriteLine('Signin enrollment update is unavailable');exit 1}
finally{
 if($null -ne $deadline){$deadline.Close()}
 if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
 if($null -ne $inputBytes){[Array]::Clear($inputBytes,0,$inputBytes.Length)}
 if($null -ne $record){[Array]::Clear($record,0,$record.Length)}
 if($null -ne $memory){$buffer=$memory.GetBuffer();[Array]::Clear($buffer,0,$buffer.Length);$memory.Dispose()}
 if($null -ne $envelope){$envelope.Dispose()}
 if($null -ne $claim){[Array]::Clear($claim.CipherEnvelope,0,$claim.CipherEnvelope.Length)}
}
exit 0
