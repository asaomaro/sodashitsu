param([string]$PreparationScript = (Join-Path $PSScriptRoot 'prepare-desktop-helper.ps1'))
$ErrorActionPreference = 'Stop'
$before = (Get-FileHash -LiteralPath $PreparationScript -Algorithm SHA256).Hash
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($PreparationScript,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Preparation script did not parse.' }
$calls = @($ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and
    $node.Expression.Extent.Text -ceq '[IO.File]' -and $node.Member.Value -ceq 'Replace'
},$true))
if ($calls.Count -ne 1) { throw 'Expected exactly one public image replacement call.' }
$branch = $calls[0].Parent
while ($branch -and $branch -isnot [System.Management.Automation.Language.IfStatementAst]) { $branch = $branch.Parent }
if (-not $branch) { throw 'Public image replacement call has no existing-image branch.' }
# Execute the public branch verbatim, with only its filesystem inputs redirected.
# No preparation, compilation, Scheduler, service, or installed-image operations run.
$replace = [scriptblock]::Create($branch.Extent.Text)
$root = Join-Path ([IO.Path]::GetTempPath()) ('soda-runtime-replace-' + [Guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $stage = Join-Path $root 'stage'
    New-Item -ItemType Directory -Path $stage | Out-Null
    $destination = Join-Path $root 'installed'
    New-Item -ItemType Directory -Path $destination | Out-Null
    $executable = Join-Path $destination 'DesktopUnlock.exe'
    $temp = Join-Path $stage 'DesktopUnlock.exe'
    $old = [byte[]]@(1,2,3,4)
    $new = [byte[]]@(5,6,7,8,9)
    [IO.File]::WriteAllBytes($executable,$old)
    [IO.File]::WriteAllBytes($temp,$new)
    $acl = (Get-Acl -LiteralPath $executable).Sddl
    & $replace
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($executable)) -cne [Convert]::ToBase64String($new)) { throw 'Replacement bytes differ.' }
    if (Test-Path -LiteralPath $temp) { throw 'Replacement source was not consumed.' }
    if ((Get-Acl -LiteralPath $executable).Sddl -cne $acl) { throw 'Destination ACL changed.' }
    if (@(Get-ChildItem -LiteralPath $destination -Force).Count -ne 1) { throw 'Unexpected replacement backup output.' }
    if ((Get-FileHash -LiteralPath $PreparationScript -Algorithm SHA256).Hash -cne $before) { throw 'Preparation source changed during validation.' }
    Write-Output 'runtime_helper_existing_image_replace_passed'
} finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
