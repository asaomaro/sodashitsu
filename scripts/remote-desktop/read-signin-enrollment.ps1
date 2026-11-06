param([Parameter(Mandatory=$true)][string]$OwnerSid,[switch]$ReadonlySource,[string]$StateDir)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$deadline=$null;$bytes=$null;$clear=$null;$plain=$null
# Called only after the verified Vault/policy types have been loaded.
function Read-SodaSigninEnrollment([string]$OwnerSid) {
 $stream=$null;$cipher=$null;$plain=$null;$transferred=$false
 try {
    if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeOutput() -or -not [SodaDesktopSigninVault]::UserAccount($OwnerSid)){throw 'readonly owner unavailable'}
    $path=[SodaDesktopSigninVault]::StoragePath($OwnerSid)
    if($path -notmatch '^[A-Za-z]:\\' -or $path.Substring(2).Contains(':')){throw 'local path required'}
    $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($path))
    if(-not (Test-SodaEndpointDrive $drive.DriveType)){throw 'fixed volume required'}
    $item=Get-Item -LiteralPath $path -Force
    if($item -isnot [IO.FileInfo]){throw 'regular file required'}
    $depth=0
    while($null -ne $item) {
        if($depth -gt 64 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'unsafe ancestor'}
        $acl=Get-Acl -LiteralPath $item.FullName
        if($depth -lt 2 -or $item.FullName -eq ([SodaDesktopSigninVault]::StateRoot())) {
            if(-not (Test-SodaSigninStorageAcl $acl)){throw 'confidential ACL required'}
        } else {
            $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
            $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
            if(-not (Test-SodaEndpointAcl $owner $rules 'S-1-5-18' $false)){throw 'unsafe ancestor ACL'}
        }
        if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent};$depth++
    }
    $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $before=[SodaDesktopSigninVault]::Facts($stream.SafeFileHandle)
    if(-not $before.Regular -or $stream.Length -lt 1 -or $stream.Length -gt 65536 -or -not (Test-SodaSigninStorageAcl ($stream.GetAccessControl()))){throw 'unsafe file handle'}
    $cipher=New-Object byte[] ([int]$stream.Length);$offset=0
    while($offset -lt $cipher.Length){$count=$stream.Read($cipher,$offset,$cipher.Length-$offset);if($count -eq 0){throw 'incomplete file'};$offset+=$count}
    if($stream.ReadByte() -ne -1){throw 'file grew'}
    $plain=[SodaDesktopSigninVault]::Unprotect($cipher,$OwnerSid)
    if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not $before.Same([SodaDesktopSigninVault]::Facts($stream.SafeFileHandle)) -or -not (Test-SodaSigninStorageAcl ($stream.GetAccessControl()))){throw 'file or owner changed'}
    $transferred=$true;return ,$plain
 } finally {
    if(-not $transferred -and $null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
    if($null -ne $cipher){[Array]::Clear($cipher,0,$cipher.Length)}
    if($null -ne $stream){$stream.Dispose()}
 }
}

try {
 $code=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'WindowsSigninVault.cs'))+@'

