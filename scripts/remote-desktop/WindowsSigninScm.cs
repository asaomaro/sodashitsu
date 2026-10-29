// Fixed existing-service control. No registration, deletion, recovery policy,
// process termination or generic service/path arguments are exposed.
using System;
using System.Runtime.InteropServices;
internal sealed class SodaDesktopSigninScm:IDisposable {
    internal sealed class Status {
        internal readonly uint State,Pid,Exit,Specific;
        internal Status(uint state,uint pid,uint exit,uint specific){if(state<1||state>7||state==4&&pid==0)throw Failure();State=state;Pid=pid;Exit=exit;Specific=specific;}
        internal bool Clean{get{return State==1&&Exit==0&&Specific==0;}}
    }
    // Ordinary generated-call adapter verifies commit ordering without contacting
    // SCM. Only the private Native implementation can use real service APIs.
    internal interface Calls:IDisposable {void Inspect();Status Query();void Start();void Stop();}
    readonly object gate=new object();Calls calls;readonly Func<bool> scope;bool ended,checking,busy;
    static Exception Failure(){return new InvalidOperationException("Signin service control is unavailable");}
    internal SodaDesktopSigninScm(Calls calls,Func<bool> scope){if(calls==null||scope==null)throw Failure();this.calls=calls;this.scope=scope;}
    void Current(){if(ended||checking||calls==null){ended=true;throw Failure();}checking=true;try{if(!scope()||ended)throw Failure();}catch{ended=true;throw;}finally{checking=false;}}
    internal Status Query(){lock(gate){Current();if(busy){ended=true;throw Failure();}busy=true;try{var value=calls.Query();Current();return value;}catch{ended=true;throw;}finally{busy=false;}}}
    internal void Start(Func<bool> intent){lock(gate){Current();if(busy||intent==null){ended=true;throw Failure();}busy=true;try{
        calls.Inspect();if(calls.Query().State!=1||!intent())throw Failure();Current();if(!intent())throw Failure();Current();calls.Start();Current();
    }catch{ended=true;throw;}finally{busy=false;}}}
    internal void Stop(SodaDesktopSigninProcessEvidence.Pin process){lock(gate){Current();if(busy||process==null){ended=true;throw Failure();}busy=true;try{
        calls.Inspect();var status=calls.Query();if(status.State!=4||status.Pid!=process.Process.Pid||!process.Current())throw Failure();Current();
        status=calls.Query();if(status.State!=4||status.Pid!=process.Process.Pid||!process.Current())throw Failure();Current();calls.Stop();Current();
    }catch{ended=true;throw;}finally{busy=false;}}}
    public void Dispose(){lock(gate){ended=true;var owned=calls;calls=null;if(owned!=null)owned.Dispose();}}
    internal static SodaDesktopSigninScm Open(string owner,bool write,Func<bool> scope){
        if(!SodaDesktopSigninPackageNative.Authority(true)||scope==null||!scope())throw Failure();var native=new Native(owner,write);try{native.Inspect();return new SodaDesktopSigninScm(native,()=>SodaDesktopSigninPackageNative.Authority(true)&&scope());}catch{native.Dispose();throw;}
    }
    [StructLayout(LayoutKind.Sequential)]internal struct ProcessStatus {internal uint Type,State,Accepted,Exit,Specific,Checkpoint,Hint,Pid,Flags;}
    [StructLayout(LayoutKind.Sequential)]struct BasicStatus {internal uint Type,State,Accepted,Exit,Specific,Checkpoint,Hint;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceStatusEx(IntPtr service,uint level,out ProcessStatus status,uint bytes,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool StartServiceW(IntPtr service,uint count,IntPtr arguments);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool ControlService(IntPtr service,uint control,out BasicStatus status);
    internal static Status Decode(ProcessStatus value){if(value.Type!=0x10||value.Flags!=0)throw Failure();return new Status(value.State,value.Pid,value.Exit,value.Specific);}
    sealed class Native:Calls {
        IntPtr manager,service;readonly string owner;readonly bool write;
        internal Native(string owner,bool write){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);this.write=write;try{
            if(Marshal.SizeOf(typeof(ProcessStatus))!=36||Marshal.OffsetOf(typeof(ProcessStatus),"Pid").ToInt32()!=28||Marshal.SizeOf(typeof(BasicStatus))!=28)throw Failure();
            manager=OpenSCManagerW(null,null,1);if(manager==IntPtr.Zero)throw Failure();service=OpenServiceW(manager,SodaDesktopSigninServicePolicy.Name(owner),0x00020005u|(write?0x30u:0u));if(service==IntPtr.Zero)throw Failure();
        }catch{Dispose();throw;}}
        public void Inspect(){SodaDesktopSigninServicePolicy.Inspect(owner);}
        public Status Query(){ProcessStatus value;uint needed;if(service==IntPtr.Zero||!QueryServiceStatusEx(service,0,out value,36,out needed)||needed>36)throw Failure();return Decode(value);}
        public void Start(){if(!write||!StartServiceW(service,0,IntPtr.Zero))throw Failure();}
        public void Stop(){BasicStatus value;if(!write||!ControlService(service,1,out value))throw Failure();}
        public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
    }
}
