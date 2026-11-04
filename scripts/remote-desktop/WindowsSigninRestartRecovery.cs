// Explicit abnormal-run recovery across a verified critical SCM instance change.
// Never fabricates Host/Node clean-exit or Job-zero evidence; never reboots.
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Diagnostics;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;
public static class SodaDesktopSigninRestartRecovery {
    static Exception Failure(){return new InvalidOperationException("Restart recovery requires unchanged bound abnormal-run evidence and a new critical SCM instance");}
    static void Require(bool value){if(!value)throw Failure();}
    static string Hash(byte[] value){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(value)).Replace("-","").ToLowerInvariant();}
    static byte[] Encode(object value){return new UTF8Encoding(false,true).GetBytes(new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=12}.Serialize(value));}
    static string Id(SodaDesktopSigninPackageNative.Held held){var v=held.Before.Value;return v.Volume.ToString("x8")+v.IndexHigh.ToString("x8")+v.IndexLow.ToString("x8")+v.CreatedHigh.ToString("x8")+v.CreatedLow.ToString("x8");}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern SafeProcessHandle OpenProcess(uint access,bool inherit,uint pid);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool IsProcessCritical(SafeProcessHandle process,out bool critical);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(SafeProcessHandle process,out ulong created,out ulong exited,out ulong kernel,out ulong user);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
    sealed class ScmInstance:IDisposable {
        SafeProcessHandle handle;SodaDesktopSigninProcessEvidence.Pin pin;
        internal readonly string Identity;
        internal ScmInstance(Func<bool> current){
            var candidates=Process.GetProcessesByName("services");try{
                Require(candidates.Length==1);uint pid=checked((uint)candidates[0].Id);handle=OpenProcess(0x00101000,false,pid);Require(handle!=null&&!handle.IsInvalid);
                ulong created,exited,kernel,user;Require(GetProcessTimes(handle,out created,out exited,out kernel,out user)&&created>0);
                pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created.ToString(CultureInfo.InvariantCulture),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"services.exe"),true,current);
                Identity=pid.ToString(CultureInfo.InvariantCulture)+":"+created.ToString(CultureInfo.InvariantCulture);Require(Current());
            }catch{Dispose();throw;}finally{foreach(var p in candidates)p.Dispose();}
        }
        internal bool Current(){bool critical;return pin!=null&&pin.Current()&&IsProcessCritical(handle,out critical)&&critical&&pin.Current();}
        public void Dispose(){if(pin!=null){pin.Dispose();pin=null;}if(handle!=null){handle.Dispose();handle=null;}}
    }
    // Closed bounded snapshot: every descendant is no-follow, single-link,
    // private, identity/hash pinned. Barrier is already held exclusively.
    sealed class Tree:IDisposable {
        readonly string root;readonly Func<string,byte[],bool> policy;readonly Func<bool> current;
        readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();
        readonly SortedDictionary<string,string> entries=new SortedDictionary<string,string>(StringComparer.Ordinal);
        internal Tree(string root,Func<string,byte[],bool> policy,Func<bool> current){this.root=root;this.policy=policy;this.current=current;try{Visit(root,"");Check();}catch{Dispose();throw;}}
        void Visit(string path,string relative){
            Require(current()&&entries.Count<128&&relative.Length<512);bool directory=(File.GetAttributes(path)&FileAttributes.Directory)!=0;
            if(relative=="install.transition")return;
            if(relative=="quiescence.lock"){entries.Add(relative,"exclusive-barrier");return;}
            var file=directory?SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,a=>policy(path,a),null):SodaDesktopSigninPackageNative.OpenRenamableCore(path,65536,a=>policy(path,a));held.Add(file);
            entries.Add(relative,(directory?"d:":"f:")+Id(file)+(directory?"":":"+Hash(Read(file))));
            if(directory)foreach(string child in Directory.GetFileSystemEntries(path).OrderBy(p=>p,StringComparer.Ordinal))Visit(child,relative.Length==0?Path.GetFileName(child):relative+"/"+Path.GetFileName(child));
        }
        static byte[] Read(SodaDesktopSigninPackageNative.Held file){file.Stream.Position=0;var bytes=new byte[checked((int)file.Before.Value.SizeLow)];int at=0;while(at<bytes.Length){int n=file.Stream.Read(bytes,at,bytes.Length-at);Require(n>0);at+=n;}Require(file.Stream.ReadByte()==-1);return bytes;}
        internal string Digest(){Check();return Hash(Encode(entries));}
        internal void Check(){Require(current());foreach(var h in held)SodaDesktopSigninPackageNative.CheckCore(h,a=>policy(h.Path,a));Require(current());}
        internal void Same(Tree other){Require(Digest()==other.Digest());}
        public void Dispose(){SodaDesktopSigninPackageNative.Release(held);}
    }
    static byte[] Read(string path,Func<string,byte[],bool> policy){using(var h=SodaDesktopSigninPackageNative.OpenRenamableCore(path,65536,a=>policy(path,a))){var b=new byte[checked((int)h.Before.Value.SizeLow)];int at=0;while(at<b.Length){int n=h.Stream.Read(b,at,b.Length-at);Require(n>0);at+=n;}Require(h.Stream.ReadByte()==-1);SodaDesktopSigninPackageNative.CheckCore(h,a=>policy(path,a));return b;}}
    static void Write(string path,byte[] bytes,Func<string,byte[],bool> policy,Func<string,FileStream> createFile){using(var f=createFile(path)){f.Write(bytes,0,bytes.Length);f.Flush(true);}Require(Hash(Read(path,policy))==Hash(bytes));}
    static void Exact(string path,params string[] names){var actual=Directory.GetFileSystemEntries(path).Select(Path.GetFileName).OrderBy(p=>p,StringComparer.Ordinal).ToArray();Require(actual.SequenceEqual(names.OrderBy(p=>p,StringComparer.Ordinal)));}
    // This recovery is deliberately limited to the one prior unclaimed cancel
    // plus one completed upgrade history. Other histories need separate review.
    internal static void Slot(string slot,string owner,string barrier,bool marker,string recovered,Func<string,byte[],bool> policy){
        var names=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();
        Func<string,string> one=prefix=>{var found=names.Where(n=>System.Text.RegularExpressions.Regex.IsMatch(n,"\\A"+prefix+"[a-f0-9]{32}\\z")).ToArray();Require(found.Length==1);return found[0];};
        string old=one("runs-old-"),canceled=one("runs-unclaimed-"),cancelId=canceled.Substring("runs-unclaimed-".Length),admins="admin-unclaimed-"+cancelId,receipt="unclaimed-"+cancelId+".json";
        var allowed=new List<string>{"admin","runs","runtime","quiescence.lock",old,canceled,admins,receipt};if(marker)allowed.Add("install.transition");
        if(recovered!=null){allowed.Add("runs-abnormal-"+recovered);allowed.Add("admin-abnormal-"+recovered);allowed.Add("abnormal-restart-"+recovered+".json");}
        Exact(slot,allowed.ToArray());Exact(Path.Combine(slot,old),"initial");Exact(Path.Combine(slot,canceled),"intent.pending");Exact(Path.Combine(slot,admins),"admin.pending");
        var initial=SodaDesktopSigninRunRecord.Unprotect(Read(Path.Combine(slot,old+"/initial"),policy),owner,"initial");Require((string)initial.Field("barrierSha256")==barrier);
        byte[] receiptBytes=Read(Path.Combine(slot,receipt),policy);string text=new UTF8Encoding(false,true).GetString(receiptBytes);Require(!text.Contains("__type"));var fields=new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=4}.DeserializeObject(text) as Dictionary<string,object>;
        Require(fields!=null&&fields.Count==17&&(string)fields["purpose"]=="desktop-signin-unclaimed-initialize-cancel"&&(string)fields["ownerSid"]==owner&&(string)fields["cancelId"]==cancelId&&(string)fields["runsArchive"]==canceled&&(string)fields["adminArchive"]==admins&&(string)fields["barrierSha256"]==barrier);
        var prior=SodaDesktopSigninUnclaimedRecovery.Verify(Read(Path.Combine(slot,canceled+"/intent.pending"),policy),Read(Path.Combine(slot,admins+"/admin.pending"),policy),owner,(string)fields["packageSha256"],barrier,(string)fields["runFileSha256"],(string)fields["adminFileSha256"],DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());Require(prior.RunId==(string)fields["runId"]&&initial.RunId==(string)fields["newRunId"]&&initial.Digest()==(string)fields["newBoundarySha256"]);
    }
    static SodaDesktopSigninRunRecord Verify(string slot,string owner,string manifest,string barrier,string runHash,string adminHash,Func<bool> current,Func<string,byte[],bool> policy){
        Exact(Path.Combine(slot,"runtime"));Exact(Path.Combine(slot,"admin"),"admin.pending");Exact(Path.Combine(slot,"runs"),"intent.claimed","started","observation");
        byte[] intentBytes=Read(Path.Combine(slot,"runs/intent.claimed"),policy),adminBytes=Read(Path.Combine(slot,"admin/admin.pending"),policy);
        var intent=SodaDesktopSigninUnclaimedRecovery.Verify(intentBytes,adminBytes,owner,manifest,barrier,runHash,adminHash,DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(slot,"runs"),owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,current,a=>policy(Path.Combine(slot,"runs"),a),new string[0]))Require(journal.State()=="observed"&&journal.StartedRecord().RunId==intent.RunId);
        return intent;
    }
    internal static void RequireNewInstance(string before,string after){Require(!String.IsNullOrEmpty(before)&&!String.IsNullOrEmpty(after)&&before!=after);}
    // Bind requires no marker. Recover requires its exact externally recorded
    // SHA; same-boot, partial recovery, changed inventory and replay all fail.
    public static IDictionary<string,object> Run(string action,string owner,string manifest,string runHash,string adminHash,string ticketHash){
        Require(action=="bind"||action=="recover");Require(action=="bind"?String.IsNullOrEmpty(ticketHash):System.Text.RegularExpressions.Regex.IsMatch(ticketHash??"","\\A[a-f0-9]{64}\\z"));
        Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));var timer=Stopwatch.StartNew();
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> scope=()=>timer.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
            using(var scm=SodaDesktopSigninScm.Open(owner,false,scope))using(var critical=new ScmInstance(scope)){
                string slot=SodaDesktopSigninVault.StateDirectory(owner),marker=Path.Combine(slot,"install.transition");
                Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
                Func<bool> current=()=>{var s=scm.Query();SodaDesktopSigninServicePolicy.Inspect(owner);return scope()&&critical.Current()&&s.State==1&&s.Pid==0;};
                return Core(action,owner,manifest,runHash,adminHash,ticketHash,slot,critical.Identity,current,()=>{var status=scm.Query();return status.Exit==1066&&status.Specific==1;},()=>SodaDesktopSigninQuiescence.Open(owner),policy,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile);
            }
        }
    }
    // Ordinary-file transaction tests inject OS boundaries only here. The public
    // entry above always retains actual admin/package/SCM/critical-process pins.
    internal static IDictionary<string,object> Core(string action,string owner,string manifest,string runHash,string adminHash,string ticketHash,string slot,string criticalIdentity,Func<bool> current,Func<bool> failedScm,Func<SodaDesktopSigninQuiescence.Pin> barrierOpen,Func<string,byte[],bool> policy,Action<string> createDirectory,Func<string,FileStream> createFile,Action<string> afterStep=null){
        string marker=Path.Combine(slot,"install.transition");Require(current());
                using(var pin=barrierOpen())using(var exclusive=pin.Exclusive()){
                    string barrier=exclusive.Fingerprint;Func<bool> retained=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==barrier;
                    Slot(slot,owner,barrier,action=="recover",null,policy);var intent=Verify(slot,owner,manifest,barrier,runHash,adminHash,retained,policy);
                    byte[] ticket;SortedDictionary<string,object> fields;string inventory;
                    using(var tree=new Tree(slot,policy,retained)){
                        inventory=tree.Digest();
                        if(action=="bind"){
                            Require(SodaDesktopSigninPackageNative.Absent(marker));Require(failedScm());
                            fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-abnormal-restart"},{"ownerSid",owner},{"packageSha256",manifest},{"barrierSha256",barrier},{"runId",intent.RunId},{"runFileSha256",runHash},{"adminFileSha256",adminHash},{"scmInstance",criticalIdentity},{"inventorySha256",inventory},{"recoveryId",Guid.NewGuid().ToString("N")},{"boundAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}};
                            ticket=Encode(fields);tree.Check();Write(marker,ticket,policy,createFile);if(afterStep!=null)afterStep("marker-written");using(var after=new Tree(slot,policy,retained))tree.Same(after);Require(retained());
                            return new Dictionary<string,object>{{"state","abnormal-restart-bound"},{"ticketSha256",Hash(ticket)},{"scmInstance",criticalIdentity},{"startsService",false},{"reboots",false}};
                        }
                        ticket=Read(marker,policy);Require(Hash(ticket)==ticketHash);string text=new UTF8Encoding(false,true).GetString(ticket);Require(!text.Contains("__type"));var raw=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=4}.DeserializeObject(text) as Dictionary<string,object>;Require(raw!=null&&raw.Count==12);fields=new SortedDictionary<string,object>(raw,StringComparer.Ordinal);Require(Hash(Encode(fields))==ticketHash);
                        Require(Convert.ToInt64(fields["version"])==1&&(string)fields["purpose"]=="desktop-signin-abnormal-restart"&&(string)fields["ownerSid"]==owner&&(string)fields["packageSha256"]==manifest&&(string)fields["barrierSha256"]==barrier&&(string)fields["runId"]==intent.RunId&&(string)fields["runFileSha256"]==runHash&&(string)fields["adminFileSha256"]==adminHash&&(string)fields["inventorySha256"]==inventory);
                        RequireNewInstance((string)fields["scmInstance"],criticalIdentity);Require(System.Text.RegularExpressions.Regex.IsMatch((string)fields["recoveryId"],"\\A[a-f0-9]{32}\\z"));Require(Convert.ToInt64(fields["boundAt"])<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                    }
                    // Close descendant directory handles only for the rename;
                    // private parent and exclusive barrier remain continuously held.
                    string id=(string)fields["recoveryId"],runs="runs-abnormal-"+id,admins="admin-abnormal-"+id;
                    string runsPath=Path.Combine(slot,"runs"),adminPath=Path.Combine(slot,"admin");
                    string runsDigest,adminDigest;using(var t=new Tree(runsPath,policy,retained))runsDigest=t.Digest();using(var t=new Tree(adminPath,policy,retained))adminDigest=t.Digest();
                    using(var original=new Tree(slot,policy,retained))Require(original.Digest()==inventory);Require(Hash(Read(marker,policy))==ticketHash&&retained());
                    Require(SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,runs))&&SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,admins)));
                    Require(MoveFileExW(runsPath,Path.Combine(slot,runs),8));if(afterStep!=null)afterStep("runs-archived");Require(retained());Require(MoveFileExW(adminPath,Path.Combine(slot,admins),8));if(afterStep!=null)afterStep("admin-archived");Require(retained());
                    using(var t=new Tree(Path.Combine(slot,runs),policy,retained))Require(t.Digest()==runsDigest);using(var t=new Tree(Path.Combine(slot,admins),policy,retained))Require(t.Digest()==adminDigest);
                    createDirectory(runsPath);createDirectory(adminPath);if(afterStep!=null)afterStep("new-directories");Require(retained());
                    var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}},owner);
                    using(var j=new SodaDesktopSigninRunJournal(runsPath,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Installer,retained,a=>policy(runsPath,a),new string[0],createFile:createFile))j.Initialize(initial);if(afterStep!=null)afterStep("initial-written");
                    var receipt=new SortedDictionary<string,object>(fields,StringComparer.Ordinal){{"ticketSha256",ticketHash},{"newScmInstance",criticalIdentity},{"newRunId",initial.RunId},{"runsArchive",runs},{"adminArchive",admins},{"recoveredAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},{"cleanExitClaimed",false}};
                    string receiptName="abnormal-restart-"+id+".json";Write(Path.Combine(slot,receiptName),Encode(receipt),policy,createFile);if(afterStep!=null)afterStep("receipt-written");Require(retained());
                    using(var t=new Tree(Path.Combine(slot,runs),policy,retained))Require(t.Digest()==runsDigest);using(var t=new Tree(Path.Combine(slot,admins),policy,retained))Require(t.Digest()==adminDigest);
                    using(var j=new SodaDesktopSigninRunJournal(runsPath,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,retained,a=>policy(runsPath,a),new string[0]))Require(j.State()=="initial"&&j.CleanBoundary().Digest()==initial.Digest());Exact(adminPath);Exact(Path.Combine(slot,"runtime"));Slot(slot,owner,barrier,true,id,policy);Require(Hash(Read(marker,policy))==ticketHash&&retained());File.Delete(marker);Slot(slot,owner,barrier,false,id,policy);Require(retained());
                    return new Dictionary<string,object>{{"state","abnormal-restart-recovered"},{"started",false},{"cleanExitClaimed",false},{"receipt",receiptName},{"newRunId",initial.RunId}};
                }
    }
}
