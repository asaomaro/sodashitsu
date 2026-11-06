$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-acl-batch-'+[guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($root)
$good=Join-Path $root 'good.json';$bad=Join-Path $root 'unsafe.json'
[IO.File]::WriteAllText($good,'generated');[IO.File]::WriteAllText($bad,'generated')
$acl=[IO.File]::GetAccessControl($bad);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.AccessControlType]::Allow));[IO.File]::SetAccessControl($bad,$acl)
function Run-Check([string]$name,[string]$json,[bool]$expected) {
 $helper=Join-Path $PSScriptRoot 'check-endpoint-acl.ps1'
 $source="[Console]::OutputEncoding=[Text.Encoding]::UTF8;& '"+$helper.Replace("'","''")+"' -PathsBase64 '"+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))+"';exit `$LASTEXITCODE"
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($source))
 $start=[Diagnostics.ProcessStartInfo]::new((Join-Path $PSHOME 'powershell.exe'),('-NoLogo -NoProfile -NonInteractive -EncodedCommand '+$encoded));$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $p=[Diagnostics.Process]::Start($start)
 try{$out=$p.StandardOutput.ReadToEnd();$err=$p.StandardError.ReadToEnd();if(-not $p.WaitForExit(10000)){$p.Kill();throw 'Generated ACL check timed out'};$ok=$p.ExitCode -eq 0 -and $out.Trim() -ceq 'endpoint_acl_valid';if(($ok -ne $expected) -or ((-not $expected) -and $out.Trim().Length -ne 0)){throw ('Unexpected batch ACL result: '+$name)};'acl_batch '+$name+' passed'}finally{$p.Dispose()}
}
try {
 Run-Check 'one-safe' (ConvertTo-Json -InputObject @($good) -Compress) $true
 Run-Check 'all-safe' (ConvertTo-Json -InputObject @($root,$good) -Compress) $true
 Run-Check 'second-unsafe' (ConvertTo-Json -InputObject @($good,$bad) -Compress) $false
 Run-Check 'first-unsafe' (ConvertTo-Json -InputObject @($bad,$good) -Compress) $false
 Run-Check 'missing' (ConvertTo-Json -InputObject @($good,(Join-Path $root 'absent')) -Compress) $false
 foreach($badJson in @('[]','null','"C:\\Windows"','[null]','[["C:\\Windows"]]','[123]','["relative"]')){Run-Check 'invalid-shape' $badJson $false}
 Run-Check 'oversized' (ConvertTo-Json -InputObject @($good,$good,$good,$good,$good,$good,$good,$good,$good) -Compress) $false
 'endpoint_acl_batch_native_generated_passed'
}finally{[IO.Directory]::Delete($root,$true)}
