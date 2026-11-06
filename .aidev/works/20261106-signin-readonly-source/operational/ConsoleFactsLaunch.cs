using System;using System.IO;using System.Text;using System.Diagnostics;using System.Runtime.InteropServices;using System.Collections.Generic;
public static class SodaConsoleFactsLaunch { static int stage;const string FixtureRoot="__FIXTURE_ROOT__";
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct SI{internal int Size;internal string Reserved,Desktop,Title;internal uint X,Y,W,H,CX,CY,Fill,Flags;internal short Show,ReservedSize;internal IntPtr ReservedBytes,Input,Output,Error;}
 [StructLayout(LayoutKind.Sequential)]struct SX{internal SI Info;internal IntPtr Attributes;}
 [StructLayout(LayoutKind.Sequential)]struct PI{internal IntPtr Process,Thread;internal uint Pid,Tid;}
 [StructLayout(LayoutKind.Sequential)]struct Basic{internal long A,B;internal uint Flags;internal UIntPtr Min,Max;internal uint Active;internal UIntPtr Affinity;internal uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IO{internal ulong A,B,C,D,E,F;}
 [StructLayout(LayoutKind.Sequential)]struct Limits{internal Basic Basic;internal IO Io;internal UIntPtr A,B,C,D;}
 [StructLayout(LayoutKind.Sequential)]struct Accounting{internal long A,B,C,D;internal uint Faults,Total,Active,Terminated;}
 [StructLayout(LayoutKind.Sequential)]struct Privilege{internal uint Count,Low;internal int High;internal uint Flags;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting data,uint size,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool member);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool DuplicateTokenEx(IntPtr token,uint access,IntPtr sa,int level,int type,out IntPtr copy);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool SetTokenInformation(IntPtr token,int kind,ref int value,int size);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool LookupPrivilegeValueW(string system,string name,out long luid);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref Privilege privilege,uint size,IntPtr previous,IntPtr returned);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool CreateProcessAsUserW(IntPtr token,string application,StringBuilder command,IntPtr psa,IntPtr tsa,bool inherit,uint flags,IntPtr environment,string cwd,ref SX startup,out PI process);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr p,out ulong created,out ulong exited,out ulong kernel,out ulong user);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint GetProcessId(IntPtr p);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr p,uint ms);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr t,int kind,out uint value,uint size,out uint needed);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool QueryFullProcessImageNameW(IntPtr p,uint flags,StringBuilder value,ref uint size);
 static bool ParentCurrent(IntPtr p,int pid,string created){
  ulong at,exit,kernel,user;IntPtr token=IntPtr.Zero;
  try{if(p==IntPtr.Zero||GetProcessId(p)!=(uint)pid||WaitForSingleObject(p,0)!=258||!GetProcessTimes(p,out at,out exit,out kernel,out user)||DateTime.FromFileTimeUtc((long)at).Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture)!=created||!OpenProcessToken(p,8,out token))return false;
   uint length=32768;var image=new StringBuilder((int)length);if(!QueryFullProcessImageNameW(p,0,image,ref length)||!String.Equals(image.ToString(),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"OpenSSH\sshd.exe"),StringComparison.OrdinalIgnoreCase))return false;
   uint session,needed,type;if(!GetTokenInformation(token,12,out session,4,out needed)||needed!=4||session!=0||!GetTokenInformation(token,8,out type,4,out needed)||needed!=4||type!=1)return false;
   using(var identity=new System.Security.Principal.WindowsIdentity(token))if(!identity.IsSystem)return false;
   using(var query=new System.Management.ManagementObjectSearcher("SELECT ProcessId,State FROM Win32_Service WHERE Name='sshd'"))using(var rows=query.Get()){if(rows.Count!=1)return false;foreach(System.Management.ManagementObject row in rows)using(row){if(Convert.ToUInt32(row["ProcessId"])!=(uint)pid||(string)row["State"]!="Running")return false;}}
   return WaitForSingleObject(p,0)==258;
  }finally{if(token!=IntPtr.Zero)CloseHandle(token);}
 }
 static void Need(bool value){if(!value)throw new InvalidOperationException("Native session Job check failed at "+stage+": "+Marshal.GetLastWin32Error());}
 static uint Active(IntPtr job){Accounting data;Need(QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero));return data.Active;}
 static IntPtr Job(){IntPtr job=CreateJobObjectW(IntPtr.Zero,null);Need(job!=IntPtr.Zero);try{var limits=new Limits();limits.Basic.Flags=0x2000;Need(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits))));return job;}catch{CloseHandle(job);throw;}}
 static void Reap(IntPtr job){Need(TerminateJobObject(job,1));var timer=Stopwatch.StartNew();while(Active(job)!=0&&timer.ElapsedMilliseconds<8000)System.Threading.Thread.Sleep(10);if(Active(job)!=0)Environment.FailFast("Fixture aggregate exit unconfirmed");}
 static SodaDesktopSigninProcess.Child Child(IntPtr token,IntPtr parent,IntPtr aggregate,string application,string runtime,out int pid){
  pid=0;
  IntPtr job=Job(),environment=IntPtr.Zero;var process=new PI();bool transferred=false;
  try{using(var attributes=new SodaDesktopSigninWorkerNative.WorkerAttributes(parent,aggregate,job)){
   // Resume only the pinned readonly GUI facts fixture, never an installed worker.
   var plan=new SodaDesktopSigninHost.Plan(application,"--readonly-facts",Environment.GetFolderPath(Environment.SpecialFolder.System),runtime);
   environment=Marshal.StringToHGlobalUni(plan.EnvironmentBlock);var startup=new SX{Info=new SI{Size=Marshal.SizeOf(typeof(SX)),Desktop=@"WinSta0\Winlogon"},Attributes=attributes.List};
   Need(CreateProcessAsUserW(token,application,new StringBuilder("\""+application+"\" --readonly-facts"),IntPtr.Zero,IntPtr.Zero,false,0x80000|0x08000000|0x400|4,environment,plan.WorkingDirectory,ref startup,out process));
   bool member;Need(IsProcessInJob(process.Process,aggregate,out member)&&member&&IsProcessInJob(process.Process,job,out member)&&member);
   Need(ResumeThread(process.Thread)==1);var child=new SodaDesktopSigninProcess.Child(process.Process,job);pid=(int)process.Pid;transferred=true;return child;
  }}finally{if(!transferred){if(process.Process!=IntPtr.Zero){var child=new SodaDesktopSigninProcess.Child(process.Process,job);if(!child.Stop())Environment.FailFast("Fixture child exit unconfirmed");child.Dispose();}else CloseHandle(job);}if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(environment!=IntPtr.Zero)Marshal.FreeHGlobal(environment);}
 }
 public static object Run(int parentPid,string parentCreated){
  stage=0;const string owner="S-1-5-21-2255109513-3773794534-3440117263-1001";Need(SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0&&Environment.MachineName=="OSK2-024680-2");
  IntPtr token=IntPtr.Zero,copy=IntPtr.Zero,parent=IntPtr.Zero,aggregate=IntPtr.Zero;SodaDesktopSigninProcess.Child child=null;
  using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,"a84100a52c4b67c33580d8989d1c109605003f32c6a233cdbd892f8586f69aff"))try{
   stage=1;parent=OpenProcess(0x00101080,false,(uint)parentPid);Need(ParentCurrent(parent,parentPid,parentCreated));
   stage=2;using(var self=Process.GetCurrentProcess())Need(OpenProcessToken(self.Handle,0x12b,out token));
   long luid;Need(LookupPrivilegeValueW(null,"SeTcbPrivilege",out luid));var privilege=new Privilege{Count=1,Low=(uint)luid,High=(int)(luid>>32),Flags=2};Need(AdjustTokenPrivileges(token,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0);
   stage=3;Need(DuplicateTokenEx(token,0xf01ff,IntPtr.Zero,2,1,out copy));int session=(int)SodaDesktopSigninWorkerNative.WTSGetActiveConsoleSessionId();Need(session>0&&SetTokenInformation(copy,12,ref session,4));
   stage=4;aggregate=Job();string application=Path.Combine(FixtureRoot,"facts.exe");int pid;Need(ParentCurrent(parent,parentPid,parentCreated));child=Child(copy,parent,aggregate,application,FixtureRoot,out pid);
   stage=5;var timer=Stopwatch.StartNew();while(child.Running()&&timer.ElapsedMilliseconds<8000){Need(ParentCurrent(parent,parentPid,parentCreated)&&SodaDesktopSigninWorkerNative.WTSGetActiveConsoleSessionId()==(uint)session);System.Threading.Thread.Sleep(20);}
   Need(child.ExitedSuccessfully());Need(child.Stop()&&Active(aggregate)==0);return new{completed=true,jobZero=true,session};
  }finally{if(aggregate!=IntPtr.Zero)Reap(aggregate);if(child!=null){if(!child.Stop())Environment.FailFast("Readonly fixture exit unknown");child.Dispose();}foreach(IntPtr handle in new[]{aggregate,parent,copy,token})if(handle!=IntPtr.Zero)CloseHandle(handle);}
 }
}
