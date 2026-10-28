param([switch]$NegativeControls)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Generated data/ACL/facts and ordinary-account refusal only. No installed root,
# service, real account lookup, real key, desktop or input is accessed.
$files=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninPackageChecks.cs')
$paths=@($files|ForEach-Object {Join-Path $PSScriptRoot $_})
$refs=@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll')
Add-Type -Path $paths -ReferencedAssemblies $refs
if([SodaDesktopSigninVault]::SystemPrimary()){throw 'Generated native fixtures require an ordinary account'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('soda-signin-package-checks-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$variable='SODA_SIGNIN_PACKAGE_TEST_ROOT';$previous=[Environment]::GetEnvironmentVariable($variable)
try {
    [Environment]::SetEnvironmentVariable($variable,(Join-Path $root 'native-fixtures'))
    [SodaDesktopSigninPackageChecks]::Run()
    $fixture=Join-Path $root 'generated-manifest.json'
    & node.exe (Join-Path $PSScriptRoot 'validate-signin-package.mjs') --fixture $fixture
    if($LASTEXITCODE -ne 0){throw 'Generated staging validation failed'}
    [SodaDesktopSigninPackageChecks]::CrossManifest([IO.File]::ReadAllText($fixture))
    if(-not [SodaDesktopSigninVault]::SystemPrimary()) {
        $refused=$false
        try {$lease=[SodaDesktopSigninPackageNative]::Verify('S-1-5-21-1-2-3-1001');if($null -ne $lease){$lease.Dispose()}}
        catch {if($_.Exception.InnerException.Message -ne 'Signin package is unavailable'){throw};$refused=$true}
        if(-not $refused){throw 'Non-SYSTEM package verifier accepted'}
        'signin_package_non_system_refused'
    } else {'signin_package_non_system_check_skipped_system_runner'}
    if($NegativeControls) {
        $original=@{};$bytes=@{}
        foreach($name in $files){$original[$name]=[IO.File]::ReadAllText((Join-Path $PSScriptRoot $name));$bytes[$name]=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name));[IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name])}
        $variants=@(
            @('owner','WindowsSigninPackage.cs','data.ownerSid!=OwnerSid(expectedOwner)','false','Unsafe package data accepted'),
            @('canonical','WindowsSigninPackage.cs','if(result.Encode()!=text)throw Failure();','if(false)throw Failure();','Unsafe package data accepted'),
            @('closed-paths','WindowsSigninPackage.cs','entry.Path!=Paths[i]','false','Unsafe package data accepted'),
            @('file-size','WindowsSigninPackage.cs','entry.Bytes>MaximumBytes(entry.Path)','false','Unsafe package data accepted'),
            @('total-size','WindowsSigninPackage.cs','if(total>335544320)','if(false)','Unsafe package data accepted'),
            @('acl-owner','WindowsSigninPackage.cs','if(!ownerTrusted||','if(false||','Foreign code owner accepted'),
            @('acl-write','WindowsSigninPackage.cs','uint danger=packageObject?0x520D0156u:0x520D0150u;','uint danger=0;','Foreign code write accepted'),
            @('reparse','WindowsSigninPackageNative.cs','(Value.Attributes&1024)==0','true','Unsafe package file facts accepted'),
            @('links','WindowsSigninPackageNative.cs','Value.Links==1&&','true&&','Unsafe package file facts accepted'),
            @('file-id','WindowsSigninPackageNative.cs','Value.Volume==other.Value.Volume&&','','Changed package file accepted'),
            @('share-write','WindowsSigninPackageNative.cs','OpenSharedCore(path,directory,package,maximum,1,policy,afterOpen)','OpenSharedCore(path,directory,package,maximum,3,policy,afterOpen)','Package write share unexpectedly allowed'),
            @('share-delete','WindowsSigninPackageNative.cs','OpenSharedCore(path,directory,package,maximum,1,policy,afterOpen)','OpenSharedCore(path,directory,package,maximum,5,policy,afterOpen)','Package delete share unexpectedly allowed'),
            @('failure-cleanup','WindowsSigninPackageNative.cs','if(held!=null)held.Dispose();else if(handle!=null)handle.Dispose();','if(held==null&&handle!=null)handle.Dispose();','Native failure leaked a handle'),
            @('group-cleanup','WindowsSigninPackageNative.cs','for(int i=held.Count-1;i>=0;i--)','for(int i=held.Count-2;i>=0;i--)','Native failure leaked a handle')
        )
        $shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
        foreach($variant in $variants) {
            $name=$variant[1];$before=$original[$name]
            if(([regex]::Matches($before,[regex]::Escape($variant[2]))).Count -ne 1){throw 'Negative source guard failed'}
            try {
                [IO.File]::WriteAllText((Join-Path $root $name),$before.Replace($variant[2],$variant[3]))
                $copies=($files|ForEach-Object {"'"+(Join-Path $root $_).Replace("'","''")+"'"}) -join ','
                $program="`$ErrorActionPreference='Stop';try{Add-Type -Path @($copies) -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll;[SodaDesktopSigninPackageChecks]::Run()}catch{[Console]::Out.WriteLine(`$_.Exception.ToString());exit 1};exit 0"
                $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($program))
                $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1
                $code=$LASTEXITCODE
                'negative '+$variant[0];$output|ForEach-Object {Write-Output ([string]$_)}
                if($code -eq 0 -or -not (($output|Out-String).Contains('System.InvalidOperationException: '+$variant[4]))){throw 'Negative did not fail its intended assertion'}
            } finally {
                [IO.File]::WriteAllBytes((Join-Path $root $name),$bytes[$name])
                if([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $name))) -cne [Convert]::ToBase64String($bytes[$name])){throw 'Source bytes not restored'}
            }
        }
        $output=& $shell -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1
        $code=$LASTEXITCODE;$output|ForEach-Object {Write-Output ([string]$_)}
        if($code -ne 0 -or -not (($output|Out-String).Contains('signin_package_generated_manifest_acl_and_facts_passed'))){throw 'Restored checks failed'}
        'signin_package_native_negative_controls_passed'
    }
} finally {[Environment]::SetEnvironmentVariable($variable,$previous);[IO.Directory]::Delete($root,$true)}
exit 0
