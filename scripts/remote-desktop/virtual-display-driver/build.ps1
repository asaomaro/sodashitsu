param([Parameter(Mandatory=$true)][string]$NuGetPath,[string]$MSBuildPath)
$ErrorActionPreference='Stop'
# Compile/package only. No installation, service change, certificate trust, or test signing.
$signature=Get-AuthenticodeSignature -LiteralPath $NuGetPath
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Use the Microsoft-signed NuGet command line tool.'}
if(-not $MSBuildPath){
    $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if(Test-Path -LiteralPath $vswhere){$MSBuildPath=@(& $vswhere -latest -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe')|Select-Object -First 1}
}
if(-not $MSBuildPath -or -not (Test-Path -LiteralPath $MSBuildPath)){throw 'MSBuild with C++/WDK support is required.'}
Push-Location -LiteralPath $PSScriptRoot
try {
    & $NuGetPath restore (Join-Path $PSScriptRoot 'packages.config') -PackagesDirectory (Join-Path $PSScriptRoot 'packages') -NonInteractive -Source 'https://api.nuget.org/v3/index.json'
    if($LASTEXITCODE -ne 0){throw 'Pinned WDK/SDK restore failed.'}
    & $MSBuildPath (Join-Path $PSScriptRoot 'SodaVirtualDisplay.vcxproj') /p:Configuration=Release /p:Platform=x64 /p:SignMode=Off /p:DriverSign=false /verbosity:minimal
    if($LASTEXITCODE -ne 0){throw 'Virtual display driver build failed.'}
    Write-Output 'virtual_display_driver_built_unsigned: not installed; production signing and live capture verification required'
}finally{Pop-Location}
