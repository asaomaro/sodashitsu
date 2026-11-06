$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$targetPid=18040;$owner='S-1-5-21-2255109513-3773794534-3440117263-1001'
if($env:COMPUTERNAME -ne 'OSK2-024680-2' -or ([Security.Principal.WindowsIdentity]::GetCurrent()).User.Value -ne $owner -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0){throw 'Expected maintenance caller required'}
$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$targetPid)
if($null -eq $p -or $p.Name -ne 'node.exe' -or $p.SessionId -ne 1 -or [string]$p.CommandLine -notmatch '(?i)sodashitsu[\\/]+packages[\\/]+server[\\/]+dist[\\/]+main\.js'){throw 'Expected normal server required'}
$token=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid;if($token.ReturnValue -ne 0 -or $token.Sid -ne $owner){throw 'Server owner differs'}
$listeners=@(Get-NetTCPConnection -LocalPort 7780 -State Listen -ErrorAction Stop);if(-not($listeners|Where-Object {$_.OwningProcess -eq $targetPid})){throw 'Normal server listener differs'}
$process=[Diagnostics.Process]::GetProcessById($targetPid);$created=$process.StartTime.ToUniversalTime().ToFileTimeUtc();$process.Dispose();if([string]$created -ne '134384363801563095'){throw 'Paused server instance differs'};$cimCreated=$p.CreationDate.ToUniversalTime().ToFileTimeUtc();if($created -lt $cimCreated -or ($created-$cimCreated) -gt 9){throw 'Server creation differs'}
$source=@'
using System;
using System.Runtime.InteropServices;
public static class SodaPauseOwnServer {
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out long created,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
 [DllImport("ntdll.dll")]static extern int NtSuspendProcess(IntPtr process);
 [DllImport("ntdll.dll")]static extern int NtResumeProcess(IntPtr process);
 public static void Apply(int pid,long expected,bool pause){
  IntPtr handle=OpenProcess(0x1800,false,pid);if(handle==IntPtr.Zero)throw new InvalidOperationException("Server handle unavailable");
  try{long created,exit,kernel,user;uint code;if(!GetProcessTimes(handle,out created,out exit,out kernel,out user)||created!=expected||!GetExitCodeProcess(handle,out code)||code!=259)throw new InvalidOperationException("Server instance changed");
   int status=pause?NtSuspendProcess(handle):NtResumeProcess(handle);if(status!=0)throw new InvalidOperationException("Server pause/resume refused");
  }finally{CloseHandle(handle);}
 }
}
'@
Add-Type -TypeDefinition $source
[SodaPauseOwnServer]::Apply($targetPid,$created,$false)
[pscustomobject]@{resumed=$true;pid=$targetPid;createdFileTime=[string]$created;session=1;port=7780;owner=$owner;action='NtResumeProcess';at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
