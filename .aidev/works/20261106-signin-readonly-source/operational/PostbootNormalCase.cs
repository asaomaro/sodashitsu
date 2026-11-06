// Incident-only cancellation of the exact preserved preboot normal admission.
// Does not claim clean exit, repair keys, start services, or generalize recovery.
using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using R=SodaDesktopSigninRestartRecovery;
using P=SodaDesktopSigninPartialIdentityProof;
public static class SodaPostbootNormalCase {
 const string Owner="S-1-5-21-2255109513-3773794534-3440117263-1001",Manifest="b499ce681b2f80f6c06ac8f653ac2a50b1bfa41f54b7ce32ff9655f6ee040d1c";
 const string Inventory="b057611918973eb18d56507bb7f112027ded3bf35448b9b1069de53a7a6587a8",Runtime="d583496c6105064295872c1e31d5c2c222deea3ac2f0df4679c294f1a84da3a1",RunHash="b2a69720b3214b7c8d7d1437b75903859c7665237d82d6c24870b61379aa93a8";
 const string Prior="1332:134383923655878210",Current="1360:134384363526317122",HistoryName="normal-case-78da4556a9f44d24ba7b9789595aa88a.json",HistoryHash="42115f363e86950c0fb1b631bb570fb3014d80af0b16eec9794b51da985de2fc";
 static void Need(bool value){if(!value)throw new InvalidOperationException("Exact postboot normal incident evidence required");}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
 public static IDictionary<string,object> Run(string action){
  Need((action=="inspect"||action=="recover")&&Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true));var clock=Stopwatch.StartNew();
  using(var mutex=SodaDesktopSigninControllerMutex.Acquire(Owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(Owner,Manifest)){
   Func<bool> scope=()=>clock.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
   using(var scm=SodaDesktopSigninScm.Open(Owner,false,scope))using(var critical=new R.ScmInstance(scope)){
    Need(critical.Identity==Current);string slot=SodaDesktopSigninVault.StateDirectory(Owner);
    Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
    Func<bool> active=()=>{SodaDesktopSigninServicePolicy.Inspect(Owner);return scope()&&critical.Current()&&critical.Identity==Current;};
    // 1077 is the OS proof of no service start attempt in this boot. FILETIME
    // ordering is only an additional check; wall-clock ordering alone is not proof.
    Func<bool> neverStarted=()=>{var state=scm.Query();return state.State==1&&state.Pid==0&&state.Exit==1077&&state.Specific==0;};
    return Core(action,slot,Owner,Manifest,Inventory,Runtime,RunHash,HistoryName,HistoryHash,Prior,Current,active,neverStarted,()=>SodaDesktopSigninQuiescence.Open(Owner),policy,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile,()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
   }
  }
 }
 // Generated ordinary-file tests in the same assembly inject only OS seams.
 internal static IDictionary<string,object> Core(string action,string slot,string owner,string manifest,string inventory,string runtimeHash,string runHash,string historyName,string historyHash,string prior,string current,Func<bool> scope,Func<bool> neverStarted,Func<SodaDesktopSigninQuiescence.Pin> open,Func<string,byte[],bool> policy,Action<string> mkdir,Func<string,FileStream> create,Func<long> wall,Action<string> after=null){
  Need(action=="inspect"||action=="recover");Need(scope()&&neverStarted());R.RequireNewInstance(prior,current);
  string runs=Path.Combine(slot,"runs"),admin=Path.Combine(slot,"admin"),runtime=Path.Combine(slot,"runtime"),marker=Path.Combine(slot,"install.transition");Need(SodaDesktopSigninPackageNative.Absent(marker));
  using(var pin=open())using(var exclusive=pin.Exclusive()){
   string barrier=exclusive.Fingerprint;Func<bool> active=()=>scope()&&neverStarted()&&exclusive.Current()&&exclusive.Fingerprint==barrier;
   Need(active());R.Exact(runs,"intent.claimed","started","observation");R.Exact(admin);
   SodaDesktopSigninRunRecord intent,started;
   byte[] bytes=R.Read(Path.Combine(runs,"intent.claimed"),policy);try{Need(R.Hash(bytes)==runHash);intent=SodaDesktopSigninRunRecord.Unprotect(bytes,owner,"intent");}finally{Array.Clear(bytes,0,bytes.Length);}
   Need((string)intent.Field("packageSha256")==manifest&&(string)intent.Field("barrierSha256")==barrier&&(string)intent.Field("mode")=="normal"&&(long)intent.Field("expiresAt")<=wall());
   using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runs,a),new string[0])){Need(journal.State()=="observed");started=journal.StartedRecord();Need(started.RunId==intent.RunId);}
   ulong oldAt=UInt64.Parse(prior.Split(':')[1],CultureInfo.InvariantCulture),newAt=UInt64.Parse(current.Split(':')[1],CultureInfo.InvariantCulture),created=UInt64.Parse((string)started.Field("createdFiletime"),CultureInfo.InvariantCulture);Need(oldAt<newAt&&created>=oldAt&&created<newAt);
   bytes=R.Read(Path.Combine(slot,historyName),policy);try{
    Need(R.Hash(bytes)==historyHash);var history=P.Parse(bytes,16384);
    Need((string)history["ownerSid"]==owner&&(string)history["barrierSha256"]==barrier&&(string)history["newScmInstance"]==prior&&(string)history["runtimeSha256"]==runtimeHash&&(bool)history["keysPreserved"]&&!(bool)history["cleanExitClaimed"]&&(string)history["originalOutcome"]=="unknown"&&Convert.ToInt64(history["recoveredAt"])<=(long)intent.Field("issuedAt"));
   }finally{Array.Clear(bytes,0,bytes.Length);}
   var names=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();var historyTrees=new Dictionary<string,string>();foreach(string name in names.Except(new[]{"admin","runs","runtime","quiescence.lock"}))using(var tree=new R.Tree(Path.Combine(slot,name),policy,active))historyTrees.Add(name,tree.Digest());
   using(var saved=new R.Tree(runtime,policy,active))using(var savedAdmin=new R.Tree(admin,policy,active)){
    Need(saved.Digest()==runtimeHash);string id=Guid.NewGuid().ToString("N"),archive="runs-postboot-normal-"+id,receipt="postboot-normal-"+id+".json",markerHash,runDigest,receiptHash;
    var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"createdAt",wall()}},owner);
    var fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-postboot-normal-case"},{"ownerSid",owner},{"packageSha256",manifest},{"inventorySha256",inventory},{"runtimeSha256",runtimeHash},{"barrierSha256",barrier},{"runFileSha256",runHash},{"runId",intent.RunId},{"priorScmInstance",prior},{"currentScmInstance",current},{"serviceExit",1077},{"historyFile",historyName},{"historySha256",historyHash},{"runsArchive",archive},{"newRunId",initial.RunId},{"preparedAt",wall()},{"originalOutcome","unknown"},{"keysPreserved",true},{"cleanExitClaimed",false}};
    using(var tree=new R.Tree(slot,policy,active)){
     Need(tree.Digest()==inventory&&active());if(action=="inspect")return new Dictionary<string,object>{{"state","inspected"},{"mutates",false},{"runId",intent.RunId},{"scmInstance",current}};
     Need(SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,archive))&&SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,receipt)));
     using(var originalRuns=new R.Tree(runs,policy,active))runDigest=originalRuns.Digest();
     bytes=R.Encode(fields);markerHash=R.Hash(bytes);R.Write(marker,bytes,policy,create);using(var fresh=new R.Tree(slot,policy,active))tree.Same(fresh);Need(active());if(after!=null)after("marker-written");using(var fresh=new R.Tree(slot,policy,active))tree.Same(fresh);Need(active());
    }
    using(var tree=new R.Tree(runs,policy,active))Need(tree.Digest()==runDigest);Need(active()&&R.Hash(R.Read(marker,policy))==markerHash);
    Need(MoveFileExW(runs,Path.Combine(slot,archive),8));if(after!=null)after("runs-archived");Need(active());mkdir(runs);if(after!=null)after("directory-created");Need(active());
    using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Installer,active,a=>policy(runs,a),new string[0],createFile:create))journal.Initialize(initial);if(after!=null)after("initial-written");Need(active());
    fields.Add("recordedAt",wall());fields.Add("newBoundarySha256",initial.Digest());bytes=R.Encode(fields);receiptHash=R.Hash(bytes);R.Write(Path.Combine(slot,receipt),bytes,policy,create);if(after!=null)after("receipt-written");Need(active());
    using(var tree=new R.Tree(Path.Combine(slot,archive),policy,active))Need(tree.Digest()==runDigest);
    foreach(var item in historyTrees)using(var tree=new R.Tree(Path.Combine(slot,item.Key),policy,active))Need(tree.Digest()==item.Value);
    R.Exact(admin);R.Exact(slot,names.Concat(new[]{archive,receipt,"install.transition"}).ToArray());using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runs,a),new string[0]))Need(journal.State()=="initial"&&journal.CleanBoundary().Digest()==initial.Digest());
    using(var tree=new R.Tree(runtime,policy,active))Need(tree.Digest()==runtimeHash);saved.Check();savedAdmin.Check();Need(active()&&R.Hash(R.Read(marker,policy))==markerHash&&R.Hash(R.Read(Path.Combine(slot,receipt),policy))==receiptHash);File.Delete(marker);Need(active());R.Exact(slot,names.Concat(new[]{archive,receipt}).ToArray());
    return new Dictionary<string,object>{{"state","recovered"},{"originalOutcome","unknown"},{"cleanExitClaimed",false},{"keysPreserved",true},{"started",false},{"runsArchive",archive},{"receipt",receipt}};
   }
  }
 }
}
