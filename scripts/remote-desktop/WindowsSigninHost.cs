// Installed service only. Never registers itself and has no generic command API.
using System;
using System.Collections.Generic;
using System.IO;
using System.Security.AccessControl;
using System.ServiceProcess;
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
    internal sealed class RuntimeLease:IDisposable {
        readonly List<SodaDesktopSigninPackageNative.Held> held;internal readonly string Path;
        RuntimeLease(string path,List<SodaDesktopSigninPackageNative.Held> held){Path=path;this.held=held;}
        internal static RuntimeLease Open(){
            string path=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"sodashitsu","desktop-signin",SodaDesktopSigninPackage.Slot(Owner),"runtime");
            var items=new List<string>();var held=new List<SodaDesktopSigninPackageNative.Held>();bool transferred=false;
            try {
                if(path.Length>512||path.Length<3||path[1]!=':'||path[2]!='\\')throw Failure();
                var drive=new DriveInfo(System.IO.Path.GetPathRoot(path));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();
                for(string current=path;!String.IsNullOrEmpty(current);current=System.IO.Path.GetDirectoryName(current)){if(items.Count>=64)throw Failure();items.Add(current);}
                items.Reverse();foreach(string current in items){bool leaf=current==path;held.Add(SodaDesktopSigninPackageNative.OpenCore(current,true,leaf,0,bytes=>leaf?PrivateRuntimeAcl(bytes):SodaDesktopSigninPackage.CodeAcl(bytes,false),null));}
                var result=new RuntimeLease(path,held);transferred=true;return result;
            }finally{if(!transferred)SodaDesktopSigninPackageNative.Release(held);}
        }
        public void Dispose(){SodaDesktopSigninPackageNative.Release(held);}
    }
    internal static void Run(WaitHandle stop){
        SodaDesktopSigninPackageNative.Lease package=null;RuntimeLease runtime=null;SodaDesktopSigninProcess.Child child=null;
        try {
            package=SodaDesktopSigninPackageNative.Verify(Owner);runtime=RuntimeLease.Open();
            if(stop.WaitOne(0)||!package.Current())return;
            child=SodaDesktopSigninProcess.Start(Plan.Installed(package,runtime.Path),()=>!stop.WaitOne(0)&&package.Current());
            while(!stop.WaitOne(250)&&package.Current()&&child.Running()){}
            if(!stop.WaitOne(0))throw Failure();
        }finally {
            // Holding the entire package until ALL descendants stop is mandatory.
            // On an OS failure never release the leases to a surviving child.
            if(child!=null&&!child.Stop())Environment.FailFast("Signin host could not stop its child");
            if(child!=null)child.Dispose();if(runtime!=null)runtime.Dispose();if(package!=null)package.Dispose();
        }
    }
    sealed class Service:ServiceBase {
        readonly ManualResetEvent stop=new ManualResetEvent(false);Thread thread;
        internal Service(){ServiceName="SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(Owner);CanStop=true;CanShutdown=true;AutoLog=false;}
        protected override void OnStart(string[] args){
            if(args==null||args.Length!=0||!Environment.Is64BitProcess||!SodaDesktopSigninVault.SystemPrimary()||thread!=null)throw Failure();
            thread=new Thread(()=>{try{SodaDesktopSigninHost.Run(stop);}catch{ExitCode=1;}finally{ThreadPool.QueueUserWorkItem(_=>{try{Stop();}catch{}});}});thread.IsBackground=true;thread.Start();
        }
        protected override void OnStop(){stop.Set();if(thread!=null&&Thread.CurrentThread!=thread&&!thread.Join(12000))Environment.FailFast("Signin host could not stop");}
        protected override void OnShutdown(){OnStop();}
        protected override void Dispose(bool disposing){if(disposing){OnStop();stop.Dispose();}base.Dispose(disposing);}
    }
    public static void Main(string[] args){
        // No --console, executable path, credentials, SCM arguments or repair mode.
        if(args==null||args.Length!=0||!Environment.Is64BitProcess||!SodaDesktopSigninVault.SystemPrimary())throw Failure();
        SodaDesktopSigninPackage.OwnerSid(Owner);ServiceBase.Run(new Service());
    }
}
