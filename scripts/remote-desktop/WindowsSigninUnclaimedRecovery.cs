// Explicit cancellation of an expired initialize request that was never claimed.
// Not a clean process-stop receipt, replay, key reset or general crash recovery.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninUnclaimedRecovery {
    static Exception Failure(){return new InvalidOperationException("Signin cancellation requires intact expired unclaimed initialization evidence");}
    static void Require(bool value){if(!value)throw Failure();}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    static bool Hex(string value){if(value==null||value.Length!=64)return false;foreach(char c in value)if(!(c>='0'&&c<='9'||c>='a'&&c<='f'))return false;return true;}
    static long Integer(object value){Require(value is int||value is long);return Convert.ToInt64(value);}
    static string DirectoryId(SodaDesktopSigninPackageNative.Snapshot snapshot){var value=snapshot.Value;return value.Volume.ToString("x8")+value.IndexHigh.ToString("x8")+value.IndexLow.ToString("x8")+value.CreatedHigh.ToString("x8")+value.CreatedLow.ToString("x8");}
    static long Wall(){return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}
    public static IDictionary<string,object> Run(string owner,string manifest,string runFileSha256,string adminFileSha256){
        Require(Hex(manifest)&&Hex(runFileSha256)&&Hex(adminFileSha256)&&Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));
        var timer=Stopwatch.StartNew();using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>timer.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
            using(var scm=SodaDesktopSigninScm.Open(owner,false,current)){
                string slot=SodaDesktopSigninVault.StateDirectory(owner);
                Func<string,byte[],bool> policy=(path,acl)=>path==slot||path.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(acl):SodaDesktopSigninQuiescence.StateAncestor(path,acl);
                return Core(owner,manifest,slot,runFileSha256,adminFileSha256,()=>{SodaDesktopSigninServicePolicy.Inspect(owner);return current()&&scm.Query().State==1;},current,()=>SodaDesktopSigninQuiescence.Open(owner),policy,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile,Wall);
            }
        }
    }
    sealed class Evidence:IDisposable {
        internal SodaDesktopSigninPackageNative.Held File;internal readonly byte[] Bytes;
        internal Evidence(string path,int maximum,Func<string,byte[],bool> policy){
            File=SodaDesktopSigninPackageNative.OpenRenamableCore(path,maximum,acl=>policy(path,acl));
            try{Bytes=new byte[checked((int)File.Before.Value.SizeLow)];int at=0;while(at<Bytes.Length){int count=File.Stream.Read(Bytes,at,Bytes.Length-at);Require(count>0);at+=count;}Require(File.Stream.ReadByte()==-1);Check(policy);}catch{Dispose();throw;}
        }
        internal void Check(Func<string,byte[],bool> policy){
            SodaDesktopSigninPackageNative.CheckCore(File,acl=>policy(File.Path,acl));
            using(var named=SodaDesktopSigninPackageNative.OpenRenamableCore(File.Path,65536,acl=>policy(File.Path,acl)))Require(File.Before.Same(named.Before,false,65536));
        }
        internal void ReleaseForMove(){File.Dispose();}
        internal void RebindArchive(string path,string hash,Func<string,byte[],bool> policy){
            using(var actual=new Evidence(path,16384,policy)){
                Require(File.Before.Same(actual.File.Before,false,16384)&&Hash(actual.Bytes)==hash);
                File.Dispose();File=actual.File;actual.File=null;
            }
        }
        public void Dispose(){if(Bytes!=null)Array.Clear(Bytes,0,Bytes.Length);if(File!=null)File.Dispose();}
    }
    internal static SodaDesktopSigninRunRecord Verify(byte[] runBytes,byte[] adminBytes,string owner,string manifest,string barrier,string runHash,string adminHash,long now){
        byte[] plain=null;
        try{
            Require(Hex(runHash)&&Hex(adminHash)&&Hash(runBytes)==runHash&&Hash(adminBytes)==adminHash);
            var intent=SodaDesktopSigninRunRecord.Unprotect(runBytes,owner,"intent");
            Require((string)intent.Field("packageSha256")==manifest&&(string)intent.Field("barrierSha256")==barrier&&(string)intent.Field("mode")=="admin"&&(long)intent.Field("expiresAt")<=now&&(string)intent.Field("adminSha256")==adminHash);
            using(var envelope=SodaDesktopSigninAdminEnvelope.Decode(adminBytes,owner)){
                Require(envelope.Nonce==(string)intent.Field("adminNonce"));plain=envelope.Decrypt();
                Require(plain.Length<=16384);string text=new UTF8Encoding(false,true).GetString(plain);Require(!text.Contains("__type"));
                var json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=8};var data=json.DeserializeObject(text) as Dictionary<string,object>;
                Require(data!=null&&data.Count==7);foreach(string key in new[]{"version","purpose","ownerSid","nonce","issuedAt","expiresAt","operation"})Require(data.ContainsKey(key));
                Require(Integer(data["version"])==1&&(data["purpose"] as string)=="desktop-signin-admin"&&(data["ownerSid"] as string)==owner&&(data["nonce"] as string)==envelope.Nonce);
                long issued=Integer(data["issuedAt"]),expires=Integer(data["expiresAt"]);
                Require(now>=0&&now<=9007199254740991&&issued>=0&&issued<expires&&expires-issued<=300000&&expires<=now&&(long)intent.Field("issuedAt")>=issued&&(long)intent.Field("expiresAt")<=expires);
                var operation=data["operation"] as Dictionary<string,object>;Require(operation!=null&&operation.Count==1&&(operation["kind"] as string)=="initialize");
                return intent;
            }
        }catch{throw Failure();}finally{if(plain!=null)Array.Clear(plain,0,plain.Length);}
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
    sealed class Storage:IDisposable {
        readonly string slot;readonly Func<bool> scope;readonly Func<string,byte[],bool> policy;
        readonly List<SodaDesktopSigninPackageNative.Held> parents=new List<SodaDesktopSigninPackageNative.Held>();
        readonly Dictionary<string,SodaDesktopSigninPackageNative.Snapshot> directories=new Dictionary<string,SodaDesktopSigninPackageNative.Snapshot>(StringComparer.Ordinal);
        readonly HashSet<string> entries=new HashSet<string>(new[]{"admin","runs","runtime","quiescence.lock"},StringComparer.Ordinal);
        readonly List<Evidence> retained=new List<Evidence>();bool disposed,checking;
        internal Storage(string slot,Func<bool> scope,Func<string,byte[],bool> policy){this.slot=slot;this.scope=scope;this.policy=policy;try{
            var chain=new List<string>();for(string path=slot;!String.IsNullOrEmpty(path);path=Path.GetDirectoryName(path)){Require(chain.Count<64);chain.Add(path);}chain.Reverse();
            foreach(string path in chain)parents.Add(SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,acl=>policy(path,acl),null));
            foreach(string name in new[]{"admin","runs","runtime"})directories.Add(name,Capture(name));Check();
        }catch{Dispose();throw;}}
        internal string PathOf(string name){return Path.Combine(slot,name);}
        internal SodaDesktopSigninPackageNative.Snapshot Capture(string name){string path=PathOf(name);using(var file=SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,acl=>policy(path,acl),null))return file.Before;}
        internal void Check(){Require(!disposed&&!checking);checking=true;try{
            Require(scope());foreach(var parent in parents)SodaDesktopSigninPackageNative.CheckCore(parent,acl=>policy(parent.Path,acl));
            string[] actual=Directory.GetFileSystemEntries(slot);Require(actual.Length==entries.Count);foreach(string path in actual)Require(entries.Contains(Path.GetFileName(path)));
            foreach(var pair in directories)Require(pair.Value.Same(Capture(pair.Key),true,0));
            Require(Directory.GetFileSystemEntries(PathOf("runtime")).Length==0);foreach(var file in retained)file.Check(policy);Require(scope());
        }finally{checking=false;}}
        internal void Exact(string name,string child){Check();string[] actual=Directory.GetFileSystemEntries(PathOf(name));Require(actual.Length==1&&Path.GetFileName(actual[0])==child);}
        internal void Write(string name,byte[] bytes,Func<string,FileStream> create){
            Check();Require(!entries.Contains(name)&&SodaDesktopSigninPackageNative.Absent(PathOf(name)));
            SodaDesktopSigninVault.FileFacts written;using(var file=create(PathOf(name))){file.Write(bytes,0,bytes.Length);file.Flush(true);written=SodaDesktopSigninVault.Facts(file.SafeFileHandle);}entries.Add(name);
            var evidence=new Evidence(PathOf(name),8192,policy);try{Require(written.Same(SodaDesktopSigninVault.Facts(evidence.File.Handle))&&Convert.ToBase64String(evidence.Bytes)==Convert.ToBase64String(bytes));retained.Add(evidence);}catch{evidence.Dispose();throw;}Check();
        }
        internal void Move(string from,string to){
            Check();Require(directories.ContainsKey(from)&&!entries.Contains(to)&&SodaDesktopSigninPackageNative.Absent(PathOf(to)));var before=directories[from];Require(before.Same(Capture(from),true,0));Check();
            if(!MoveFileExW(PathOf(from),PathOf(to),8))throw new InvalidOperationException("Unclaimed archive rename failed: "+Marshal.GetLastWin32Error());entries.Remove(from);entries.Add(to);directories.Remove(from);directories.Add(to,before);Check();
        }
        internal void Create(string name,Action<string> create){Check();Require(!entries.Contains(name)&&SodaDesktopSigninPackageNative.Absent(PathOf(name)));create(PathOf(name));entries.Add(name);directories.Add(name,Capture(name));Check();}
        internal void ClearMarker(){
            Check();var marker=retained.Find(file=>Path.GetFileName(file.File.Path)=="install.transition");Require(marker!=null);marker.Check(policy);
            using(var actual=new Evidence(PathOf("install.transition"),8192,policy))Require(marker.File.Before.Same(actual.File.Before,false,8192)&&Hash(actual.Bytes)==Hash(marker.Bytes));Check();
            File.Delete(PathOf("install.transition"));retained.Remove(marker);marker.Dispose();entries.Remove("install.transition");Check();
        }
        public void Dispose(){if(disposed)return;disposed=true;foreach(var file in retained)file.Dispose();SodaDesktopSigninPackageNative.Release(parents);}
    }
    static void MatchArchive(Evidence original,string path,string hash,Func<string,byte[],bool> policy){using(var actual=new Evidence(path,16384,policy))Require(original.File.Before.Same(actual.File.Before,false,16384)&&Hash(actual.Bytes)==hash);}
    internal static IDictionary<string,object> Core(string owner,string manifest,string slot,string runHash,string adminHash,Func<bool> stopped,Func<bool> current,Func<SodaDesktopSigninQuiescence.Pin> barrier,Func<string,byte[],bool> policy,Action<string> createDirectory,Func<string,FileStream> createFile,Func<long> wall,Action<string> afterStep=null){
        Require(current()&&stopped());long began=wall(),last=began;
        Func<bool> owned=()=>{long now=wall();bool ok=current()&&stopped()&&now>=last&&now<=9007199254740991;last=now;return ok;};
        using(var pin=barrier())using(var exclusive=pin.Exclusive()){
            string fingerprint=exclusive.Fingerprint;Func<bool> retained=()=>owned()&&exclusive.Current()&&exclusive.Fingerprint==fingerprint;
            using(var storage=new Storage(slot,retained,policy)){
                storage.Exact("runs","intent.pending");storage.Exact("admin","admin.pending");
                using(var run=new Evidence(storage.PathOf("runs/intent.pending"),16384,policy))using(var admin=new Evidence(storage.PathOf("admin/admin.pending"),65536,policy)){
                    var intent=Verify(run.Bytes,admin.Bytes,owner,manifest,fingerprint,runHash,adminHash,began);
                    Func<bool> original=()=>{storage.Check();run.Check(policy);admin.Check(policy);storage.Exact("runs","intent.pending");storage.Exact("admin","admin.pending");return retained();};Require(original());
                    string id=Guid.NewGuid().ToString("N"),runs="runs-unclaimed-"+id,admins="admin-unclaimed-"+id,receipt="unclaimed-"+id+".json";
                    var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",fingerprint},{"createdAt",began}},owner);
                    var fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-unclaimed-initialize-cancel"},{"ownerSid",owner},{"cancelId",id},{"packageSha256",manifest},{"barrierSha256",fingerprint},{"runId",intent.RunId},{"runFileSha256",runHash},{"adminFileSha256",adminHash},{"adminNonce",intent.Field("adminNonce")},{"runsArchive",runs},{"adminArchive",admins},{"runsDirectoryId",DirectoryId(storage.Capture("runs"))},{"adminDirectoryId",DirectoryId(storage.Capture("admin"))},{"newRunId",initial.RunId},{"newBoundarySha256",initial.Digest()},{"canceledAt",began}};
                    byte[] marker=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(fields));
                    try{
                        Require(original());storage.Write("install.transition",marker,createFile);if(afterStep!=null)afterStep("marker-written");Require(original());
                        run.Check(policy);run.ReleaseForMove();storage.Move("runs",runs);if(afterStep!=null)afterStep("runs-archived");run.RebindArchive(storage.PathOf(runs+"/intent.pending"),runHash,policy);storage.Exact(runs,"intent.pending");
                        admin.Check(policy);storage.Exact("admin","admin.pending");admin.ReleaseForMove();storage.Move("admin",admins);if(afterStep!=null)afterStep("admin-archived");admin.RebindArchive(storage.PathOf(admins+"/admin.pending"),adminHash,policy);storage.Exact(admins,"admin.pending");
                        Func<bool> archived=()=>{storage.Check();MatchArchive(run,storage.PathOf(runs+"/intent.pending"),runHash,policy);MatchArchive(admin,storage.PathOf(admins+"/admin.pending"),adminHash,policy);storage.Exact(runs,"intent.pending");storage.Exact(admins,"admin.pending");return retained();};Require(archived());
                        storage.Create("runs",createDirectory);storage.Create("admin",createDirectory);if(afterStep!=null)afterStep("new-directories");Require(archived());
                        using(var journal=new SodaDesktopSigninRunJournal(storage.PathOf("runs"),owner,manifest,fingerprint,SodaDesktopSigninRunJournal.Role.Installer,archived,acl=>policy(storage.PathOf("runs"),acl),new string[0],createFile:createFile))journal.Initialize(initial);
                        if(afterStep!=null)afterStep("initial-written");
                        Action complete=()=>{Require(archived());Require(Directory.GetFileSystemEntries(storage.PathOf("admin")).Length==0);using(var journal=new SodaDesktopSigninRunJournal(storage.PathOf("runs"),owner,manifest,fingerprint,SodaDesktopSigninRunJournal.Role.Reader,archived,acl=>policy(storage.PathOf("runs"),acl),new string[0]))Require(journal.State()=="initial"&&journal.CleanBoundary().Digest()==initial.Digest());Require(archived());};
                        complete();storage.Write(receipt,marker,createFile);if(afterStep!=null)afterStep("receipt-written");complete();storage.ClearMarker();complete();
                        return new Dictionary<string,object>{{"state","expired-unclaimed-initialize-canceled"},{"started",false},{"packageSha256",manifest},{"runsArchive",runs},{"adminArchive",admins},{"receipt",receipt},{"newRunId",initial.RunId}};
                    }finally{Array.Clear(marker,0,marker.Length);}
                }
            }
        }
    }
}
