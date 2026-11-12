param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated data/clock/topology/input sinks only. No privileged entry point is run.
$files=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninProcessEvidence.cs','WindowsSigninScm.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninHost.cs','WindowsSigninAdminPipe.cs','WindowsSigninProcess.cs','WindowsSigninCandidate.cs','WindowsSigninCandidateNative.cs','WindowsSigninScope.cs','WindowsSigninScopeNative.cs','WindowsSigninWorkerNative.cs','WindowsSigninWorker.cs','WindowsSigninPresence.cs','WindowsSigninTarget.cs','WindowsSigninScopeChecks.cs','WindowsSigninDuplexChecks.cs','WindowsSigninWorkerGeneratedChecks.cs','WindowsSigninPresenceGeneratedChecks.cs','WindowsSigninNativeHost.cs','WindowsSigninNativeHostGeneratedChecks.cs')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-worker-checks-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$original=@{};$bytes=@{}
foreach($name in $files){$bytes[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));$original[$name]=[Text.Encoding]::UTF8.GetString($bytes[$name]);[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name])}
$shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$paths=($files|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
$program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($paths) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll,System.Drawing.dll,System.Windows.Forms.dll;[SodaDesktopSigninScopeChecks]::Run();[SodaDesktopSigninDuplexChecks]::Run();[SodaDesktopSigninWorker]::VerifyGeneratedData();[SodaDesktopSigninNativeHost]::VerifyGeneratedData()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
try {
    $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE;$output|ForEach-Object {Write-Output ([string]$_)}
    if($code -ne 0 -or -not (($output|Out-String).Contains('signin_worker_generated_data_and_abi_passed'))){throw 'Generated worker checks failed'}
    if($NegativeControls){
        $variants=@(
            @('duplex-pipe','WindowsSigninWorker.cs','name,PipeDirection.InOut,PipeOptions.Asynchronous,','name,PipeDirection.InOut,PipeOptions.None,','Signin pipe writes waited for incoming data'),
            @('presence-target-initial','WindowsSigninWorker.cs','return purpose==Purpose.Presence?null:read();','return read();','Presence enumerated physical target'),
            @('presence-target-read','WindowsSigninWorker.cs','if(purpose==Purpose.Presence)return nativeRead();','','Presence blocked on physical target'),
            @('pump-closed-writer','WindowsSigninWorker.cs','var writer=new StreamWriter(pipe,new UTF8Encoding(false),writeSize,true);action(reader,writer);','using(var writer=new StreamWriter(pipe,new UTF8Encoding(false),writeSize,true)){action(reader,writer);}','Pump reflushed a closed pipe'),
            @('pointer-event','WindowsSigninWorker.cs','Require(action=="move"||action=="down"||action=="up");','Require(true);','Invalid pointer event produced input'),
            @('pointer-button','WindowsSigninWorker.cs','Integer(value,"button",0,4)','Integer(value,"button",0,5)','Invalid pointer button produced input'),
            @('target','WindowsSigninTarget.cs','initial.Same(read())','read()!=null','Changed target was accepted'),
            @('rotation','WindowsSigninWorker.cs','.Append(mode.Orientation)','','Rotated primary was accepted'),
            @('unicode-pair','WindowsSigninWorker.cs','batch(new[]{key,up});','batch(new[]{key});','Unicode pair omitted matching keyup'),
            @('authentication-pair','WindowsSigninWorker.cs','return down&&(key==13','return !down&&(key==13','Authentication key was not neutral at desktop transition'),
            @('authentication-pair-count','WindowsSigninWorker.cs','Require(sent==2);','Require(sent>0);','Partial authentication pair accepted'),
            @('broker-utf8-output','WindowsSigninWorker.cs','new StreamWriter(stream,new UTF8Encoding(false),65536,true)','new StreamWriter(stream,new ASCIIEncoding(),65536,true)','Broker UTF8 output changed'),
            @('broker-utf8-input','WindowsSigninWorker.cs','new StreamReader(stream,new UTF8Encoding(false,true),false,16384,true)','new StreamReader(stream,new ASCIIEncoding(),false,16384,true)','Broker UTF8 input changed'),
            @('presence-commands','WindowsSigninPresence.cs','if(command=="heartbeat")return true;closed=true;return false;','return true;','Presence accepted a capture/input command'),
            @('presence-capture-route','WindowsSigninWorker.cs','if(purpose==Purpose.Presence)presence();else capture();','if(purpose==Purpose.Presence)capture();else capture();','Presence dispatched capture'),
            @('presence-cleanup-route','WindowsSigninWorker.cs','if(purpose!=Purpose.Presence)release();','release();','Presence dispatched input cleanup'),
            @('presence-command-route','WindowsSigninWorker.cs','Require(presence.Command(type));','presence.Command(type);','Presence route accepted active command'),
            @('inactive-classification','WindowsSigninScopeNative.cs','if(!candidate)throw new SodaDesktopSigninInactiveException();','if(!candidate)return;','Inactive candidate was not classified'),
            @('inactive-auth-wait','WindowsSigninWorker.cs','string line=receive();','string line=null;','Inactive worker exited before broker authentication'),
            @('inactive-viewer-denial','WindowsSigninWorker.cs','publish(purpose==Purpose.Presence?"signin_inactive":"signin_unavailable");','publish("signin_inactive");','Viewer inactive promoted to presence'),
            @('inactive-publication','WindowsSigninWorker.cs','publish(purpose==Purpose.Presence?"signin_inactive":"signin_unavailable");','{}','Inactive result not published before wait')
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
        'signin_worker_source_negative_controls_and_restore_passed'
    }
}finally{[IO.Directory]::Delete($root,$true)}
exit 0
