// Local SYSTEM-only worker creation. No caller-controlled path/token/desktop.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Text;
using System.Threading;
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
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenJobObjectW(uint access,bool inherit,string name);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out ulong created,out ulong exited,out ulong kernel,out ulong user);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr process,uint timeout);
    internal sealed class DiagnosticFailure:Exception {
        internal readonly int Code;
        internal DiagnosticFailure(int code):base("Signin worker is unavailable"){Code=code>=201&&code<=215?code:1;}
    }
    internal sealed class HostBinding:IDisposable {
        internal IntPtr Parent,Aggregate;SodaDesktopSigninRunJournal journal;SodaDesktopSigninProcessEvidence.Pin host;SodaDesktopSigninRunRecord started;Func<bool> scope;
        internal static HostBinding Open(string owner,string package,string barrier,Func<bool> current){
            var result=new HostBinding();int stage=203;try{result.scope=current;result.journal=SodaDesktopSigninRunStorage.OpenController(owner,package,barrier,SodaDesktopSigninRunJournal.Role.Reader,current);
                stage=204;Require(result.journal.State()=="observed");result.started=result.journal.StartedRecord();stage=205;result.host=SodaDesktopSigninProcessEvidence.Open(owner,result.started,current);
                stage=206;result.Parent=OpenProcess(0x00101080,false,checked((uint)(long)result.started.Field("pid")));Require(result.Parent!=IntPtr.Zero);stage=207;Require(result.Current());
                stage=208;result.Aggregate=OpenJobObjectW(0x0005,false,SodaDesktopSigninProcess.HostJobName(owner,result.started));Require(result.Aggregate!=IntPtr.Zero);stage=209;Require(result.Current());return result;
            }catch{result.Dispose();throw new DiagnosticFailure(stage);}
        }
        internal bool Current(){
            try{ulong created,exited,kernel,user;return scope!=null&&scope()&&host!=null&&host.Current()&&Parent!=IntPtr.Zero&&WaitForSingleObject(Parent,0)==258&&GetProcessTimes(Parent,out created,out exited,out kernel,out user)&&created.ToString(System.Globalization.CultureInfo.InvariantCulture)==(string)started.Field("createdFiletime")&&journal.State()=="observed"&&journal.StartedRecord().Digest()==started.Digest()&&scope()&&host.Current();}catch{return false;}
        }
        public void Dispose(){Close(ref Aggregate);Close(ref Parent);if(host!=null){host.Dispose();host=null;}if(journal!=null){journal.Dispose();journal=null;}}
    }
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
    internal static SodaDesktopSigninProcess.Child Start(string owner,Guid nonce,int session,SodaDesktopSigninWorker.Purpose purpose,string runtime,HostBinding host,out uint pid){
        VerifyLayouts();pid=0;Require(host!=null&&host.Current());Require(SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0&&session>0&&WTSGetActiveConsoleSessionId()==(uint)session);
        IntPtr token=IntPtr.Zero,copy=IntPtr.Zero,job=IntPtr.Zero,environment=IntPtr.Zero;var child=new PI();bool transferred=false;WorkerAttributes attributes=null;
        try{
            using(var self=Process.GetCurrentProcess()){
                Require(OpenProcessToken(self.Handle,0x12b,out token));long luid;Require(LookupPrivilegeValueW(null,"SeTcbPrivilege",out luid));
                var privilege=new Privilege{Count=1,Low=(uint)luid,High=(int)(luid>>32),Flags=2};Require(AdjustTokenPrivileges(token,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0);
                Require(DuplicateTokenEx(token,0xf01ff,IntPtr.Zero,2,1,out copy));Require(SetTokenInformation(copy,12,ref session,4));
                job=CreateJobObjectW(IntPtr.Zero,null);Require(job!=IntPtr.Zero);var limits=new Limits();limits.Basic.Flags=0x2000;Require(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits))));
                // Avoid inheriting the session0 Node Job. No breakaway is allowed.
                attributes=new WorkerAttributes(host.Parent,host.Aggregate,job);
                string application=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner),"DesktopSigninNative.exe");
                var plan=new SodaDesktopSigninHost.Plan(application,"--worker "+nonce.ToString("D")+" "+self.Id+" "+self.StartTime.ToUniversalTime().Ticks+" "+session+" "+SodaDesktopSigninWorker.PurposeName(purpose),Environment.GetFolderPath(Environment.SpecialFolder.System),runtime);
                environment=Marshal.StringToHGlobalUni(plan.EnvironmentBlock);var startup=new SX{Info=new SI{Size=Marshal.SizeOf(typeof(SX)),Desktop=@"WinSta0\Winlogon"},Attributes=attributes.List};
                Require(host.Current()&&WTSGetActiveConsoleSessionId()==(uint)session);
                // No handle inheritance across sessions. The pipe authenticates
                // the concrete process on both ends after creation.
                Require(CreateProcessAsUserW(copy,application,new StringBuilder("\""+application+"\" "+plan.Arguments),IntPtr.Zero,IntPtr.Zero,false,0x80000|0x08000000|0x400|4,environment,plan.WorkingDirectory,ref startup,out child));
                Require(host.Current()&&WTSGetActiveConsoleSessionId()==(uint)session&&ResumeThread(child.Thread)==1);
                var result=new SodaDesktopSigninProcess.Child(child.Process,job);pid=child.Pid;transferred=true;return result;
            }
        }finally{
            if(!transferred&&child.Process!=IntPtr.Zero&&!new SodaDesktopSigninProcess.Child(child.Process,job).Stop())Environment.FailFast("Signin worker cleanup failed");
            if(!transferred){Close(ref child.Process);Close(ref job);}Close(ref child.Thread);Close(ref token);Close(ref copy);
            if(attributes!=null)attributes.Dispose();if(environment!=IntPtr.Zero)Marshal.FreeHGlobal(environment);
        }
    }
    // Atomic Job assignment is shared with the generated native regression.
    // The installed caller supplies only a retained, authenticated HostBinding.
    internal sealed class WorkerAttributes:IDisposable {
        internal IntPtr List;IntPtr jobs,parent;bool initialized;
        internal WorkerAttributes(IntPtr host,IntPtr aggregate,IntPtr individual){
            try{Require(host!=IntPtr.Zero&&aggregate!=IntPtr.Zero&&individual!=IntPtr.Zero);
                IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);Require(size.ToInt64()>0&&size.ToInt64()<65536);
                List=Marshal.AllocHGlobal(size);Require(InitializeProcThreadAttributeList(List,2,0,ref size));initialized=true;
                jobs=Marshal.AllocHGlobal(2*IntPtr.Size);Marshal.WriteIntPtr(jobs,aggregate);Marshal.WriteIntPtr(jobs,IntPtr.Size,individual);
                parent=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(parent,host);
                Require(UpdateProcThreadAttribute(List,0,new IntPtr(0x20000),parent,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
                Require(UpdateProcThreadAttribute(List,0,new IntPtr(0x2000d),jobs,new IntPtr(2*IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            }catch{Dispose();throw;}
        }
        public void Dispose(){if(initialized){DeleteProcThreadAttributeList(List);initialized=false;}foreach(IntPtr value in new[]{List,jobs,parent})if(value!=IntPtr.Zero)Marshal.FreeHGlobal(value);List=jobs=parent=IntPtr.Zero;}
    }
    internal static void VerifyLayouts(){Require(IntPtr.Size==8&&Marshal.SizeOf(typeof(SI))==104&&Marshal.SizeOf(typeof(SX))==112&&Marshal.SizeOf(typeof(Limits))==144&&Marshal.SizeOf(typeof(Privilege))==16);}
}
