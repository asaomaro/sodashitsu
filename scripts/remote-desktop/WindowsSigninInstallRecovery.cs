// Explicit completion of the exact never-started initial install whose marker
// remains. Never adopts another release, resets a journal, starts/stops a service,
// removes keys, or changes the existing marker-free initial recovery contract.
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninInstallRecovery {
    static Exception Failure(){return new InvalidOperationException("Initial signin install completion requires matching private evidence");}
    static void Require(bool value){if(!value)throw Failure();}
    static bool Hex(string value){return value!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,"\\A[a-f0-9]{64}\\z");}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    internal interface Calls:IDisposable {void InspectInitialDisabled();void InspectStrictDisabled();bool Stopped();void Secure();void Manual();void InspectManual();}
    public static IDictionary<string,object> Run(string owner,string manifest,string markerHash,bool complete){
        Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner)&&Hex(manifest)&&(!complete||Hex(markerHash)));var timer=Stopwatch.StartNew();
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>timer.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
            var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));
            using(var service=new Native(owner))return Core(owner,manifest,paths.Slot,markerHash,complete,service,current,()=>SodaDesktopSigninQuiescence.Open(owner),SodaDesktopSigninQuiescence.StateAncestor);
        }
    }
    internal sealed class Storage:IDisposable {
        readonly string slot,path;readonly Func<bool> scope;readonly Func<string,byte[],bool> policy;
        readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();
        SodaDesktopSigninPackageNative.Held marker;bool ended,checking,cleared;internal readonly string MarkerHash;
        internal Storage(string slot,string owner,string manifest,Func<bool> scope,Func<string,byte[],bool> policy){
            this.slot=slot;path=Path.Combine(slot,"install.transition");this.scope=scope;this.policy=policy;
            try{
                var parents=new List<string>();for(string p=slot;!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){Require(parents.Count<64);parents.Add(p);}parents.Reverse();
                parents.Add(Path.Combine(slot,"admin"));parents.Add(Path.Combine(slot,"runtime"));parents.Add(Path.Combine(slot,"runs"));
                foreach(string p in parents){Require(scope());held.Add(SodaDesktopSigninPackageNative.OpenCore(p,true,true,0,a=>policy(p,a),null));}
                marker=SodaDesktopSigninPackageNative.OpenRenamableCore(path,4096,a=>policy(path,a));var bytes=ReadMarker();MarkerHash=Hash(bytes);
                var json=new JavaScriptSerializer();string text=new UTF8Encoding(false,true).GetString(bytes);var fields=json.DeserializeObject(text) as Dictionary<string,object>;
                Require(fields!=null&&fields.Count==7&&fields.ContainsKey("version")&&fields["version"] is int&&(int)fields["version"]==1);
                Require((string)fields["purpose"]=="desktop-signin-install"&&(string)fields["mode"]=="initial"&&(string)fields["ownerSid"]==owner&&(string)fields["packageSha256"]==manifest);
                Guid id;string value=(string)fields["installId"];Require(Guid.TryParseExact(value,"D",out id)&&id!=Guid.Empty&&id.ToString("D")==value);
                Require(fields["createdAt"] is long||fields["createdAt"] is int);long created=Convert.ToInt64(fields["createdAt"]);Require(created>0&&created<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+60000);
                Require(json.Serialize(new SortedDictionary<string,object>(fields,StringComparer.Ordinal))==text&&Current());
            }catch{Dispose();throw Failure();}
        }
        byte[] ReadMarker(){var bytes=new byte[checked((int)marker.Stream.Length)];Require(bytes.Length>0&&bytes.Length<=4096);marker.Stream.Position=0;int at=0;while(at<bytes.Length){int n=marker.Stream.Read(bytes,at,bytes.Length-at);Require(n>0);at+=n;}Require(marker.Stream.ReadByte()==-1);return bytes;}
        internal bool Current(){if(ended||checking)return false;checking=true;try{
            Require(scope());foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,a=>policy(item.Path,a));
            var names=new HashSet<string>(new[]{"admin","runtime","runs","quiescence.lock"},StringComparer.Ordinal);if(!cleared)names.Add("install.transition");var entries=Directory.GetFileSystemEntries(slot);Require(entries.Length==names.Count);foreach(string p in entries)Require(names.Remove(Path.GetFileName(p)));
            Require(Directory.GetFileSystemEntries(Path.Combine(slot,"admin")).Length==0&&Directory.GetFileSystemEntries(Path.Combine(slot,"runtime")).Length==0);
            var runs=Directory.GetFileSystemEntries(Path.Combine(slot,"runs"));Require(runs.Length==1&&Path.GetFileName(runs[0])=="initial");
            if(cleared)Require(SodaDesktopSigninPackageNative.Absent(path));else{SodaDesktopSigninPackageNative.CheckCore(marker,a=>policy(path,a));Require(Hash(ReadMarker())==MarkerHash);}
            return scope()&&!ended;
        }catch{ended=true;return false;}finally{checking=false;}}
        internal void ClearMarker(){Require(!cleared&&Current());using(var again=SodaDesktopSigninPackageNative.OpenRenamableCore(path,4096,a=>policy(path,a))){Require(marker.Before.Same(again.Before,false,4096)&&Current());File.Delete(path);cleared=true;marker.Dispose();marker=null;}Require(Current());}
        public void Dispose(){ended=true;if(marker!=null){marker.Dispose();marker=null;}SodaDesktopSigninPackageNative.Release(held);}
    }
    internal static IDictionary<string,object> Core(string owner,string manifest,string slot,string markerHash,bool complete,Calls service,Func<bool> current,Func<SodaDesktopSigninQuiescence.Pin> barrier,Func<string,byte[],bool> policy){
        Require(current()&&Hex(manifest)&&(!complete||Hex(markerHash)));service.InspectInitialDisabled();Require(service.Stopped()&&current());
        using(var storage=new Storage(slot,owner,manifest,current,policy))using(var pin=barrier())using(var exclusive=pin.Exclusive()){
            string fingerprint=exclusive.Fingerprint;Func<bool> retained=()=>current()&&storage.Current()&&exclusive.Current()&&exclusive.Fingerprint==fingerprint;
            using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(slot,"runs"),owner,manifest,fingerprint,SodaDesktopSigninRunJournal.Role.Reader,retained,a=>policy(Path.Combine(slot,"runs"),a),new string[0])){
                Func<bool> evidence=()=>retained()&&journal.State()=="initial"&&retained();Require(evidence());
                if(!complete)return new Dictionary<string,object>{{"state","initial-install-inspected"},{"markerSha256",storage.MarkerHash},{"packageSha256",manifest},{"started",false}};
                Require(storage.MarkerHash==markerHash);service.InspectInitialDisabled();Require(service.Stopped()&&evidence());
                service.Secure();Require(current());service.InspectStrictDisabled();Require(service.Stopped()&&evidence());
                storage.ClearMarker();Require(evidence());service.InspectStrictDisabled();Require(service.Stopped()&&evidence());
                service.Manual();Require(current());service.InspectManual();Require(service.Stopped()&&evidence());
                return new Dictionary<string,object>{{"state","initial-install-completed"},{"markerSha256",markerHash},{"packageSha256",manifest},{"started",false}};
            }
        }
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr service);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceStatusEx(IntPtr service,uint level,out SodaDesktopSigninInitialRecovery.Status status,uint bytes,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool ChangeServiceConfigW(IntPtr service,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password,string display);
    sealed class Native:Calls {
        readonly string owner;IntPtr manager,service;
        internal Native(string owner){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);try{manager=OpenSCManagerW(null,null,1);Require(manager!=IntPtr.Zero);service=OpenServiceW(manager,SodaDesktopSigninServicePolicy.Name(owner),0x000e0007);Require(service!=IntPtr.Zero);}catch{Dispose();throw;}}
        public void InspectInitialDisabled(){SodaDesktopSigninServicePolicy.InspectInitialDisabled(owner);}
        public void InspectStrictDisabled(){SodaDesktopSigninServicePolicy.InspectDisabled(owner);}
        public bool Stopped(){SodaDesktopSigninInitialRecovery.Status status;uint needed;return QueryServiceStatusEx(service,0,out status,(uint)Marshal.SizeOf(typeof(SodaDesktopSigninInitialRecovery.Status)),out needed)&&SodaDesktopSigninInitialRecovery.IsStopped(status);}
        public void Secure(){SodaDesktopSigninInstallerScm.Secure(service);}
        public void Manual(){Require(ChangeServiceConfigW(service,UInt32.MaxValue,3,UInt32.MaxValue,null,null,IntPtr.Zero,null,null,null,null));}
        public void InspectManual(){SodaDesktopSigninServicePolicy.Inspect(owner);}
        public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
    }
}
