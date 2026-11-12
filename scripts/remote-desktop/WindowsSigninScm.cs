// Fixed local service adapter. SCM owns dispatch, serialization and lifecycle.
using System;
using System.Runtime.InteropServices;
using System.ServiceProcess;
internal sealed class SodaDesktopSigninScm:IDisposable {
    internal sealed class Status {
        internal readonly uint State,Pid,Exit,Specific;
        internal Status(uint state,uint pid,uint exit,uint specific){State=state;Pid=pid;Exit=exit;Specific=specific;}
        internal bool Clean{get{return State==1&&Exit==0&&Specific==0;}}
    }
    readonly ServiceController service;readonly string owner;readonly bool write;readonly Func<bool> current;
    SodaDesktopSigninScm(string owner,bool write,Func<bool> current){this.owner=owner;this.write=write;this.current=current;service=new ServiceController(SodaDesktopSigninServicePolicy.Name(owner));}
    static void Require(bool value){if(!value)throw new InvalidOperationException("Signin service control is unavailable");}
    internal static SodaDesktopSigninScm Open(string owner,bool write,Func<bool> current){
        Require(SodaDesktopSigninPackageNative.Authority(true)&&current!=null&&current());SodaDesktopSigninServicePolicy.Inspect(owner);return new SodaDesktopSigninScm(owner,write,current);
    }
    [StructLayout(LayoutKind.Sequential)]internal struct ProcessStatus {internal uint Type,State,Accepted,Exit,Specific,Checkpoint,Hint,Pid,Flags;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceStatusEx(IntPtr service,uint level,out ProcessStatus status,uint bytes,out uint needed);
    internal Status Query(){
        Require(current());service.Refresh();ProcessStatus status;uint needed;
        Require(QueryServiceStatusEx(service.ServiceHandle.DangerousGetHandle(),0,out status,36,out needed)&&needed<=36&&status.Type==0x10&&status.Flags==0&&status.State>=1&&status.State<=7&&(status.State!=4||status.Pid!=0));
        return new Status(status.State,status.Pid,status.Exit,status.Specific);
    }
    internal void Start(Func<bool> ready,bool admin=false){Require(write&&current()&&ready()&&Query().State==1);SodaDesktopSigninServicePolicy.Inspect(owner);service.Start(admin?new[]{"--admin"}:new string[0]);}
    internal void Stop(SodaDesktopSigninProcessEvidence.Pin process){Require(write&&current()&&process!=null&&process.Current()&&Query().Pid==process.Process.Pid);service.Stop();}
    internal void Wait(bool running){service.WaitForStatus(running?ServiceControllerStatus.Running:ServiceControllerStatus.Stopped,TimeSpan.FromSeconds(90));Require(current());}
    public void Dispose(){service.Dispose();}
}
