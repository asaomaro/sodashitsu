param(
    [Parameter(Mandatory=$true)][string]$PackagePath,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
    [Parameter(Mandatory=$true)][string]$SignToolPath
)
$ErrorActionPreference='Stop'
# Read/verify/package only. No install, device creation, signing, or trust changes.
$installer=Join-Path (Split-Path -Parent $PSScriptRoot) 'install-virtual-display-driver.ps1'
$inspection=(& $installer -PackagePath $PackagePath -Inspect)|ConvertFrom-Json
$tool=Get-AuthenticodeSignature -LiteralPath $SignToolPath
if($tool.Status -ne 'Valid' -or $tool.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Use the Microsoft-signed Windows SDK SignTool.'}
# UMDF is user mode: use Authenticode policy and explicit catalog membership.
# The installer's later pnputil stage is still the final Windows PnP acceptance.
foreach($name in @('SodaVirtualDisplay.inf','SodaVirtualDisplay.dll')){
    & $SignToolPath verify /pa /v /c (Join-Path $PackagePath 'SodaVirtualDisplay.cat') (Join-Path $PackagePath $name)
    if($LASTEXITCODE -ne 0){throw 'Signed catalog membership verification failed.'}
}
if($OutputPath -notmatch '^[A-Za-z]:\\' -or $OutputPath.Contains("`0")){throw 'Use an absolute local output directory.'}
$destination=[IO.Path]::GetFullPath($OutputPath)
$current=[IO.Path]::GetPathRoot($destination)
foreach($part in @('')+$destination.Substring($current.Length).Split([char[]]'\',[StringSplitOptions]::RemoveEmptyEntries)){
    if($part){$current=[IO.Path]::Combine($current,$part)}
    if((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse points are not accepted.'}
}
if((New-Object IO.DriveInfo([IO.Path]::GetPathRoot($destination))).DriveType -ne [IO.DriveType]::Fixed){throw 'Use a fixed local output drive.'}
if(Test-Path -LiteralPath $destination){throw 'Release output must be a new directory.'}
$null=New-Item -ItemType Directory -Path $destination
$utf8=New-Object Text.UTF8Encoding($false)
# Preserve the exact inspected manifest bytes: the review hash covers no BOM/newline.
$manifest=Join-Path $destination 'manifest.json'
[IO.File]::WriteAllText($manifest,$inspection.manifest,$utf8)
foreach($name in @('SodaVirtualDisplay.inf','SodaVirtualDisplay.dll','SodaVirtualDisplay.cat')){Copy-Item -LiteralPath (Join-Path $PackagePath $name) -Destination (Join-Path $destination $name)}
& $installer -PackagePath $destination -ManifestPath $manifest -ExpectedManifestSha256 $inspection.manifestSha256 -SignerSha256 $inspection.signerSha256 -ValidateOnly
if(-not $?){throw 'Release validation failed.'}
$review=[ordered]@{version=1;sourceCommit=$SourceCommit;state='signed-package-verified-not-installed';manifestSha256=$inspection.manifestSha256;signerCertificateSha256=$inspection.signerSha256;catalogMembershipVerified=$true;windowsPnpAcceptance='not-tested';headlessCapture='not-tested'}
[IO.File]::WriteAllText((Join-Path $destination 'review.json'),($review|ConvertTo-Json),$utf8)
$review|ConvertTo-Json
