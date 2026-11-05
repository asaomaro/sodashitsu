// Explicit recovery for an expired, claimed initialization with exactly one
// preserved identity. A new critical SCM instance and fresh SYSTEM proof are
// mandatory. Never replays the request, resets keys or claims a clean exit.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using R=SodaDesktopSigninRestartRecovery;
using P=SodaDesktopSigninPartialIdentityProof;
public static class SodaDesktopSigninClaimedInitializeRecovery {
    static Exception Failure(){return new InvalidOperationException("Claimed initialization requires bound restart recovery with its original identity");}
    static void Require(bool value){if(!value)throw Failure();}
    static bool Hex(string value){return value!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,"\\A[a-f0-9]{64}\\z");}
    internal static bool TicketArgument(string action,string ticketHash){return action=="recover"?Hex(ticketHash):string.IsNullOrEmpty(ticketHash);}
    static long Wall(){return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
    internal static void Layout(string slot,bool marker){
        var names=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();
        Func<string,string> one=prefix=>{var found=names.Where(n=>System.Text.RegularExpressions.Regex.IsMatch(n,"\\A"+prefix+"[a-f0-9]{32}\\z")).ToArray();Require(found.Length==1);return found[0];};
        var old=names.Where(n=>System.Text.RegularExpressions.Regex.IsMatch(n,"\\Aruns-old-[a-f0-9]{32}\\z")).ToArray();Require(old.Length==2);
        string canceled=one("runs-unclaimed-"),cancelId=canceled.Substring("runs-unclaimed-".Length),abnormal=one("runs-abnormal-"),abnormalId=abnormal.Substring("runs-abnormal-".Length);
        var allowed=new List<string>{"admin","runs","runtime","quiescence.lock",canceled,"admin-unclaimed-"+cancelId,"unclaimed-"+cancelId+".json",abnormal,"admin-abnormal-"+abnormalId,"abnormal-restart-"+abnormalId+".json"};allowed.AddRange(old);if(marker)allowed.Add("install.transition");R.Exact(slot,allowed.ToArray());
        foreach(string n in old)R.Exact(Path.Combine(slot,n),"initial");R.Exact(Path.Combine(slot,canceled),"intent.pending");R.Exact(Path.Combine(slot,"admin-unclaimed-"+cancelId),"admin.pending");R.Exact(Path.Combine(slot,abnormal),"intent.claimed","started","observation");R.Exact(Path.Combine(slot,"admin-abnormal-"+abnormalId),"admin.pending");
        R.Exact(Path.Combine(slot,"admin"),"admin.claimed");R.Exact(Path.Combine(slot,"runs"),"intent.claimed","started","observation");P.Layout(Path.Combine(slot,"runtime"));
    }
    internal static void History(string slot,string owner,string barrier,Func<string,byte[],bool> policy,Func<bool> current,Func<long> wall){
        var names=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();string cancel=names.Single(n=>n.StartsWith("runs-unclaimed-",StringComparison.Ordinal)),cid=cancel.Substring("runs-unclaimed-".Length),abnormal=names.Single(n=>n.StartsWith("runs-abnormal-",StringComparison.Ordinal)),aid=abnormal.Substring("runs-abnormal-".Length);
        var canceled=P.Parse(R.Read(Path.Combine(slot,"unclaimed-"+cid+".json"),policy),16384);
        P.Keys(canceled,"version","purpose","ownerSid","cancelId","packageSha256","barrierSha256","runId","runFileSha256","adminFileSha256","adminNonce","runsArchive","adminArchive","runsDirectoryId","adminDirectoryId","newRunId","newBoundarySha256","canceledAt");
        Require(canceled["version"] is int&&(int)canceled["version"]==1&&(string)canceled["purpose"]=="desktop-signin-unclaimed-initialize-cancel"&&(string)canceled["ownerSid"]==owner&&(string)canceled["barrierSha256"]==barrier&&(string)canceled["cancelId"]==cid&&(string)canceled["runsArchive"]==cancel&&(string)canceled["adminArchive"]=="admin-unclaimed-"+cid);
        var oldIntent=SodaDesktopSigninUnclaimedRecovery.Verify(R.Read(Path.Combine(slot,cancel,"intent.pending"),policy),R.Read(Path.Combine(slot,"admin-unclaimed-"+cid,"admin.pending"),policy),owner,(string)canceled["packageSha256"],barrier,(string)canceled["runFileSha256"],(string)canceled["adminFileSha256"],wall());Require(oldIntent.RunId==(string)canceled["runId"]&&(string)oldIntent.Field("adminNonce")== (string)canceled["adminNonce"]);
        var prior=P.Parse(R.Read(Path.Combine(slot,"abnormal-restart-"+aid+".json"),policy),16384);
        string[] baseKeys={"version","purpose","ownerSid","packageSha256","barrierSha256","runId","runFileSha256","adminFileSha256","scmInstance","inventorySha256","recoveryId","boundAt"};
        P.Keys(prior,baseKeys.Concat(new[]{"ticketSha256","newScmInstance","newRunId","runsArchive","adminArchive","recoveredAt","cleanExitClaimed"}).ToArray());
        Require(prior["version"] is int&&(int)prior["version"]==1&&(string)prior["purpose"]=="desktop-signin-abnormal-restart"&&(string)prior["ownerSid"]==owner&&(string)prior["barrierSha256"]==barrier&&(string)prior["recoveryId"]==aid&&(string)prior["runsArchive"]==abnormal&&(string)prior["adminArchive"]=="admin-abnormal-"+aid&&prior["cleanExitClaimed"] is bool&&!(bool)prior["cleanExitClaimed"]);
        var bound=new SortedDictionary<string,object>(StringComparer.Ordinal);foreach(string key in baseKeys)bound.Add(key,prior[key]);Require(R.Hash(R.Encode(bound))==(string)prior["ticketSha256"]);R.RequireNewInstance((string)prior["scmInstance"],(string)prior["newScmInstance"]);
        Require(Convert.ToInt64(canceled["canceledAt"])<=Convert.ToInt64(prior["boundAt"])&&Convert.ToInt64(prior["boundAt"])<=Convert.ToInt64(prior["recoveredAt"])&&Convert.ToInt64(prior["recoveredAt"])<=wall());
        var failed=SodaDesktopSigninUnclaimedRecovery.Verify(R.Read(Path.Combine(slot,abnormal,"intent.claimed"),policy),R.Read(Path.Combine(slot,"admin-abnormal-"+aid,"admin.pending"),policy),owner,(string)prior["packageSha256"],barrier,(string)prior["runFileSha256"],(string)prior["adminFileSha256"],wall());
        using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(slot,abnormal),owner,(string)prior["packageSha256"],barrier,SodaDesktopSigninRunJournal.Role.Reader,current,a=>policy(Path.Combine(slot,abnormal),a),new string[0]))Require(journal.State()=="observed"&&journal.StartedRecord().RunId==failed.RunId&&failed.RunId==(string)prior["runId"]);
        var boundaries=names.Where(n=>n.StartsWith("runs-old-",StringComparison.Ordinal)).Select(n=>SodaDesktopSigninRunRecord.Unprotect(R.Read(Path.Combine(slot,n,"initial"),policy),owner,"initial")).ToArray();
        Require(boundaries.Count(v=>v.RunId==(string)canceled["newRunId"]&&v.Digest()==(string)canceled["newBoundarySha256"]&&(string)v.Field("barrierSha256")==barrier)==1);
        Require(boundaries.Count(v=>v.RunId==(string)prior["newRunId"]&&(string)v.Field("packageSha256")== (string)prior["packageSha256"]&&(string)v.Field("barrierSha256")==barrier)==1);
        Require((string)canceled["newRunId"]!=(string)prior["newRunId"]);
    }
    internal static Dictionary<string,object> Proof(string owner,string manifest,string nonce,string digest,string critical,string barrier,string runtime,Func<string,byte[],bool> policy,Func<bool> current,Func<long> wall,Func<string,string,string> proofDirectory=null){
        Require(Hex(digest)&&current());string directory=(proofDirectory??P.ProofDirectory)(owner,nonce);
        using(var held=SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,a=>policy(directory,a),null)){
            R.Exact(directory,"proof.json");byte[] bytes=R.Read(Path.Combine(directory,"proof.json"),policy);Require(R.Hash(bytes)==digest);var p=P.Parse(bytes,16384);
            P.Keys(p,"version","purpose","ownerSid","packageSha256","nonce","scmInstance","barrierSha256","runtimeSha256","cipherSha256","provider","issuedAt");
            Require(p["version"] is int&&(int)p["version"]==1&&(p["purpose"] as string)=="desktop-signin-partial-identity-proof"&&(p["ownerSid"] as string)==owner&&(p["packageSha256"] as string)==manifest&&(p["nonce"] as string)==nonce&&(p["scmInstance"] as string)==critical&&(p["barrierSha256"] as string)==barrier);
            Require((p["issuedAt"] is long||p["issuedAt"] is int)&&wall()>=Convert.ToInt64(p["issuedAt"])&&wall()-Convert.ToInt64(p["issuedAt"])<90000&&Hex(p["runtimeSha256"] as string)&&Hex(p["provider"] as string));
            using(var tree=new R.Tree(runtime,policy,current))Require(tree.Digest()==(string)p["runtimeSha256"]);
            Require(R.Hash(R.Read(Path.Combine(runtime,"desktop-endpoint","identity.json"),policy))==(p["cipherSha256"] as string)&&current());return p;
        }
    }
    public static IDictionary<string,object> Run(string action,string owner,string manifest,string runHash,string claimHash,string proofNonce,string proofHash,string ticketHash){
        Require((action=="inspect"||action=="bind"||action=="recover")&&Hex(manifest)&&Hex(runHash)&&Hex(claimHash)&&Hex(proofHash)&&TicketArgument(action,ticketHash)&&Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));
        var timer=Stopwatch.StartNew();using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> scope=()=>timer.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
            using(var scm=SodaDesktopSigninScm.Open(owner,false,scope))using(var critical=new R.ScmInstance(scope)){
                string slot=SodaDesktopSigninVault.StateDirectory(owner),proofRoot=P.ProofDirectory(owner,proofNonce);
                Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||p==proofRoot||p.StartsWith(proofRoot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
                Func<bool> current=()=>{var state=scm.Query();SodaDesktopSigninServicePolicy.Inspect(owner);return scope()&&critical.Current()&&state.State==1&&state.Pid==0;};
                return Core(action,owner,manifest,runHash,claimHash,proofNonce,proofHash,ticketHash,slot,critical.Identity,current,()=>{var s=scm.Query();return s.Exit==1066&&s.Specific==1;},()=>SodaDesktopSigninQuiescence.Open(owner),policy,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile,Wall);
            }
        }
    }
    internal static IDictionary<string,object> Core(string action,string owner,string manifest,string runHash,string claimHash,string proofNonce,string proofHash,string ticketHash,string slot,string critical,Func<bool> current,Func<bool> failedScm,Func<SodaDesktopSigninQuiescence.Pin> barrierOpen,Func<string,byte[],bool> policy,Action<string> createDirectory,Func<string,FileStream> createFile,Func<long> wall,Func<string,string,string> proofDirectory=null,Action<string> afterStep=null){
        Require(current());string marker=Path.Combine(slot,"install.transition"),runtime=Path.Combine(slot,"runtime"),runsPath=Path.Combine(slot,"runs"),adminPath=Path.Combine(slot,"admin");
        using(var pin=barrierOpen())using(var exclusive=pin.Exclusive()){
            string barrier=exclusive.Fingerprint;Func<bool> active=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==barrier;
            Layout(slot,action=="recover");History(slot,owner,barrier,policy,active,wall);var beforeNames=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();var historyHashes=new Dictionary<string,string>();foreach(string n in beforeNames.Except(new[]{"admin","runs","runtime","quiescence.lock","install.transition"}))using(var t=new R.Tree(Path.Combine(slot,n),policy,active))historyHashes[n]=t.Digest();var intent=SodaDesktopSigninUnclaimedRecovery.Verify(R.Read(Path.Combine(runsPath,"intent.claimed"),policy),R.Read(Path.Combine(adminPath,"admin.claimed"),policy),owner,manifest,barrier,runHash,claimHash,wall());
            using(var journal=new SodaDesktopSigninRunJournal(runsPath,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runsPath,a),new string[0]))Require(journal.State()=="observed"&&journal.StartedRecord().RunId==intent.RunId);
            var proof=Proof(owner,manifest,proofNonce,proofHash,critical,barrier,runtime,policy,active,wall,proofDirectory);
            using(var runtimeTree=new R.Tree(runtime,policy,active)){
                string runtimeHash=runtimeTree.Digest(),provider=(string)proof["provider"];SortedDictionary<string,object> fields;string inventory;
                using(var tree=new R.Tree(slot,policy,active)){
                    inventory=tree.Digest();
                    if(action=="inspect")return new Dictionary<string,object>{{"state","claimed-initialize-inspected"},{"runId",intent.RunId},{"provider",provider},{"runtimeSha256",runtimeHash},{"inventorySha256",inventory},{"scmInstance",critical},{"mutates",false}};
                    if(action=="bind"){
                        Require(SodaDesktopSigninPackageNative.Absent(marker)&&failedScm());
                        fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-claimed-initialize-restart"},{"ownerSid",owner},{"packageSha256",manifest},{"barrierSha256",barrier},{"runId",intent.RunId},{"runFileSha256",runHash},{"claimFileSha256",claimHash},{"scmInstance",critical},{"inventorySha256",inventory},{"runtimeSha256",runtimeHash},{"provider",provider},{"proofNonce",proofNonce},{"proofSha256",proofHash},{"recoveryId",Guid.NewGuid().ToString("N")},{"boundAt",wall()}};
                        byte[] ticket=R.Encode(fields);R.Write(marker,ticket,policy,createFile);using(var after=new R.Tree(slot,policy,active))tree.Same(after);runtimeTree.Check();Require(active());
                        return new Dictionary<string,object>{{"state","claimed-initialize-restart-bound"},{"ticketSha256",R.Hash(ticket)},{"provider",provider},{"runtimeSha256",runtimeHash},{"startsService",false},{"reboots",false}};
                    }
                    byte[] saved=R.Read(marker,policy);Require(R.Hash(saved)==ticketHash);var raw=P.Parse(saved,16384);
                    P.Keys(raw,"version","purpose","ownerSid","packageSha256","barrierSha256","runId","runFileSha256","claimFileSha256","scmInstance","inventorySha256","runtimeSha256","provider","proofNonce","proofSha256","recoveryId","boundAt");
                    fields=new SortedDictionary<string,object>(raw,StringComparer.Ordinal);Require(R.Hash(R.Encode(fields))==ticketHash);
                    Require(fields["version"] is int&&(int)fields["version"]==1&&(string)fields["purpose"]=="desktop-signin-claimed-initialize-restart"&&(string)fields["ownerSid"]==owner&&(string)fields["packageSha256"]==manifest&&(string)fields["barrierSha256"]==barrier&&(string)fields["runId"]==intent.RunId&&(string)fields["runFileSha256"]==runHash&&(string)fields["claimFileSha256"]==claimHash&&(string)fields["inventorySha256"]==inventory&&(string)fields["runtimeSha256"]==runtimeHash&&(string)fields["provider"]==provider);
                    R.RequireNewInstance((string)fields["scmInstance"],critical);Require((string)fields["proofNonce"]!=proofNonce&&Hex(fields["proofSha256"] as string)&&Convert.ToInt64(fields["boundAt"])<=Convert.ToInt64(proof["issuedAt"]));
                    Require(System.Text.RegularExpressions.Regex.IsMatch(fields["recoveryId"] as string??"","\\A[a-f0-9]{32}\\z"));
                }
                string id=(string)fields["recoveryId"],runs="runs-claimed-"+id,admins="admin-claimed-"+id;string runsHash,adminsHash;
                using(var tree=new R.Tree(runsPath,policy,active))runsHash=tree.Digest();using(var tree=new R.Tree(adminPath,policy,active))adminsHash=tree.Digest();
                using(var tree=new R.Tree(slot,policy,active))Require(tree.Digest()==inventory);Require(R.Hash(R.Read(marker,policy))==ticketHash&&active());
                Require(SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,runs))&&SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,admins)));
                Require(MoveFileExW(runsPath,Path.Combine(slot,runs),8));if(afterStep!=null)afterStep("runs-archived");Require(active());Require(MoveFileExW(adminPath,Path.Combine(slot,admins),8));if(afterStep!=null)afterStep("admin-archived");Require(active());
                createDirectory(runsPath);createDirectory(adminPath);if(afterStep!=null)afterStep("new-directories");
                var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"createdAt",wall()}},owner);
                using(var journal=new SodaDesktopSigninRunJournal(runsPath,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Installer,active,a=>policy(runsPath,a),new string[0],createFile:createFile))journal.Initialize(initial);if(afterStep!=null)afterStep("initial-written");
                var receipt=new SortedDictionary<string,object>(fields,StringComparer.Ordinal){{"ticketSha256",ticketHash},{"newScmInstance",critical},{"freshProofNonce",proofNonce},{"freshProofSha256",proofHash},{"newRunId",initial.RunId},{"runsArchive",runs},{"adminArchive",admins},{"recoveredAt",wall()},{"originalOutcome","unknown"},{"keysPreserved",true},{"cleanExitClaimed",false}};
                R.Write(Path.Combine(slot,"claimed-initialize-"+id+".json"),R.Encode(receipt),policy,createFile);if(afterStep!=null)afterStep("receipt-written");
                using(var tree=new R.Tree(Path.Combine(slot,runs),policy,active))Require(tree.Digest()==runsHash);using(var tree=new R.Tree(Path.Combine(slot,admins),policy,active))Require(tree.Digest()==adminsHash);
                foreach(var item in historyHashes)using(var tree=new R.Tree(Path.Combine(slot,item.Key),policy,active))Require(tree.Digest()==item.Value);R.Exact(adminPath);R.Exact(slot,beforeNames.Concat(new[]{runs,admins,"claimed-initialize-"+id+".json"}).ToArray());using(var journal=new SodaDesktopSigninRunJournal(runsPath,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runsPath,a),new string[0]))Require(journal.State()=="initial"&&journal.CleanBoundary().Digest()==initial.Digest());P.Layout(runtime);using(var tree=new R.Tree(runtime,policy,active))Require(tree.Digest()==runtimeHash);runtimeTree.Check();Require(active()&&R.Hash(R.Read(marker,policy))==ticketHash);File.Delete(marker);Require(active());
                return new Dictionary<string,object>{{"state","claimed-initialize-restart-recovered"},{"provider",provider},{"keysPreserved",true},{"originalOutcome","unknown"},{"started",false},{"cleanExitClaimed",false},{"newRunId",initial.RunId}};
            }
        }
    }
}
