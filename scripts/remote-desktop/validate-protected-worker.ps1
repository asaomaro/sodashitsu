$ErrorActionPreference='Stop'
# Compile the installed image's sources. Invoke generated/pure checks only.
$files=@('WindowsProtectedEpoch.cs','WindowsProtectedScope.cs','WindowsProtectedScopeNative.cs','WindowsProtectedHandshake.cs','WindowsProtectedWorker.cs','WindowsDesktopUnlock.cs','WindowsDesktopHost.cs','WindowsProtectedScopeChecks.cs','WindowsProtectedHandshakeChecks.cs')
Add-Type -Path @($files | ForEach-Object { Join-Path $PSScriptRoot $_ }) -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll,System.Drawing.dll,System.Windows.Forms.dll,System.ServiceProcess.dll
[SodaDesktopUnlock]::VerifyLeasePurposes()
[SodaDesktopUnlock]::VerifyProtectedPurposes()
[SodaDesktopUnlock]::VerifyWorkerCleanup()
[SodaDesktopHost]::VerifySharedProtectedProof()
[SodaDesktopProtectedScopeChecks]::Run()
[SodaDesktopProtectedHandshakeChecks]::Run()
[SodaDesktopProtectedScopeNative]::VerifyLayouts()
$nonce=[guid]::NewGuid()
$wire=[SodaDesktopProtectedWorker]::Create(4,'elevated-default','S-1-5-21-1-2-3-1001','S-1-5-5-1-2',1,1,$nonce,11,638000000000000001,12,638000000000000002)
$scope=[SodaDesktopProtectedScope]::Decode($wire)
if (-not $scope.MatchesPeer([SodaDesktopProtectedScope+Mode]::ElevatedDefault,$nonce,'S-1-5-21-1-2-3-1001',1,11,638000000000000001,12,638000000000000002)) { throw 'Worker factory scope mismatch' }
$rejected=$false
try { [SodaDesktopProtectedWorker]::Create(1,'elevated-uac','S-1-5-21-1-2-3-1001','S-1-5-5-1-2',1,1,$nonce,11,638000000000000001,12,638000000000000002) | Out-Null } catch { $rejected=$true }
if (-not $rejected) { throw 'Unlock-only lease created elevated worker scope' }
$rejected=$false
try { [SodaDesktopProtectedWorker]::Create(4,'arbitrary-desktop','S-1-5-21-1-2-3-1001','S-1-5-5-1-2',1,1,$nonce,11,638000000000000001,12,638000000000000002) | Out-Null } catch { $rejected=$true }
if (-not $rejected) { throw 'Arbitrary desktop role accepted' }
Write-Output 'protected_worker_factory_passed: generated scope only; no service, worker spawn, token/desktop APIs, capture or input'
