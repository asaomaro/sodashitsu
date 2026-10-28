param([Parameter(Mandatory=$true)][string]$OwnerSid)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$claim=$null;$plain=$null;$envelope=$null;$bytes=$null
try{
 Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninVault.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminEnvelope.cs'),(Join-Path $PSScriptRoot 'WindowsSigninAdminJournal.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
 . (Join-Path $PSScriptRoot 'SigninAdminStorage.ps1')
 $journal=Open-SodaSigninAdminStorage $OwnerSid ([Func[bool]]{[SodaDesktopSigninVault]::SystemPrimary()})
 $state=$journal.State()
 if($state -eq 'normal'){$bytes=[Text.UTF8Encoding]::new($false,$true).GetBytes('{"state":"normal"}'+"`n")}
 elseif($state -eq 'claim'){
  $claim=$journal.Claim();$envelope=[SodaDesktopSigninAdminEnvelope]::Decode($claim.CipherEnvelope,$OwnerSid);$plain=$envelope.Decrypt()
  $bytes=$envelope.ClaimReply($claim.Sha256,$plain)
 }else{throw 'journal requires deliberate recovery'}
 if(-not [SodaDesktopSigninVault]::SystemPrimary()){throw 'owner changed'}
 try{$output=[Console]::OpenStandardOutput();$output.Write($bytes,0,$bytes.Length);$output.Flush()}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}catch{[Console]::Error.WriteLine('Signin administration request is unavailable');exit 1}
finally{
 if($null -ne $bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
 if($null -ne $envelope){$envelope.Dispose()}
 if($null -ne $claim){[Array]::Clear($claim.CipherEnvelope,0,$claim.CipherEnvelope.Length)}
}
exit 0
