// Exact 6e27/8b7f failed-start archival only. No reset, replay, key mutation,
// clean exit or input-release ACK claim. Not shipped in an installed entry point.
using System;using System.IO;using System.Linq;using System.Diagnostics;using System.Globalization;using System.Collections.Generic;using System.Runtime.InteropServices;
using R=SodaDesktopSigninRestartRecovery;using P=SodaDesktopSigninPartialIdentityProof;
public static class SodaPumpStartupCase {
 const string Owner="S-1-5-21-2255109513-3773794534-3440117263-1001",Manifest="6e27d59e5eae67d1ce0fd98b9d05150b143b61b6239e98e9f3dcb681036b44cf";
 const string Inventory="20526a22efdb043e508ade758ba39a65f06dce196e3727dddaf0031ea99e9392",Runtime="d583496c6105064295872c1e31d5c2c222deea3ac2f0df4679c294f1a84da3a1",RunHash="ff2ba85a512c5986316d6a87fbcbe2d11899fb4d7dea12488e46961d6f1077d3";
 const string StartedHash="79875390a23d4d5533bdd2db94f2b59704f959552c61f013f9e8b0091ce3dbc7",RunId="8b7fbece-051a-40ba-a357-f7bb8b9eb5af",HostCreated="134384628366249707",Current="1268:134384627775760276";
 const string Receipt=@"C:\Program Files\Sodashitsu\.signin-epoch-upgrade-8cad3ff722ee430bb0f3d1b4f6dd03ba\start.json",ReceiptHash="fbaabd96e7d569c3987c722da6b90aadbb714850a6a593f37207218ae6dc9e12";
 static void Need(bool value){if(!value)throw new InvalidOperationException("Exact startup214 incident evidence required");}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out ulong created,out ulong exited,out ulong kernel,out ulong user);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint GetProcessId(IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr process,uint timeout);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 internal sealed class Gone:IDisposable {
  IntPtr handle;readonly uint pid;readonly string created;bool proven;
  internal Gone(uint pid,string created){this.pid=pid;this.created=created;handle=OpenProcess(0x00101000,false,pid);if(handle==IntPtr.Zero){Need(Marshal.GetLastWin32Error()==87);proven=true;}else try{Need(Current());}catch{Dispose();throw;}}
  internal bool Current(){if(proven)return true;ulong at,exit,kernel,user;if(handle==IntPtr.Zero||GetProcessId(handle)!=pid||!GetProcessTimes(handle,out at,out exit,out kernel,out user))return false;
   // A retained handle to a different incarnation proves the protected original
   // no longer exists. Never terminate or inspect the replacement's contents.
   if(at.ToString(CultureInfo.InvariantCulture)!=created){proven=true;return true;}return WaitForSingleObject(handle,0)==0;
  }
  public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}proven=false;}
 }
 public static IDictionary<string,object> Run(string action){
  Need((action=="inspect"||action=="recover")&&Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true));var clock=Stopwatch.StartNew();
  using(var mutex=SodaDesktopSigninControllerMutex.Acquire(Owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(Owner,Manifest)){
   Func<bool> scope=()=>clock.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
   using(var scm=SodaDesktopSigninScm.Open(Owner,false,scope))using(var critical=new R.ScmInstance(scope))using(var gone=new Gone(5140,HostCreated)){
    Need(critical.Identity==Current);string slot=SodaDesktopSigninVault.StateDirectory(Owner);
    Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
    Func<bool> active=()=>{SodaDesktopSigninServicePolicy.Inspect(Owner);return scope()&&critical.Current()&&critical.Identity==Current;};
    // For THIS pinned 6e27 native image only, Specific214 is published after
    // its Run finally confirmed root and aggregate jobs stopped. It is not a
    // successful outcome and is not generalized to other installed packages.
    Func<bool> stopped=()=>{var state=scm.Query();return state.State==1&&state.Pid==0&&state.Exit==1066&&state.Specific==214;};
    return Core(action,slot,Owner,Manifest,Inventory,Runtime,RunHash,StartedHash,RunId,5140,HostCreated,Receipt,ReceiptHash,Current,active,stopped,gone.Current,()=>SodaDesktopSigninQuiescence.Open(Owner),policy,(p,a)=>SodaDesktopSigninQuiescence.Private(a),SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile,()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
   }
  }
 }
 // Generated ordinary-file tests in the same assembly inject only OS seams.
 internal static IDictionary<string,object> Core(string action,string slot,string owner,string manifest,string inventory,string runtimeHash,string runHash,string startedHash,string expectedRunId,long expectedPid,string expectedCreated,string receiptPath,string receiptHash,string current,Func<bool> scope,Func<bool> stopped214,Func<bool> hostGone,Func<SodaDesktopSigninQuiescence.Pin> open,Func<string,byte[],bool> policy,Func<string,byte[],bool> receiptPolicy,Action<string> mkdir,Func<string,FileStream> create,Func<long> wall,Action<string> after=null){
  Need(action=="inspect"||action=="recover");Need(scope()&&stopped214()&&hostGone());
  string runs=Path.Combine(slot,"runs"),admin=Path.Combine(slot,"admin"),runtime=Path.Combine(slot,"runtime"),marker=Path.Combine(slot,"install.transition");Need(SodaDesktopSigninPackageNative.Absent(marker));
  using(var sourceReceipt=SodaDesktopSigninPackageNative.OpenCore(receiptPath,false,true,16384,a=>receiptPolicy(receiptPath,a),null))
  using(var pin=open())using(var exclusive=pin.Exclusive()){
   string barrier=exclusive.Fingerprint;Func<bool> active=()=>scope()&&stopped214()&&hostGone()&&exclusive.Current()&&exclusive.Fingerprint==barrier;
   Need(active());R.Exact(runs,"intent.claimed","started","observation");R.Exact(admin);
   SodaDesktopSigninRunRecord intent,started;
   byte[] bytes=R.Read(Path.Combine(runs,"intent.claimed"),policy);try{Need(R.Hash(bytes)==runHash);intent=SodaDesktopSigninRunRecord.Unprotect(bytes,owner,"intent");}finally{Array.Clear(bytes,0,bytes.Length);}
   Need((string)intent.Field("packageSha256")==manifest&&(string)intent.Field("barrierSha256")==barrier&&(string)intent.Field("mode")=="normal"&&(long)intent.Field("expiresAt")<=wall());
   using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runs,a),new string[0])){Need(journal.State()=="observed");started=journal.StartedRecord();Need(started.RunId==intent.RunId&&intent.RunId==expectedRunId&&started.Digest()==startedHash&&(long)started.Field("pid")==expectedPid&&(string)started.Field("createdFiletime")==expectedCreated);}
   bytes=R.Read(receiptPath,receiptPolicy);try{
    Need(R.Hash(bytes)==receiptHash);var receipt=P.Parse(bytes,16384);P.Keys(receipt,"action","ok","code","receipt","stderrLength");
    Need((string)receipt["action"]=="start"&&(bool)receipt["ok"]&&Convert.ToInt64(receipt["code"])==0&&Convert.ToInt64(receipt["stderrLength"])==0);
    var ack=receipt["receipt"] as Dictionary<string,object>;Need(ack!=null);P.Keys(ack,"state","journal","runId");Need((string)ack["state"]=="observation-acknowledged"&&(string)ack["journal"]=="observed"&&(string)ack["runId"]==expectedRunId);
    SodaDesktopSigninPackageNative.CheckCore(sourceReceipt,a=>receiptPolicy(receiptPath,a));Need(active());
   }finally{Array.Clear(bytes,0,bytes.Length);}
   var names=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();var historyTrees=new Dictionary<string,string>();foreach(string name in names.Except(new[]{"admin","runs","runtime","quiescence.lock"}))using(var tree=new R.Tree(Path.Combine(slot,name),policy,active))historyTrees.Add(name,tree.Digest());
   using(var saved=new R.Tree(runtime,policy,active))using(var savedAdmin=new R.Tree(admin,policy,active)){
    Need(saved.Digest()==runtimeHash);string id=Guid.NewGuid().ToString("N"),archive="runs-startup214-"+id,receipt="startup214-"+id+".json",markerHash,runDigest,newReceiptHash;
    var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"createdAt",wall()}},owner);
    var fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-startup214-case"},{"ownerSid",owner},{"packageSha256",manifest},{"inventorySha256",inventory},{"runtimeSha256",runtimeHash},{"barrierSha256",barrier},{"runFileSha256",runHash},{"runId",intent.RunId},{"currentScmInstance",current},{"serviceExit",1066},{"serviceSpecific",214},{"hostPid",expectedPid},{"hostCreatedFiletime",expectedCreated},{"startedSha256",startedHash},{"startReceipt",receiptPath},{"startReceiptSha256",receiptHash},{"runsArchive",archive},{"newRunId",initial.RunId},{"preparedAt",wall()},{"originalOutcome","unknown"},{"keysPreserved",true},{"cleanExitClaimed",false}};
    using(var tree=new R.Tree(slot,policy,active)){
     Need(tree.Digest()==inventory&&active());if(action=="inspect")return new Dictionary<string,object>{{"state","inspected"},{"mutates",false},{"runId",intent.RunId},{"scmInstance",current}};
     Need(SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,archive))&&SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,receipt)));
     using(var originalRuns=new R.Tree(runs,policy,active))runDigest=originalRuns.Digest();
     bytes=R.Encode(fields);markerHash=R.Hash(bytes);R.Write(marker,bytes,policy,create);using(var fresh=new R.Tree(slot,policy,active))tree.Same(fresh);Need(active());if(after!=null)after("marker-written");using(var fresh=new R.Tree(slot,policy,active))tree.Same(fresh);Need(active());
    }
    using(var tree=new R.Tree(runs,policy,active))Need(tree.Digest()==runDigest);Need(active()&&R.Hash(R.Read(marker,policy))==markerHash);
    Need(MoveFileExW(runs,Path.Combine(slot,archive),8));if(after!=null)after("runs-archived");Need(active());mkdir(runs);if(after!=null)after("directory-created");Need(active());
    using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Installer,active,a=>policy(runs,a),new string[0],createFile:create))journal.Initialize(initial);if(after!=null)after("initial-written");Need(active());
    fields.Add("recordedAt",wall());fields.Add("newBoundarySha256",initial.Digest());bytes=R.Encode(fields);newReceiptHash=R.Hash(bytes);R.Write(Path.Combine(slot,receipt),bytes,policy,create);if(after!=null)after("receipt-written");Need(active());
    using(var tree=new R.Tree(Path.Combine(slot,archive),policy,active))Need(tree.Digest()==runDigest);
    foreach(var item in historyTrees)using(var tree=new R.Tree(Path.Combine(slot,item.Key),policy,active))Need(tree.Digest()==item.Value);
    R.Exact(admin);R.Exact(slot,names.Concat(new[]{archive,receipt,"install.transition"}).ToArray());using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runs,a),new string[0]))Need(journal.State()=="initial"&&journal.CleanBoundary().Digest()==initial.Digest());
    using(var tree=new R.Tree(runtime,policy,active))Need(tree.Digest()==runtimeHash);saved.Check();savedAdmin.Check();Need(active()&&R.Hash(R.Read(marker,policy))==markerHash&&R.Hash(R.Read(Path.Combine(slot,receipt),policy))==newReceiptHash);File.Delete(marker);Need(active());R.Exact(slot,names.Concat(new[]{archive,receipt}).ToArray());
    return new Dictionary<string,object>{{"state","recovered"},{"originalOutcome","unknown"},{"cleanExitClaimed",false},{"keysPreserved",true},{"started",false},{"runsArchive",archive},{"receipt",receipt}};
   }
  }
 }
}