public sealed class SodaSigninReadDeadline : System.IDisposable {
 readonly System.Threading.Timer timer;
 public SodaSigninReadDeadline(){timer=new System.Threading.Timer(_=>System.Environment.Exit(1),null,120000,System.Threading.Timeout.Infinite);}
 public void Dispose(){timer.Dispose();}
}
'@
 Add-Type -TypeDefinition $code -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll
 if(-not [SodaDesktopSigninVault]::SystemPrimary() -or -not [SodaDesktopSigninVault]::PipeOutput() -or -not [SodaDesktopSigninVault]::UserAccount($OwnerSid) -or ($ReadonlySource -and [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0)){throw 'readonly primary required'}
 . (Join-Path $PSScriptRoot 'EndpointAclPolicy.ps1')
 . (Join-Path $PSScriptRoot 'SigninAclPolicy.ps1')
 if(-not $ReadonlySource){
  if($PSBoundParameters.ContainsKey('StateDir')){throw 'oneoff path unavailable'}
  $plain=Read-SodaSigninEnrollment $OwnerSid;$out=[Console]::OpenStandardOutput();$out.Write($plain,0,$plain.Length);$out.Flush();exit 0
 }

 if($StateDir -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFullPath($StateDir) -cne $StateDir -or $StateDir.Substring(2).Contains(':')){throw 'fixed runtime required'}
 $slot=([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash([Text.Encoding]::UTF8.GetBytes($OwnerSid)))).Replace('-','').ToLowerInvariant()
 $package=[IO.Directory]::GetParent([IO.Directory]::GetParent($PSScriptRoot).FullName).FullName
 $expected=Join-Path ([IO.Directory]::GetParent($package).FullName) ('DesktopSigninData\'+$slot+'\runtime')
 if(-not [string]::Equals($StateDir,$expected,[StringComparison]::OrdinalIgnoreCase)){throw 'runtime binding differs'}
 $allowed=@($StateDir,(Join-Path $StateDir 'desktop-endpoint'),(Join-Path $StateDir 'desktop-endpoint\identity.json'),(Join-Path $StateDir 'desktop-endpoint-required.json'))
 # Console.Out can be buffered by the PowerShell host until stdin closes.
 # Own the raw private streams so readiness and each reply arrive immediately.
 $output=[Console]::OpenStandardOutput()
 function Write-Record([object]$value){$encoded=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Compress)+"`n");try{$output.Write($encoded,0,$encoded.Length);$output.Flush()}finally{[Array]::Clear($encoded,0,$encoded.Length)}}
 $deadline=[SodaSigninReadDeadline]::new();Write-Record @{ready=$true}
 $seq=0;$reader=[IO.StreamReader]::new([Console]::OpenStandardInput(),[Text.UTF8Encoding]::new($false,$true),$false,4096,$true)
 while($true) {
  $line=[Text.StringBuilder]::new()
  while($true){$ch=$reader.Read();if($ch -eq -1){if($line.Length -ne 0){throw 'truncated input'};exit 0};if($ch -eq 10){break};if($line.Length -ge 90000 -or $ch -eq 13){throw 'input framing'};$null=$line.Append([char]$ch)}
  $request=ConvertFrom-Json -InputObject $line.ToString();$line.Clear()|Out-Null
  if($null -eq $request -or $request -is [Array] -or $request.seq -ne ($seq+1) -or $request.seq -gt 4096 -or $request.op -notin @('enrollment','unprotect','check-paths')){throw 'input shape'}
  $seq++;$properties=@($request.PSObject.Properties.Name)
  if(@($properties|Where-Object {$_ -notin @('seq','op','data','paths')}).Count -ne 0){throw 'input properties'}
  try {
   switch($request.op) {
    'enrollment' {if($properties.Count -ne 2){throw 'input properties'};$clear=Read-SodaSigninEnrollment $OwnerSid}
    'unprotect' {
     if($properties.Count -ne 3 -or $request.data -isnot [string] -or $request.data.Length -gt 87384 -or $request.data -notmatch '\A[A-Za-z0-9+/]+={0,2}\z'){throw 'input data'}
     $bytes=[Convert]::FromBase64String($request.data);if($bytes.Length -lt 1 -or $bytes.Length -gt 65536 -or [Convert]::ToBase64String($bytes) -cne $request.data){throw 'input size'}
     $entropy=[Text.Encoding]::UTF8.GetBytes('Sodashitsu desktop endpoint identity v1')
     $clear=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    }
    'check-paths' {
     if($properties.Count -ne 3 -or $request.paths -isnot [Array] -or $request.paths.Count -lt 1 -or $request.paths.Count -gt 4){throw 'input paths'}
     foreach($path in $request.paths) {
      if($path -isnot [string] -or $allowed -cnotcontains $path){throw 'input path binding'}
      if(-not (Test-SodaEndpointDrive ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($path))).DriveType)){throw 'fixed drive required'}
      $item=Get-Item -LiteralPath $path -Force -ErrorAction Stop;$first=$true;$depth=0
      while($null -ne $item) {
       if($depth++ -gt 64 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'unsafe ancestor'}
       $acl=$item.GetAccessControl();$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
       if(-not (Test-SodaEndpointAcl $owner $rules 'S-1-5-18' $first)){throw 'unsafe ACL'}
       if($item -is [IO.FileInfo]){$item=$item.Directory}else{$item=$item.Parent};$first=$false
      }
     }
     $clear=New-Object byte[] 0
    }
   }
   if($clear.Length -gt 65536 -or -not [SodaDesktopSigninVault]::SystemPrimary()){throw 'output unavailable'}
   Write-Record @{seq=$seq;data=[Convert]::ToBase64String($clear)}
  } finally {if($null -ne $bytes){[Array]::Clear($bytes,0,$bytes.Length);$bytes=$null};if($null -ne $clear){[Array]::Clear($clear,0,$clear.Length);$clear=$null};$request=$null}
 }
} catch {if($ReadonlySource){[Console]::Error.WriteLine('Signin readonly source is unavailable')}else{[Console]::Error.WriteLine('Signin enrollment is unavailable')};exit 1}
finally {if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)};if($null -ne $deadline){$deadline.Dispose()}}
