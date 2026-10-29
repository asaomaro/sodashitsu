// Explicit narrow recovery of a fully committed NEVER-STARTED installation.
// No repair, marker deletion, journal initialization, replay, start or stop.
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class SodaDesktopSigninInitialRecovery {
    static Exception Failure(){return new InvalidOperationException("Initial signin recovery requires an intact never-started installation");}
    static void Require(bool value){if(!value)throw Failure();}
    internal interface Calls:IDisposable {void InspectDisabled();bool Stopped();void Manual();void InspectManual();}
    public static IDictionary<string,object> Run(string owner,string manifest){
        Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));var timer=Stopwatch.StartNew();
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>timer.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
            var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));
            using(var service=new Native(owner))return Core(owner,manifest,paths.Slot,service,current,()=>SodaDesktopSigninQuiescence.Open(owner),(path,acl)=>String.Equals(path,paths.Slot,StringComparison.OrdinalIgnoreCase)||path.StartsWith(paths.Slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(acl):SodaDesktopSigninPackage.CodeAcl(acl,false));
        }
    }
    internal sealed class Storage:IDisposable {
        readonly string slot;readonly Func<bool> scope;readonly Func<string,byte[],bool> policy;readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();bool ended,checking;
        internal Storage(string slot,Func<bool> scope,Func<string,byte[],bool> policy){this.slot=slot;this.scope=scope;this.policy=policy;try{
            var parents=new List<string>();for(string p=slot;!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){if(parents.Count>=64)throw Failure();parents.Add(p);}parents.Reverse();parents.Add(Path.Combine(slot,"admin"));parents.Add(Path.Combine(slot,"runtime"));parents.Add(Path.Combine(slot,"runs"));
            foreach(string p in parents){Require(scope());held.Add(SodaDesktopSigninPackageNative.OpenCore(p,true,true,0,acl=>policy(p,acl),null));}Require(Current());
        }catch{Dispose();throw;}}
        internal bool Current(){if(ended||checking){ended=true;return false;}checking=true;try{
            if(!scope())throw Failure();foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,acl=>policy(item.Path,acl));
            var expected=new HashSet<string>(new[]{"admin","runtime","runs","quiescence.lock"},StringComparer.Ordinal);var entries=Directory.GetFileSystemEntries(slot);if(entries.Length!=4)throw Failure();foreach(string path in entries)if(!expected.Remove(Path.GetFileName(path)))throw Failure();
            if(Directory.GetFileSystemEntries(Path.Combine(slot,"admin")).Length!=0||Directory.GetFileSystemEntries(Path.Combine(slot,"runtime")).Length!=0||!SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,"install.transition")))throw Failure();
            if(!scope()||ended)throw Failure();return true;
        }catch{ended=true;return false;}finally{checking=false;}}
        public void Dispose(){ended=true;SodaDesktopSigninPackageNative.Release(held);}
    }
    internal static IDictionary<string,object> Core(string owner,string manifest,string slot,Calls service,Func<bool> current,Func<SodaDesktopSigninQuiescence.Pin> barrier,Func<string,byte[],bool> policy){
        Require(current());service.InspectDisabled();Require(service.Stopped()&&current());
        using(var storage=new Storage(slot,current,policy))using(var pin=barrier())using(var exclusive=pin.Exclusive()){
            string fingerprint=exclusive.Fingerprint;Func<bool> retained=()=>current()&&storage.Current()&&exclusive.Current()&&exclusive.Fingerprint==fingerprint;
            using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(slot,"runs"),owner,manifest,fingerprint,SodaDesktopSigninRunJournal.Role.Reader,retained,acl=>policy(Path.Combine(slot,"runs"),acl),new string[0])){
                Func<bool> evidence=()=>retained()&&journal.State()=="initial"&&retained();
                Require(evidence());service.InspectDisabled();Require(service.Stopped()&&evidence());
                // The evidence check above follows blocking SCM inspection/query.
                service.Manual();Require(current());service.InspectManual();Require(service.Stopped()&&evidence());
                return new Dictionary<string,object>{{"state","initial-manual-restored"},{"started",false},{"packageSha256",manifest},{"ownerSid",owner}};
            }
        }
    }
    [StructLayout(LayoutKind.Sequential)]internal struct Status{internal uint Type,State,Accepted,Exit,Specific,Checkpoint,Hint,Pid,Flags;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceStatusEx(IntPtr service,uint level,out Status status,uint bytes,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool ChangeServiceConfigW(IntPtr service,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password,string display);
    // SERVICE_STOPPED has no valid PID; never interpret that field as proof.
    internal static bool IsStopped(Status status){return status.Type==0x10&&status.State==1&&status.Specific==0&&(status.Exit==0||status.Exit==1077)&&status.Flags==0;}
    sealed class Native:Calls {
        readonly string owner;IntPtr manager,service;
        internal Native(string owner){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);try{manager=OpenSCManagerW(null,null,1);if(manager==IntPtr.Zero)throw Failure();service=OpenServiceW(manager,SodaDesktopSigninServicePolicy.Name(owner),0x00020007);if(service==IntPtr.Zero)throw Failure();}catch{Dispose();throw;}}
        public void InspectDisabled(){SodaDesktopSigninServicePolicy.InspectDisabled(owner);}
        public bool Stopped(){Status status;uint needed;Require(service!=IntPtr.Zero&&Marshal.SizeOf(typeof(Status))==36);return QueryServiceStatusEx(service,0,out status,36,out needed)&&needed<=36&&IsStopped(status);}
        public void Manual(){Require(ChangeServiceConfigW(service,UInt32.MaxValue,3,UInt32.MaxValue,null,null,IntPtr.Zero,null,null,null,null));}
        public void InspectManual(){SodaDesktopSigninServicePolicy.Inspect(owner);}
        public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
    }
}
