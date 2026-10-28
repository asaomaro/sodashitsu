param([Parameter(Mandatory=$true)][string]$OwnerSid,[Parameter(Mandatory=$true)][string]$Nonce,[Parameter(Mandatory=$true)][string]$ClaimSha256,[Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$watch=[Diagnostics.Stopwatch]::StartNew()
$claim=$null;$envelope=$null;$plain=$null;$deadline=$null
try{
 Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninVault.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminEnvelope.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminJournal.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminDeadline.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminPersistence.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
 if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeInput()){throw 'private SYSTEM input required'}
 . (Join-Path $PSScriptRoot 'SigninAdminStorage.ps1')
 $journal=Open-SodaSigninAdminStorage $OwnerSid ([Func[bool]]{[SodaDesktopSigninVault]::SystemPrimary()})
 $claim=$journal.Claimed();if($claim.Sha256 -cne $ClaimSha256){throw 'claim changed'}
 $envelope=[SodaDesktopSigninAdminEnvelope]::Decode($claim.CipherEnvelope,$OwnerSid);if($envelope.Nonce -cne $Nonce){throw 'nonce changed'};$plain=$envelope.Decrypt()
 $deadline=[SodaDesktopSigninAdminDeadline]::new($plain,$OwnerSid,$Nonce,[Func[long]]{[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()},[Func[long]]{$watch.ElapsedMilliseconds},[Func[bool]]{[SodaDesktopSigninVault]::SystemPrimary()})
 [SodaDesktopSigninAdminPersistence]::CommitVault($OwnerSid,$Source,$Destination,$deadline.Kind,[Func[bool]]{$deadline.Current()},[Func[string,bool]]{param($path) Test-SodaSigninStorageAcl (Get-Acl -LiteralPath $path)},[Func[IO.FileStream,bool]]{param($file) Test-SodaSigninStorageAcl ($file.GetAccessControl())})
 [Console]::Out.WriteLine('signin_admin_vault_committed')
}catch{[Console]::Error.WriteLine('Signin administration vault commit is unavailable');exit 1}
finally{
 if($null -ne $deadline){$deadline.Close()}
 if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
 if($null -ne $envelope){$envelope.Dispose()}
 if($null -ne $claim){[Array]::Clear($claim.CipherEnvelope,0,$claim.CipherEnvelope.Length)}
}
exit 0
