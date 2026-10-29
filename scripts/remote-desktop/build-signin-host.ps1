param([switch]$ValidateOnly,[string]$OutputDirectory,[Parameter(Mandatory=$true)][string]$OwnerSid)
$ErrorActionPreference='Stop'
# Explicit compile only. No SCM, ACL repair, Program Files write or execution.
if(-not [Environment]::Is64BitProcess){throw 'Use 64-bit Windows PowerShell'}
$sid=[Security.Principal.SecurityIdentifier]::new($OwnerSid)
if($sid.Value -cne $OwnerSid -or $OwnerSid -in @('S-1-5-18','S-1-5-19','S-1-5-20') -or $OwnerSid -notmatch '\AS-[0-9-]+\z'){throw 'Specify a canonical non-system owner SID'}
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunAdmission.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninRunStorage.cs','WindowsSigninRunSession.cs','WindowsSigninHost.cs','WindowsSigninProcess.cs')
$combined=($names|ForEach-Object {[IO.File]::ReadAllText((Join-Path $PSScriptRoot $_))}) -join "`n"
if(([regex]::Matches($combined,'__SIGNIN_OWNER_SID__')).Count -ne 1){throw 'Compile owner marker changed'}
$combined=$combined.Replace('__SIGNIN_OWNER_SID__',$OwnerSid)
$usings=[regex]::Matches($combined,'(?m)^using [^;]+;')|ForEach-Object {$_.Value}|Select-Object -Unique
$combined=($usings -join "`n")+"`n"+[regex]::Replace($combined,'(?m)^using [^;]+;','')
$parameters=[CodeDom.Compiler.CompilerParameters]::new()
$parameters.CompilerOptions='/platform:x64 /main:SodaDesktopSigninHost'
$parameters.ReferencedAssemblies.AddRange([string[]]@('System.dll','System.Core.dll','System.Security.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'))
if($ValidateOnly){
    if($OutputDirectory){throw 'ValidateOnly does not emit an executable'}
    $parameters.CompilerOptions='/platform:x64'
    Add-Type -TypeDefinition $combined -CompilerParameters $parameters
    'signin_host_compiled_no_execution';exit 0
}
if(-not $OutputDirectory -or -not [IO.Path]::IsPathRooted($OutputDirectory) -or -not [IO.Directory]::Exists($OutputDirectory)){throw 'Specify an existing absolute output directory'}
$output=Join-Path $OutputDirectory 'DesktopSigninService.exe'
if(Test-Path -LiteralPath $output){throw 'Refusing to overwrite an existing service executable'}
# The staging directory is explicitly provided by the administrator/builder;
# the later installer must verify/secure the whole package independently.
$parameters.GenerateExecutable=$true;$parameters.OutputAssembly=$output
$compiler=[Microsoft.CSharp.CSharpCodeProvider]::new()
try {
    $result=$compiler.CompileAssemblyFromSource($parameters,[string[]]@($combined))
    if($result.Errors.HasErrors){throw ('Signin host compilation failed: '+($result.Errors|Out-String))}
} finally {$compiler.Dispose()}
'signin_host_compiled_staging_only'
