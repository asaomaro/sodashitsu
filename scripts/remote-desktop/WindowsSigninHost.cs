// Installed service only. Never registers itself and has no generic command API.
using System;
using System.Collections.Generic;
using System.IO;
using System.Security.AccessControl;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class SodaDesktopSigninHost {
    internal const string Owner="__SIGNIN_OWNER_SID__";
    internal static Exception Failure(){return new InvalidOperationException("Signin host is unavailable");}
    internal sealed class Plan {
        internal readonly string Application,Arguments,WorkingDirectory,EnvironmentBlock;
        internal Plan(string application,string arguments,string system,string runtime){
            if(String.IsNullOrEmpty(application)||!Path.IsPathRooted(application)||application.IndexOf('"')>=0||application.IndexOf('\0')>=0||String.IsNullOrEmpty(arguments)||String.IsNullOrEmpty(system)||!Path.IsPathRooted(system)||String.IsNullOrEmpty(runtime)||!Path.IsPathRooted(runtime))throw Failure();
            Application=application;Arguments=arguments;WorkingDirectory=system;
            var variables=new SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase){
                {"PATH",system},{"SystemRoot",Path.GetDirectoryName(system)},{"TEMP",runtime},{"TMP",runtime},{"windir",Path.GetDirectoryName(system)}
            };
            var block=new StringBuilder();foreach(var pair in variables){if(pair.Value.IndexOf('\0')>=0)throw Failure();block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');}EnvironmentBlock=block.Append('\0').ToString();
        }
        internal static Plan Installed(SodaDesktopSigninPackageNative.Lease package,string runtime){
            string owner=SodaDesktopSigninPackage.OwnerSid(Owner),bootstrap=package.Bootstrap;
            if(bootstrap.IndexOf('"')>=0)throw Failure();
            return new Plan(package.Node,"--no-addons \""+bootstrap+"\" --owner "+owner,Environment.GetFolderPath(Environment.SpecialFolder.System),runtime);
        }
    }
    internal static bool PrivateRuntimeAcl(byte[] bytes){
        if(!SodaDesktopSigninPackage.CodeAcl(bytes,true))return false;
        try {
            var descriptor=new RawSecurityDescriptor(bytes,0);
            foreach(GenericAce value in descriptor.DiscretionaryAcl){
                var ace=value as CommonAce;if(ace==null||ace.IsCallback)return false;
                if(ace.AceQualifier!=AceQualifier.AccessAllowed)continue;
                string sid=ace.SecurityIdentifier.Value;
                if(sid=="S-1-5-18"||sid=="S-1-5-32-544"||sid=="S-1-3-0"&&(ace.AceFlags&AceFlags.InheritOnly)!=0)continue;
                if(ace.AccessMask!=0)return false;
            }
            return true;
        }catch{return false;}
    }
    // Installer precreates this immutable one-byte private file. Holding a read
    // lease denies write/delete and an administrator's exclusive quiescence open.
    internal static SodaDesktopSigninPackageNative.Held Barrier(string runtime,Func<byte[],bool> policy){
        string path=System.IO.Path.Combine(System.IO.Path.GetDirectoryName(runtime),"quiescence.lock");
        return SodaDesktopSigninPackageNative.OpenCore(path,false,true,1,policy,stream=>{if(stream.ReadByte()!=83||stream.ReadByte()!=-1)throw Failure();});
    }
    internal sealed class RuntimeLease:IDisposable {
        readonly List<SodaDesktopSigninPackageNative.Held> held;internal readonly string Path;readonly object gate=new object();bool disposed;
        RuntimeLease(string path,List<SodaDesktopSigninPackageNative.Held> held){Path=path;this.held=held;}
        internal static RuntimeLease Open(){
            string path=System.IO.Path.Combine(SodaDesktopSigninVault.StateDirectory(Owner),"runtime");
            var items=new List<string>();var held=new List<SodaDesktopSigninPackageNative.Held>();bool transferred=false;
            try {
                if(path.Length>512||path.Length<3||path[1]!=':'||path[2]!='\\')throw Failure();
                var drive=new DriveInfo(System.IO.Path.GetPathRoot(path));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();
                for(string current=path;!String.IsNullOrEmpty(current);current=System.IO.Path.GetDirectoryName(current)){if(items.Count>=64)throw Failure();items.Add(current);}
                items.Reverse();foreach(string current in items){bool leaf=current==path;held.Add(SodaDesktopSigninPackageNative.OpenCore(current,true,leaf,0,bytes=>leaf?PrivateRuntimeAcl(bytes):SodaDesktopSigninQuiescence.StateAncestor(current,bytes),null));}
                held.Add(Barrier(path,PrivateRuntimeAcl));
                var result=new RuntimeLease(path,held);transferred=true;return result;
            }finally{if(!transferred)SodaDesktopSigninPackageNative.Release(held);}
        }
        internal bool Current(){lock(gate){try{if(disposed)return false;foreach(var item in held){bool secret=item.Path==Path||!item.Directory;SodaDesktopSigninPackageNative.CheckCore(item,bytes=>secret?PrivateRuntimeAcl(bytes):SodaDesktopSigninQuiescence.StateAncestor(item.Path,bytes));}return !disposed;}catch{return false;}}}
        internal string BarrierSha256{get{lock(gate){if(!Current())throw Failure();return held[held.Count-1].Before.Fingerprint();}}}
        public void Dispose(){lock(gate){disposed=true;SodaDesktopSigninPackageNative.Release(held);}}
    }
    internal static void Run(WaitHandle stop){
        SodaDesktopSigninPackageNative.Lease package=null;RuntimeLease runtime=null;SodaDesktopSigninProcess.Child child=null;SodaDesktopSigninRunSession run=null;
        try {
            package=SodaDesktopSigninPackageNative.Verify(Owner);runtime=RuntimeLease.Open();
            if(stop.WaitOne(0)||!package.Current())return;
            Func<bool> retained=()=>package.Current()&&runtime.Current();
            var journal=SodaDesktopSigninRunStorage.OpenHost(Owner,package.ManifestSha256,runtime.BarrierSha256,retained);
            run=SodaDesktopSigninRunSession.Open(journal,Owner,retained,stop);if(!run.Ready())throw Failure();
            child=SodaDesktopSigninProcess.Start(Plan.Installed(package,runtime.Path),()=>!stop.WaitOne(0)&&retained(),()=>run.Resume(),()=>run.ConfirmResume());
            while(!stop.WaitOne(250)&&retained()&&child.Running()){}
            if(stop.WaitOne(0)){if(!child.TryGraceful())throw Failure();}
            else if(!retained()||!child.ExitedSuccessfully()||!child.TryGraceful())throw Failure();
            run.Complete(child,retained);WaitAfterCompletion(run,stop,retained);
        }finally {
            // Holding the entire package until ALL descendants stop is mandatory.
            // On an OS failure never release the leases to a surviving child.
            if(child!=null&&!child.Stop())Environment.FailFast("Signin host could not stop its child");
            if(child!=null)child.Dispose();if(run!=null)run.Dispose();if(runtime!=null)runtime.Dispose();if(package!=null)package.Dispose();
        }
    }
    // Keep a clean normal Host alive until a controller can pin it and request
    // stop; a short admin run instead exits under its retained start observer.
    internal static void WaitAfterCompletion(SodaDesktopSigninRunSession run,WaitHandle stop,Func<bool> retained){
        if(run==null||stop==null||retained==null)throw Failure();if(!run.Admin)while(!stop.WaitOne(250)&&retained()){}if(!retained())throw Failure();
    }
    // SCM supports the full fixed 82-character name; ServiceBase caps names at
    // 80. Keep the installed identity and use the native service dispatcher.
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]internal delegate void ServiceMain(uint count,IntPtr arguments);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]internal delegate uint ServiceHandler(uint control,uint eventType,IntPtr data,IntPtr context);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]internal struct ServiceEntry {
        [MarshalAs(UnmanagedType.LPWStr)]internal string Name;internal ServiceMain Main;
    }
    [StructLayout(LayoutKind.Sequential)]internal struct ServiceStatus {
        internal uint Type,State,Accepted,Exit,Specific,Checkpoint,WaitHint;
    }
    internal delegate bool StatusWriter(IntPtr handle,ref ServiceStatus status);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool StartServiceCtrlDispatcherW([In]ServiceEntry[] entries);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr RegisterServiceCtrlHandlerExW(string name,ServiceHandler handler,IntPtr context);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",ExactSpelling=true,SetLastError=true)]static extern bool SetServiceStatus(IntPtr handle,ref ServiceStatus status);
    internal sealed class StopDeadline:IDisposable {
        readonly object gate=new object();IDisposable timer;bool ended;
        internal StopDeadline(Func<Action,IDisposable> schedule,Action expire){
            timer=schedule(()=>{lock(gate){if(ended)return;ended=true;expire();}});
        }
        public void Dispose(){lock(gate){ended=true;if(timer!=null){timer.Dispose();timer=null;}}}
    }
    internal sealed class Service:IDisposable {
        readonly ManualResetEvent stop=new ManualResetEvent(false);readonly object gate=new object();
        readonly Func<string,ServiceHandler,IntPtr> register;readonly StatusWriter publish;readonly Action<WaitHandle> run;
        readonly ServiceMain entry;readonly ServiceHandler handler;internal readonly string Name;readonly Func<Action,IDisposable> schedule;StopDeadline deadline;
        ServiceStatus status;IntPtr handle;bool entered,disposed;internal int ExitCode;
        internal Service():this(null,null,null){}
        // Generated checks replace only native SCM calls and the protected Host.
        internal Service(Func<string,ServiceHandler,IntPtr> register,StatusWriter publish,Action<WaitHandle> run,Func<Action,IDisposable> schedule=null){
            Name="SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(Owner);
            this.register=register??((name,callback)=>RegisterServiceCtrlHandlerExW(name,callback,IntPtr.Zero));
            this.publish=publish??SetServiceStatus;this.run=run??SodaDesktopSigninHost.Run;
            this.schedule=schedule??new Func<Action,IDisposable>(action=>new System.Threading.Timer(_=>action(),null,25000,Timeout.Infinite));entry=Entry;handler=Control;
        }
        void Report(uint state){
            // Caller holds gate. STOPPED is final and published only after Run
            // has returned with every child/job/package lease released.
            if(status.State==1)return;
            if(state==1&&deadline!=null){deadline.Dispose();deadline=null;}
            status=new ServiceStatus{Type=0x10,State=state,Accepted=state==4?5u:0u,Exit=ExitCode==0?0u:1066u,Specific=ExitCode==0?0u:1u,Checkpoint=state==2||state==3?1u:0u,WaitHint=state==2||state==3?30000u:0u};
            if(!publish(handle,ref status)){stop.Set();Environment.FailFast("Signin service could not report its state");}
        }
        internal uint Control(uint control,uint eventType,IntPtr data,IntPtr context){
            try{lock(gate){
                if(disposed||handle==IntPtr.Zero||status.State==1)return 120;
                if(control==4){Report(status.State);return 0;}
                if(control!=1&&control!=5)return 120;
                if(status.State!=4&&status.State!=3)return 120;
                if(status.State==4)deadline=new StopDeadline(schedule,()=>Environment.FailFast("Signin host could not stop within deadline"));
                stop.Set();if(status.State==4)Report(3);return 0;
            }}catch{Environment.FailFast("Signin service control failed");return 120;}
        }
        internal void Entry(uint count,IntPtr arguments){
            bool admitted=false;
            try{
                lock(gate){if(entered||disposed)throw Failure();entered=true;admitted=true;handle=register(Name,handler);if(handle==IntPtr.Zero)throw Failure();Report(2);}
                // argv[0] is the service name. No caller start arguments, paths,
                // credentials or command mode are accepted by this service.
                if(count!=1||arguments==IntPtr.Zero||Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments))!=Name)throw Failure();
                lock(gate){Report(4);}run(stop);
            }catch{ExitCode=1;}
            finally{lock(gate){if(admitted&&handle!=IntPtr.Zero)Report(1);}if(ExitCode!=0)Environment.ExitCode=1;}
        }
        internal void Dispatch(){
            var table=new[]{new ServiceEntry{Name=Name,Main=entry},new ServiceEntry()};
            try{if(!StartServiceCtrlDispatcherW(table)||ExitCode!=0)throw Failure();}
            finally{GC.KeepAlive(entry);GC.KeepAlive(handler);GC.KeepAlive(table);}
        }
        public void Dispose(){lock(gate){if(disposed)return;if(entered&&handle!=IntPtr.Zero&&status.State!=1)Environment.FailFast("Signin dispatcher returned before cleanup");disposed=true;if(deadline!=null)deadline.Dispose();stop.Dispose();}}
    }
    public static void Main(string[] args){
        // No --console, executable path, credentials, SCM arguments or repair mode.
        if(args==null||args.Length!=0||!Environment.Is64BitProcess||!SodaDesktopSigninVault.SystemPrimary())throw Failure();
        SodaDesktopSigninPackage.OwnerSid(Owner);using(var service=new Service())service.Dispatch();
    }
}
