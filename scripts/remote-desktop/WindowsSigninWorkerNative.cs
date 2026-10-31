// Local SYSTEM-only worker creation. No caller-controlled path/token/desktop.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static class SodaDesktopSigninWorkerNative {
    [StructLayout(LayoutKind.Sequential)]struct SA{internal int Size;internal IntPtr Descriptor;internal int Inherit;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct SI{internal int Size;internal string Reserved,Desktop,Title;internal uint X,Y,W,H,CX,CY,Fill,Flags;internal short Show,ReservedSize;internal IntPtr ReservedBytes,Input,Output,Error;}
    [StructLayout(LayoutKind.Sequential)]struct SX{internal SI Info;internal IntPtr Attributes;}
    [StructLayout(LayoutKind.Sequential)]struct PI{internal IntPtr Process,Thread;internal uint Pid,Tid;}
    [StructLayout(LayoutKind.Sequential)]struct Basic{internal long ProcessTime,JobTime;internal uint Flags;internal UIntPtr Min,Max;internal uint Active;internal UIntPtr Affinity;internal uint Priority,Scheduling;}
    [StructLayout(LayoutKind.Sequential)]struct IO{internal ulong A,B,C,D,E,F;}
    [StructLayout(LayoutKind.Sequential)]struct Limits{internal Basic Basic;internal IO Io;internal UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
    [StructLayout(LayoutKind.Sequential)]struct Privilege{internal uint Count,Low;internal int High;internal uint Flags;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern SafePipeHandle CreateNamedPipeW(string name,uint open,uint mode,uint max,uint output,uint input,uint timeout,ref SA sa);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]internal static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]internal static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe,out uint pid);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool DuplicateTokenEx(IntPtr token,uint access,IntPtr sa,int level,int type,out IntPtr copy);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool SetTokenInformation(IntPtr token,int kind,ref int value,int size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool LookupPrivilegeValueW(string system,string name,out long luid);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref Privilege privilege,uint size,IntPtr previous,IntPtr returned);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limits,uint size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool CreateProcessAsUserW(IntPtr token,string application,StringBuilder command,IntPtr psa,IntPtr tsa,bool inherit,uint flags,IntPtr environment,string cwd,ref SX startup,out PI process);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]internal static extern uint WTSGetActiveConsoleSessionId();
    static void Require(bool value){if(!value)throw new InvalidOperationException("Signin worker is unavailable");}
    static void Close(ref IntPtr value){if(value!=IntPtr.Zero)CloseHandle(value);value=IntPtr.Zero;}
    internal static string PipeName(string owner,Guid nonce){Require(nonce!=Guid.Empty);return "SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(owner)+"-"+nonce.ToString("D");}
    internal static NamedPipeServerStream Server(string name){
        var acl=new PipeSecurity();acl.SetSecurityDescriptorSddlForm("O:SYG:SYD:P(D;;GA;;;NU)(A;;GA;;;SY)");byte[] bytes=acl.GetSecurityDescriptorBinaryForm();IntPtr descriptor=Marshal.AllocHGlobal(bytes.Length);SafePipeHandle handle=null;
        try{
            Marshal.Copy(bytes,0,descriptor,bytes.Length);var sa=new SA{Size=Marshal.SizeOf(typeof(SA)),Descriptor=descriptor,Inherit=0};
            // FIRST_PIPE_INSTANCE, overlapped, byte mode, reject remote clients.
            handle=CreateNamedPipeW(@"\\.\pipe\"+name,3|0x40000000|0x80000,8,1,65536,65536,0,ref sa);Require(handle!=null&&!handle.IsInvalid);
            var pipe=new NamedPipeServerStream(PipeDirection.InOut,true,false,handle);handle=null;return pipe;
        }finally{if(handle!=null)handle.Dispose();Marshal.FreeHGlobal(descriptor);}
    }
    internal static SodaDesktopSigninProcess.Child Start(string owner,Guid nonce,int session,SodaDesktopSigninWorker.Purpose purpose,string runtime,out uint pid){
        VerifyLayouts();pid=0;Require(SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0&&session>0&&WTSGetActiveConsoleSessionId()==(uint)session);
        IntPtr token=IntPtr.Zero,copy=IntPtr.Zero,job=IntPtr.Zero,list=IntPtr.Zero,jobValue=IntPtr.Zero,environment=IntPtr.Zero;var child=new PI();bool initialized=false,transferred=false;
        try{
            using(var self=Process.GetCurrentProcess()){
                Require(OpenProcessToken(self.Handle,0x12b,out token));long luid;Require(LookupPrivilegeValueW(null,"SeTcbPrivilege",out luid));
                var privilege=new Privilege{Count=1,Low=(uint)luid,High=(int)(luid>>32),Flags=2};Require(AdjustTokenPrivileges(token,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0);
                Require(DuplicateTokenEx(token,0xf01ff,IntPtr.Zero,2,1,out copy));Require(SetTokenInformation(copy,12,ref session,4));
                job=CreateJobObjectW(IntPtr.Zero,null);Require(job!=IntPtr.Zero);var limits=new Limits();limits.Basic.Flags=0x2000;Require(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits))));
                IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);Require(size.ToInt64()>0&&size.ToInt64()<65536);list=Marshal.AllocHGlobal(size);Require(InitializeProcThreadAttributeList(list,1,0,ref size));initialized=true;
                jobValue=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobValue,job);Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobValue,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
                string application=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner),"DesktopSigninNative.exe");
                var plan=new SodaDesktopSigninHost.Plan(application,"--worker "+nonce.ToString("D")+" "+self.Id+" "+self.StartTime.ToUniversalTime().Ticks+" "+session+" "+SodaDesktopSigninWorker.PurposeName(purpose),Environment.GetFolderPath(Environment.SpecialFolder.System),runtime);
                environment=Marshal.StringToHGlobalUni(plan.EnvironmentBlock);var startup=new SX{Info=new SI{Size=Marshal.SizeOf(typeof(SX)),Desktop=@"WinSta0\Winlogon"},Attributes=list};
                Require(WTSGetActiveConsoleSessionId()==(uint)session);
                // No handle inheritance across sessions. The pipe authenticates
                // the concrete process on both ends after creation.
                Require(CreateProcessAsUserW(copy,application,new StringBuilder("\""+application+"\" "+plan.Arguments),IntPtr.Zero,IntPtr.Zero,false,0x80000|0x08000000|0x400|4,environment,plan.WorkingDirectory,ref startup,out child));
                Require(WTSGetActiveConsoleSessionId()==(uint)session&&ResumeThread(child.Thread)==1);
                var result=new SodaDesktopSigninProcess.Child(child.Process,job);pid=child.Pid;transferred=true;return result;
            }
        }finally{
            if(!transferred&&child.Process!=IntPtr.Zero&&!new SodaDesktopSigninProcess.Child(child.Process,job).Stop())Environment.FailFast("Signin worker cleanup failed");
            if(!transferred){Close(ref child.Process);Close(ref job);}Close(ref child.Thread);Close(ref token);Close(ref copy);
            if(initialized)DeleteProcThreadAttributeList(list);foreach(IntPtr value in new[]{list,jobValue,environment})if(value!=IntPtr.Zero)Marshal.FreeHGlobal(value);
        }
    }
    internal static void VerifyLayouts(){Require(IntPtr.Size==8&&Marshal.SizeOf(typeof(SI))==104&&Marshal.SizeOf(typeof(SX))==112&&Marshal.SizeOf(typeof(Limits))==144&&Marshal.SizeOf(typeof(Privilege))==16);}
}
