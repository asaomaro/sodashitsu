param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$files=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninHost.cs','WindowsSigninProcess.cs','WindowsSigninHostChecks.cs')
$owner='S-1-5-21-1-2-3-1001'
$combined=($files|ForEach-Object {[IO.File]::ReadAllText((Join-Path $PSScriptRoot $_))}) -join "`n"
$combined=$combined.Replace('__SIGNIN_OWNER_SID__',$owner)
$usings=[regex]::Matches($combined,'(?m)^using [^;]+;')|ForEach-Object {$_.Value}|Select-Object -Unique
$combined=($usings -join "`n")+"`n"+[regex]::Replace($combined,'(?m)^using [^;]+;','')
$refs=[string[]]@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll','System.ServiceProcess.dll')
$parameters=[CodeDom.Compiler.CompilerParameters]::new();$parameters.CompilerOptions='/platform:x64';$parameters.ReferencedAssemblies.AddRange($refs)
Add-Type -TypeDefinition $combined -CompilerParameters $parameters
if([SodaDesktopSigninVault]::SystemPrimary()){throw 'Generated host tests require an ordinary account'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-host-checks-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$before=[Environment]::GetEnvironmentVariable('SODA_SIGNIN_HOST_SECRET')
$beforeOptions=[Environment]::GetEnvironmentVariable('NODE_OPTIONS')
try {
    [Environment]::SetEnvironmentVariable('SODA_SIGNIN_HOST_SECRET','generated-private-parent-marker')
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS','--trace-warnings')
    $exe=Join-Path $root 'GeneratedSigninChild.exe'
    $p=[CodeDom.Compiler.CompilerParameters]::new();$p.CompilerOptions='/platform:x64 /main:SodaDesktopSigninHostChecks';$p.GenerateExecutable=$true;$p.OutputAssembly=$exe;$p.ReferencedAssemblies.AddRange($refs)
    $compiler=[Microsoft.CSharp.CSharpCodeProvider]::new()
    try {$result=$compiler.CompileAssemblyFromSource($p,[string[]]@($combined));if($result.Errors.HasErrors){throw ($result.Errors|Out-String)}}finally{$compiler.Dispose()}
    $fixture=Join-Path $root 'fixture';[IO.Directory]::CreateDirectory($fixture)|Out-Null
    [SodaDesktopSigninHostChecks]::Run($exe,$fixture)
    $shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
    & $shell -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'build-signin-host.ps1') -ValidateOnly -OwnerSid $owner
    if($LASTEXITCODE -ne 0){throw 'Service compile-only validation failed'}
    $stage=Join-Path $root 'stage';[IO.Directory]::CreateDirectory($stage)|Out-Null
    & $shell -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'build-signin-host.ps1') -OutputDirectory $stage -OwnerSid $owner
    if($LASTEXITCODE -ne 0 -or -not [IO.File]::Exists((Join-Path $stage 'DesktopSigninService.exe'))){throw 'Service staging compilation failed'}
    if($NegativeControls) {
        $variants=@(
            @('graceful-force','if(stopped)return graceful;','if(stopped)return graceful||stopped;','Forced child was misclassified as clean'),
            @('graceful-frame','Encoding.ASCII.GetBytes("signin_stop\n")','Encoding.ASCII.GetBytes("signin_st0p\n")','Cooperative child did not finish cleanly'),
            @('graceful-exit','code!=0||!QueryInformationJobObject(job,1,out data','code==259||!QueryInformationJobObject(job,1,out data','Graceful completion ignored nonzero child exit'),
            @('graceful-descendants','if(data.Active==0){if(timer.ElapsedMilliseconds>=milliseconds)return false;stopped=true;graceful=true;return true;}','if(data.Active<=2){if(timer.ElapsedMilliseconds>=milliseconds)return false;stopped=true;graceful=true;return true;}','Graceful completion ignored live descendant'),
            @('quiescence-marker','if(stream.ReadByte()!=83||stream.ReadByte()!=-1)throw Failure();','if(stream.ReadByte()==-2)throw Failure();','Invalid quiescence marker accepted'),
            @('quiescence-write-share','OpenSharedCore(path,directory,package,maximum,1,policy,afterOpen)','OpenSharedCore(path,directory,package,maximum,3,policy,afterOpen)','Live quiescence lease allowed writes'),
            @('finite-exit-code','&&code==0;','&&code!=259;','Finite child exit code was ignored'),
            @('private-runtime','if(ace.AccessMask!=0)return false;','','Foreign runtime read accepted'),
            @('parent-environment','EnvironmentBlock=block.Append(''\0'').ToString();','block.Append("SODA_SIGNIN_HOST_SECRET=generated-private-parent-marker\0");EnvironmentBlock=block.Append(''\0'').ToString();','Parent environment retained'),
            @('post-create-revocation','Require(current());Require(ResumeThread(process.Thread)==1);','Require(true);Require(ResumeThread(process.Thread)==1);','Post-create revocation accepted'),
            @('handle-inheritance','Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(3*IntPtr.Size),IntPtr.Zero,IntPtr.Zero));','Require(true);','Unexpected handle inherited'),
            @('job-membership','return owned;','return false;','Grandchild not owned by job'),
            @('job-accounting','return data.Active;','return data.Active+1;','Cooperative child did not finish cleanly')
        )
        $shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
        foreach($variant in $variants){
            if(([regex]::Matches($combined,[regex]::Escape($variant[1]))).Count -ne 1){throw ('Negative guard changed: '+$variant[0])}
            $mutant=Join-Path $root 'mutant.cs';$originalBytes=[Text.UTF8Encoding]::new($false).GetBytes($combined)
            try {
            [IO.File]::WriteAllText($mutant,$combined.Replace($variant[1],$variant[2]))
            $mutantFixture=Join-Path $root ('negative-'+$variant[0]);[IO.Directory]::CreateDirectory($mutantFixture)|Out-Null
            $literal={param($s) "'"+$s.Replace("'","''")+"'"}
            $program="`$ErrorActionPreference='Stop';try{Add-Type -Path $(& $literal $mutant) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll,System.ServiceProcess.dll;[SodaDesktopSigninHostChecks]::Run($(& $literal $exe),$(& $literal $mutantFixture))}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
            $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
            $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1;$code=$LASTEXITCODE
            'negative '+$variant[0];$output|ForEach-Object {Write-Output ([string]$_)}
            if($code -ne 1 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[3]))){throw ('Negative did not fail intended assertion: '+$variant[0])}
            } finally {
                [IO.File]::WriteAllBytes($mutant,$originalBytes)
                if([Convert]::ToBase64String([IO.File]::ReadAllBytes($mutant)) -cne [Convert]::ToBase64String($originalBytes)){throw 'Restoration failed'}
            }
        }
        [SodaDesktopSigninHostChecks]::Run($exe,$fixture)
        'signin_host_source_negatives_and_restore_passed'
    }
} finally {
    [Environment]::SetEnvironmentVariable('SODA_SIGNIN_HOST_SECRET',$before)
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS',$beforeOptions)
    [IO.Directory]::Delete($root,$true)
}
exit 0
