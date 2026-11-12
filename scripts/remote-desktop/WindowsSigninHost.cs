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
        internal static Plan Installed(SodaDesktopSigninPackageNative.Lease package,string runtime,bool admin=false){
            string owner=SodaDesktopSigninPackage.OwnerSid(Owner),bootstrap=package.Bootstrap;
            if(bootstrap.IndexOf('"')>=0)throw Failure();
            return new Plan(package.Node,"--no-addons \""+bootstrap+"\" --owner "+owner+(admin?" --admin":""),Environment.GetFolderPath(Environment.SpecialFolder.System),runtime);
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
        using(var package=SodaDesktopSigninPackageNative.Verify(Owner))
        using(var runtime=RuntimeLease.Open())
        using(var workers=new SodaDesktopSigninProcess.HostJobs(Owner,SodaDesktopSigninProcessEvidence.Self())){
            Func<bool> retained=()=>package.Current()&&runtime.Current();
            if(stop.WaitOne(0))return;
            using(var child=SodaDesktopSigninProcess.Start(Plan.Installed(package,runtime.Path),()=>!stop.WaitOne(0)&&retained())){
                while(!stop.WaitOne(250)&&retained()&&child.Running()){}
                if(!retained()||!child.TryGraceful())throw Failure();
            }
        }
    }
    internal static void Admin(WaitHandle stop){
        using(var package=SodaDesktopSigninPackageNative.Verify(Owner))
        using(var pin=SodaDesktopSigninQuiescence.Open(Owner))using(var exclusive=pin.Exclusive())
        using(var pipe=SodaDesktopSigninAdminPipe.Listen(Owner)){
            var cancel=ThreadPool.RegisterWaitForSingleObject(stop,(_,timedOut)=>pipe.Dispose(),null,Timeout.Infinite,true);
            byte[] request=null,response=null;
            try{
                pipe.WaitForConnection();request=SodaDesktopSigninAdminPipe.Read(pipe);SodaDesktopSigninAdminPipe.Authenticate(pipe);
                Func<bool> current=()=>!stop.WaitOne(0)&&package.Current()&&exclusive.Current();
                if(!current())throw Failure();
                string runtime=Path.Combine(SodaDesktopSigninVault.StateDirectory(Owner),"runtime");
                using(var runtimeHeld=SodaDesktopSigninPackageNative.OpenCore(runtime,true,true,0,SodaDesktopSigninQuiescence.Private,null))
                using(var child=SodaDesktopSigninProcess.Start(Plan.Installed(package,runtime,true),current,true)){
                    var reap=ThreadPool.RegisterWaitForSingleObject(stop,(_,timedOut)=>{if(!child.Stop())Environment.FailFast("Signin administration child could not stop");},null,Timeout.Infinite,true);
                    try{child.Request(request);response=child.Reply();if(!current()||!child.TryGraceful())throw Failure();}
                    finally{reap.Unregister(null);}
                }
                SodaDesktopSigninAdminPipe.Write(pipe,response);
            }finally{cancel.Unregister(null);if(request!=null)Array.Clear(request,0,request.Length);if(response!=null)Array.Clear(response,0,response.Length);}
        }
    }
    // SCM owns service status, dispatch and stop/shutdown handling. OS Jobs own
    // descendant lifetime; no persistent intent, observer ACK or stop receipt.
    internal sealed class Service:System.ServiceProcess.ServiceBase {
        readonly ManualResetEvent stop=new ManualResetEvent(false);
        Thread worker;
        internal Service(){ServiceName=SodaDesktopSigninServicePolicy.Name(Owner);CanStop=true;CanShutdown=true;AutoLog=false;}
        protected override void OnStart(string[] args){
            if(args.Length!=0&&(args.Length!=1||args[0]!="--admin"))throw Failure();
            bool admin=args.Length==1;
            worker=new Thread(()=>{try{if(admin)SodaDesktopSigninHost.Admin(stop);else SodaDesktopSigninHost.Run(stop);}catch{ExitCode=1;}finally{ThreadPool.QueueUserWorkItem(_=>Stop());}});
            worker.IsBackground=true;worker.Start();
        }
        protected override void OnStop(){
            stop.Set();
            if(worker!=null&&worker!=Thread.CurrentThread){
                RequestAdditionalTime(30000);
                worker.Join();
            }
        }
        protected override void OnShutdown(){stop.Set();if(worker!=null&&worker!=Thread.CurrentThread)worker.Join();}
        protected override void Dispose(bool disposing){if(disposing)stop.Dispose();base.Dispose(disposing);}
    }
    public static void Main(string[] args){
        if(args==null||args.Length!=0||!Environment.Is64BitProcess||!SodaDesktopSigninVault.SystemPrimary())throw Failure();
        SodaDesktopSigninPackage.OwnerSid(Owner);
        using(var service=new Service())System.ServiceProcess.ServiceBase.Run(service);
    }
}
