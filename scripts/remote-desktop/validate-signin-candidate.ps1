param([switch]$NegativeControls)
$ErrorActionPreference='Stop'
# Generated facts and ABI layout only. No native host, desktop query or service.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsSigninCandidate.cs'),(Join-Path $PSScriptRoot 'WindowsSigninCandidateNative.cs'),(Join-Path $PSScriptRoot 'WindowsSigninCandidateChecks.cs')) -ReferencedAssemblies System.dll,System.Core.dll
[SodaDesktopSigninCandidateNative]::VerifyLayouts()
[SodaDesktopSigninCandidateChecks]::Run()
if ($NegativeControls) {
    $root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-candidate-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($root) | Out-Null
    $files=@('WindowsSigninCandidate.cs','WindowsSigninCandidateNative.cs','WindowsSigninCandidateChecks.cs')
    $original=@{};$originalBytes=@{}
    foreach ($name in $files) { $original[$name]=[IO.File]::ReadAllText((Join-Path $PSScriptRoot $name));$originalBytes[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$originalBytes[$name]) }
    $variants=@(
        @('state','WindowsSigninCandidate.cs','state!=1','state<0','Unsafe signin candidate accepted: WTS state 0'),
        @('token-error','WindowsSigninCandidate.cs','error==1008','error>=0','Unsafe signin candidate accepted: token query error 0'),
        @('token-close','WindowsSigninCandidate.cs','host.CloseToken(token);','{}','Token was leaked or desktop inspected'),
        @('console-after','WindowsSigninCandidate.cs','if(host.ConsoleSession()!=expectedSession || host.WorkerSession!=(int)expectedSession || !host.SystemWithTcb)','if(host.WorkerSession!=(int)expectedSession || !host.SystemWithTcb)','Unsafe signin candidate accepted: console switched during query'),
        @('enabled-privilege','WindowsSigninCandidateNative.cs','enabled=(attributes&2)!=0 && (attributes&4)==0;','enabled=true;','Disabled or removed target privilege accepted')
    )
    try {
        foreach ($variant in $variants) {
            $name=$variant[1];$before=$original[$name]
            if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne 1){throw 'Negative control source guard failed'}
            try {
                [IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]))
                $paths=($files|ForEach-Object { "'"+(Join-Path $root $_).Replace("'","''")+"'" }) -join ','
                $program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll;[SodaDesktopSigninCandidateChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1}"
                $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
                $output=& powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1
                $code=$LASTEXITCODE
                Write-Output ('negative '+$variant[0]);$output|ForEach-Object {Write-Output ([string]$_)}
                if($code -eq 0 -or -not (($output|Out-String).Contains($variant[4]))){throw 'Negative control did not fail its intended assertion'}
            } finally {
                [IO.File]::WriteAllBytes((Join-Path $root $name),$originalBytes[$name])
                if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($originalBytes[$name])){throw 'Negative control source restore failed'}
            }
        }
        $output=& powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1
        $code=$LASTEXITCODE
        $output|ForEach-Object {Write-Output ([string]$_)}
        if($code -ne 0 -or -not (($output|Out-String).Contains('desktop_signin_candidate_generated_passed'))){throw 'Restored source compilation or checks failed'}
        Write-Output 'desktop_signin_candidate_negative_controls_passed'
    } finally { [IO.Directory]::Delete($root,$true) }
}
