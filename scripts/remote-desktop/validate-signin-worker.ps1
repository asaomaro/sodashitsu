param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated data/clock/topology/input sinks only. No privileged entry point is run.
$files=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninHost.cs','WindowsSigninProcess.cs','WindowsProtectedEpoch.cs','WindowsSigninCandidate.cs','WindowsSigninCandidateNative.cs','WindowsSigninScope.cs','WindowsSigninScopeNative.cs','WindowsSigninWorkerNative.cs','WindowsSigninWorker.cs','WindowsSigninTarget.cs','WindowsSigninScopeChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-worker-checks-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};$bytes=@{}
foreach($name in $files){$bytes[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));$original[$name]=[Text.Encoding]::UTF8.GetString($bytes[$name]);[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$paths=($files|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll,System.Drawing.dll,System.Windows.Forms.dll;[SodaDesktopSigninScopeChecks]::Run();[SodaDesktopSigninWorker]::VerifyGeneratedData()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try {
    $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object {Write-Output ([string]$_)}
    if($code -ne 0 -or -not (($output|Out-String).Contains('signin_worker_generated_data_and_abi_passed'))){throw 'Generated worker checks failed'}
    if($NegativeControls){
        $variants=@(
            @('control-reentry','WindowsSigninScope.cs','CurrentCore(read)||ended||revision!=controlRevision','CurrentCore(read)||ended','Reentrant release was overwritten'),
            @('frame-serial','WindowsSigninScope.cs','frame.Serial!=serial||','','Replaced frame ticket published'),
            @('frame-age','WindowsSigninScope.cs','||at-frame.At>=1500','','Stale frame published'),
            @('drawn-frame','WindowsSigninScope.cs','sequence!=published||','','Acknowledgement before publication accepted'),
            @('epoch','WindowsSigninScope.cs','||epoch>=0&&epoch!=facts.Epoch','','Changed signin facts published: epoch'),
            @('input-permit-age','WindowsSigninScope.cs','now-at<1500','now-at<15000','Signin text continued past input freshness'),
            @('pointer-event','WindowsSigninWorker.cs','Require(action=="move"||action=="down"||action=="up");','Require(true);','Invalid pointer event produced input'),
            @('pointer-button','WindowsSigninWorker.cs','Integer(value,"button",0,4)','Integer(value,"button",0,5)','Invalid pointer button produced input'),
            @('target','WindowsSigninTarget.cs','initial.Same(read())','read()!=null','Changed target was accepted'),
            @('rotation','WindowsSigninWorker.cs','.Append(mode.Orientation)','','Rotated primary was accepted'),
            @('unicode-cleanup','WindowsSigninWorker.cs','cleanup(key);','{}','Unicode keyup cleanup was omitted'),
            @('broker-utf8-output','WindowsSigninWorker.cs','new StreamWriter(stream,new UTF8Encoding(false),65536,true)','new StreamWriter(stream,new ASCIIEncoding(),65536,true)','Broker UTF8 output changed'),
            @('broker-utf8-input','WindowsSigninWorker.cs','new StreamReader(stream,new UTF8Encoding(false,true),false,16384,true)','new StreamReader(stream,new ASCIIEncoding(),false,16384,true)','Broker UTF8 input changed')
        )
        foreach($variant in $variants){
            $name=$variant[1];$before=$original[$name]
            if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
            try{
                [IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]))
                $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
                'negative '+$variant[0];$output|ForEach-Object {Write-Output ([string]$_)}
                if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
            }finally{
                [IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name]);if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($bytes[$name])){throw 'Source bytes not restored'}
            }
        }
        $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object {Write-Output ([string]$_)}
        if($code -ne 0){throw 'Restored worker checks failed'}
        'signin_worker_13_source_negative_controls_and_restore_passed'
    }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
