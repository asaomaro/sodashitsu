// Private native launcher. Its Plan is never reachable through RPC or CLI.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class SodaDesktopSigninProcess {
    [StructLayout(LayoutKind.Sequential)]struct SA{internal int Size;internal IntPtr Descriptor;internal int Inherit;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct SI{internal int Size;internal string Reserved,Desktop,Title;internal uint X,Y,W,H,CX,CY,Fill,Flags;internal short Show,ReservedSize;internal IntPtr ReservedBytes,Input,Output,Error;}
    [StructLayout(LayoutKind.Sequential)]struct SX{internal SI Info;internal IntPtr Attributes;}
    [StructLayout(LayoutKind.Sequential)]struct PI{internal IntPtr Process,Thread;internal uint Pid,Tid;}
    [StructLayout(LayoutKind.Sequential)]struct BasicLimit{internal long ProcessTime,JobTime;internal uint Flags;internal UIntPtr Min,Max;internal uint Active;internal UIntPtr Affinity;internal uint Priority,Scheduling;}
    [StructLayout(LayoutKind.Sequential)]struct IO{internal ulong A,B,C,D,E,F;}
    [StructLayout(LayoutKind.Sequential)]struct Limits{internal BasicLimit Basic;internal IO Io;internal UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
    [StructLayout(LayoutKind.Sequential)]struct Accounting{internal long A,B,C,D;internal uint Faults,Total,Active,Terminated;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr CreateFileW(string path,uint access,uint share,ref SA sa,uint create,uint flags,IntPtr template);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limit,uint size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting data,uint size,IntPtr returned);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateJobObject(IntPtr job,uint code);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processSa,IntPtr threadSa,bool inherit,uint flags,IntPtr env,string directory,ref SX startup,out PI process);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    static void Require(bool value){if(!value)throw SodaDesktopSigninHost.Failure();}
    static void Close(ref IntPtr value){if(value!=IntPtr.Zero&&value!=new IntPtr(-1))CloseHandle(value);value=IntPtr.Zero;}
    internal static void Layouts(){Require(IntPtr.Size==8&&Marshal.SizeOf(typeof(SI))==104&&Marshal.SizeOf(typeof(SX))==112&&Marshal.SizeOf(typeof(Limits))==144&&Marshal.SizeOf(typeof(Accounting))==48);}
    internal sealed class Child:IDisposable {
        IntPtr process,job;bool stopped;readonly object gate=new object();
        internal Child(IntPtr process,IntPtr job){this.process=process;this.job=job;}
        internal bool Running(){lock(gate){return !stopped&&WaitForSingleObject(process,0)==258;}}
        internal uint Active(){lock(gate){Accounting data=new Accounting();Require(job!=IntPtr.Zero&&QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero));return data.Active;}}
        internal bool Stop(){lock(gate){
            if(stopped)return true;
            // Keep the job open for accounting, then close only after zero active.
            if(job==IntPtr.Zero||!TerminateJobObject(job,1))return false;
            var deadline=Stopwatch.StartNew();
            while(deadline.ElapsedMilliseconds<8000){
                Accounting data=new Accounting();if(!QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero))return false;
                if(data.Active==0&&WaitForSingleObject(process,0)==0){stopped=true;return true;}Thread.Sleep(10);
            }return false;
        }}
        public void Dispose(){lock(gate){if(!Stop())throw SodaDesktopSigninHost.Failure();Close(ref process);Close(ref job);}}
    }
    internal static Child Start(SodaDesktopSigninHost.Plan plan,Func<bool> current){
        Layouts();Require(plan!=null&&current!=null&&current());
        IntPtr job=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero,jobValue=IntPtr.Zero,environment=IntPtr.Zero;
        var inherited=new IntPtr[3];var process=new PI();bool initialized=false,transferred=false;
        try {
            job=CreateJobObjectW(IntPtr.Zero,null);Require(job!=IntPtr.Zero);
            var limits=new Limits();limits.Basic.Flags=0x2000;Require(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits))));
            var sa=new SA{Size=Marshal.SizeOf(typeof(SA)),Inherit=1};
            for(int i=0;i<3;i++){inherited[i]=CreateFileW("NUL",i==0?0x80000000u:0x40000000u,3,ref sa,3,0,IntPtr.Zero);Require(inherited[i]!=IntPtr.Zero&&inherited[i]!=new IntPtr(-1));}
            IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);Require(size.ToInt64()>0&&size.ToInt64()<65536);
            list=Marshal.AllocHGlobal(size);Require(InitializeProcThreadAttributeList(list,2,0,ref size));initialized=true;
            handles=Marshal.AllocHGlobal(3*IntPtr.Size);for(int i=0;i<3;i++)Marshal.WriteIntPtr(handles,i*IntPtr.Size,inherited[i]);
            jobValue=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobValue,job);
            Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(3*IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobValue,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            var startup=new SX{Info=new SI{Size=Marshal.SizeOf(typeof(SX)),Flags=0x100,Input=inherited[0],Output=inherited[1],Error=inherited[2]},Attributes=list};
            environment=Marshal.StringToHGlobalUni(plan.EnvironmentBlock);
            Require(current());
            Require(CreateProcessW(plan.Application,new StringBuilder("\""+plan.Application+"\" "+plan.Arguments),IntPtr.Zero,IntPtr.Zero,true,0x80000|0x08000000|0x400|4,environment,plan.WorkingDirectory,ref startup,out process));
            Require(current());Require(ResumeThread(process.Thread)!=0xffffffff);
            var result=new Child(process.Process,job);transferred=true;return result;
        }finally{
            if(!transferred&&process.Process!=IntPtr.Zero){
                // Includes refusal after create while the initial thread is suspended.
                if(!new Child(process.Process,job).Stop())Environment.FailFast("Signin child cleanup failed");
            }
            if(!transferred){Close(ref process.Process);Close(ref job);}Close(ref process.Thread);
            if(initialized)DeleteProcThreadAttributeList(list);
            foreach(IntPtr value in new[]{list,handles,jobValue,environment})if(value!=IntPtr.Zero)Marshal.FreeHGlobal(value);
            for(int i=0;i<inherited.Length;i++)Close(ref inherited[i]);
        }
    }
}
