param([Parameter(Mandatory=$true)][int]$InspectPid)
$ErrorActionPreference='Stop';$env:PSModulePath=Join-Path $PSHOME 'Modules'
if($InspectPid -le 0){throw 'Positive process id required'}
Add-Type -ReferencedAssemblies System.dll,System.Core.dll -TypeDefinition @'
using System;using System.Text;using System.Runtime.InteropServices;using System.Collections.Generic;
public static class SodaBootTokenProbe {
 [DllImport("kernel32.dll")]static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")]static extern IntPtr GetCurrentThread();
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenThreadToken(IntPtr t,uint a,bool self,out IntPtr result);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool SetTokenInformation(IntPtr t,int c,IntPtr p,int n);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr p,uint a,out IntPtr t);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr t,int c,IntPtr b,int n,out int r);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthorityCount(IntPtr s);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthority(IntPtr s,uint i);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern bool LookupPrivilegeName(string s,IntPtr luid,StringBuilder name,ref int count);
 public sealed class Result {public int integrity,elevation,uiAccess,elevationType;public bool threadToken,admin;public string owner;public string[] privileges;}
 static IntPtr Read(IntPtr t,int c){int n;GetTokenInformation(t,c,IntPtr.Zero,0,out n);if(n<4||n>65536)throw new Exception("Token size");var p=Marshal.AllocHGlobal(n);if(!GetTokenInformation(t,c,p,n,out n)){Marshal.FreeHGlobal(p);throw new Exception("Token query");}return p;}
 public static void LowerIntegrity(){IntPtr token;if(!OpenProcessToken(GetCurrentProcess(),0x88,out token))throw new Exception("Adjust token open");try{var sid=new System.Security.Principal.SecurityIdentifier("S-1-16-8192");var bytes=new byte[sid.BinaryLength];sid.GetBinaryForm(bytes,0);int head=IntPtr.Size==8?16:8;var p=Marshal.AllocHGlobal(head+bytes.Length);try{for(int i=0;i<head+bytes.Length;i++)Marshal.WriteByte(p,i,0);var sp=IntPtr.Add(p,head);Marshal.Copy(bytes,0,sp,bytes.Length);Marshal.WriteIntPtr(p,sp);Marshal.WriteInt32(p,IntPtr.Size,0x20);if(!SetTokenInformation(token,25,p,head+bytes.Length))throw new Exception("Integrity lowering failed: "+Marshal.GetLastWin32Error());}finally{Marshal.FreeHGlobal(p);}}finally{CloseHandle(token);}}
 public static Result Get(int pid=0){IntPtr process=pid==0?GetCurrentProcess():OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)throw new Exception("Process query");IntPtr token;if(!OpenProcessToken(process,10,out token)){if(pid!=0)CloseHandle(process);throw new Exception("Token open");}try{
 var result=new Result();using(var identity=new System.Security.Principal.WindowsIdentity(token)){result.owner=identity.User.Value;result.admin=new System.Security.Principal.WindowsPrincipal(identity).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);}IntPtr thread;result.threadToken=OpenThreadToken(GetCurrentThread(),8,true,out thread);if(result.threadToken)CloseHandle(thread);else if(Marshal.GetLastWin32Error()!=1008)throw new Exception("Thread token query");var p=Read(token,25);try{var sid=Marshal.ReadIntPtr(p);int count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));if(count<1)throw new Exception("Integrity SID");result.integrity=Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));}finally{Marshal.FreeHGlobal(p);}
 p=Read(token,20);try{result.elevation=Marshal.ReadInt32(p);}finally{Marshal.FreeHGlobal(p);}
 p=Read(token,26);try{result.uiAccess=Marshal.ReadInt32(p);}finally{Marshal.FreeHGlobal(p);}
 p=Read(token,18);try{result.elevationType=Marshal.ReadInt32(p);}finally{Marshal.FreeHGlobal(p);}
 var values=new List<string>();p=Read(token,3);try{int count=Marshal.ReadInt32(p);if(count<0||count>128)throw new Exception("Privilege count");for(int i=0;i<count;i++){int n=256;var name=new StringBuilder(n);if(!LookupPrivilegeName(null,IntPtr.Add(p,4+i*12),name,ref n))throw new Exception("Privilege name");values.Add(name.ToString());}}finally{Marshal.FreeHGlobal(p);}result.privileges=values.ToArray();return result;
 }finally{CloseHandle(token);if(pid!=0)CloseHandle(process);}}
}
'@

$process=Get-Process -Id $InspectPid -ErrorAction Stop
$token=[SodaBootTokenProbe]::Get($InspectPid)
$danger=@('SeDebugPrivilege','SeTcbPrivilege','SeImpersonatePrivilege','SeAssignPrimaryTokenPrivilege','SeCreateTokenPrivilege','SeBackupPrivilege','SeRestorePrivilege','SeTakeOwnershipPrivilege','SeLoadDriverPrivilege','SeRelabelPrivilege','SeSecurityPrivilege','SeTrustedCredManAccessPrivilege','SeEnableDelegationPrivilege')
if($token.admin -or $token.owner -ne 'S-1-5-21-2255109513-3773794534-3440117263-1001' -or $token.integrity -ne 8192 -or $token.uiAccess -ne 0 -or $token.threadToken -or $process.SessionId -le 0 -or @($token.privileges|Where-Object {$_ -in $danger}).Count -ne 0){throw 'Nonadmin interactive server required'}
@{token=$token;pid=$InspectPid;sessionId=$process.SessionId;createdFiletime=$process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}|ConvertTo-Json -Depth 5 -Compress
