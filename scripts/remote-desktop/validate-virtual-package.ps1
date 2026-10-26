$ErrorActionPreference='Stop'
# AST and unsigned-package rejection only. No admin registration, driver creation,
# certificate trust changes, service operations, capture, input, or clipboard.
$installer=Join-Path $PSScriptRoot 'install-virtual-display-driver.ps1'
$tokens=$null;$errors=$null
$null=[System.Management.Automation.Language.Parser]::ParseFile($installer,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Driver package installer syntax failed.'}
$folder=Join-Path ([IO.Path]::GetTempPath()) ('soda-virtual-package-check-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $folder
try{
    foreach($name in @('SodaVirtualDisplay.inf','SodaVirtualDisplay.dll','SodaVirtualDisplay.cat')){[IO.File]::WriteAllText((Join-Path $folder $name),'generated unsigned fixture')}
    $rejected=$false
    try{& $installer -PackagePath $folder -ValidateOnly}catch{if($_.Exception.Message -notlike 'A valid signed catalog is required.*'){throw};$rejected=$true}
    if(-not $rejected){throw 'Unsigned package was accepted.'}
    $rejected=$false
    try{& $installer -PackagePath '.' -Inspect}catch{if($_.Exception.Message -notlike 'Use an absolute path*'){throw};$rejected=$true}
    if(-not $rejected){throw 'Relative package path was accepted.'}
    $link=Join-Path $folder 'junction'
    $actual=Join-Path $folder 'actual';$null=New-Item -ItemType Directory -Path $actual
    $package=Join-Path $actual 'package';$null=New-Item -ItemType Directory -Path $package
    $null=New-Item -ItemType Junction -Path $link -Target $actual
    try{
        $rejected=$false
        try{& $installer -PackagePath (Join-Path $link 'package') -Inspect}catch{if($_.Exception.Message -ne 'Reparse points are not accepted.'){throw};$rejected=$true}
        if(-not $rejected){throw 'Ancestor junction was accepted.'}
    }finally{[IO.Directory]::Delete($link)}
    if(-not (Test-Path -LiteralPath $package)){throw 'Junction cleanup removed its target.'}
    Write-Output 'virtual_package_checks_passed: installer AST, actual unsigned catalog rejection, local absolute-path/ancestor junction guards; no installation or trust changes'
}finally{Remove-Item -LiteralPath $folder -Recurse -Force}
