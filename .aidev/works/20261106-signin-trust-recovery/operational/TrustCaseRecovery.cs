// Incident-only recovery. No public command or generic recovery policy is added.
// All original bytes, file identities, package, owner and request are pinned.
// A real critical SCM instance change is required; original outcome stays unknown.
using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using R=SodaDesktopSigninRestartRecovery;
using P=SodaDesktopSigninPartialIdentityProof;
public static class SodaTrustCaseRecovery {
 const string Owner="S-1-5-21-2255109513-3773794534-3440117263-1001";
 const string Manifest="8e6d72110ffafcbfbe4b8e4e582dcecf83976e8a2d645a2c37066a31cb8429d9";
 const string Inventory="213fdf1f7583fd0ddc1a24424f88d2955067004435e4fe20f55eb72d489d0678";
 const string Runtime="d583496c6105064295872c1e31d5c2c222deea3ac2f0df4679c294f1a84da3a1";
 const string RunHash="4077d34eadaaa71445de751a1ee1ee7f89724b8087ad644697a14022afec3edb";
 const string ClaimHash="8e46881372d00a51b1c2d50b2a6ea4caf017c1614b9ba0840f96783761c54b5b";
 const string Provider="6c5823a1a59724bb43aacb0132960b537bcbf4203a1a5c86eead10e1aa8295d5";
 static void Need(bool value){if(!value)throw new InvalidOperationException("Unchanged incident evidence and bound new critical SCM instance required");}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
 public static IDictionary<string,object> Run(string action,string ticketHash){
  Need((action=="inspect"||action=="bind"||action=="recover")&&Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true));
  var clock=Stopwatch.StartNew();using(var mutex=SodaDesktopSigninControllerMutex.Acquire(Owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(Owner,Manifest)){
   Func<bool> scope=()=>clock.ElapsedMilliseconds<60000&&mutex.Current()&&package.Current()&&SodaDesktopSigninPackageNative.Authority(true);
   using(var scm=SodaDesktopSigninScm.Open(Owner,false,scope))using(var critical=new R.ScmInstance(scope)){
    string slot=SodaDesktopSigninVault.StateDirectory(Owner);
    Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
    Func<bool> active=()=>{var s=scm.Query();SodaDesktopSigninServicePolicy.Inspect(Owner);return scope()&&critical.Current()&&s.State==1&&s.Pid==0;};
    return Core(action,ticketHash,slot,Owner,Manifest,Inventory,Runtime,RunHash,ClaimHash,critical.Identity,active,()=>{var s=scm.Query();return s.Exit==1066&&s.Specific==1;},()=>SodaDesktopSigninQuiescence.Open(Owner),policy,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile,()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
   }
  }
 }
 // OS seams exist only for generated ordinary-file tests in the same assembly.
 internal static IDictionary<string,object> Core(string action,string ticketHash,string slot,string owner,string manifest,string expectedInventory,string expectedRuntime,string runHash,string claimHash,string critical,Func<bool> current,Func<bool> failed,Func<SodaDesktopSigninQuiescence.Pin> open,Func<string,byte[],bool> policy,Action<string> mkdir,Func<string,FileStream> create,Func<long> wall,Action<string> after=null){
  Need(action=="inspect"||action=="bind"||action=="recover");Need(current());
  string marker=Path.Combine(slot,"install.transition"),runtime=Path.Combine(slot,"runtime"),runs=Path.Combine(slot,"runs"),admin=Path.Combine(slot,"admin");
  using(var pin=open())using(var exclusive=pin.Exclusive()){
   string barrier=exclusive.Fingerprint;Func<bool> active=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==barrier;
   R.Exact(runs,"intent.claimed","started","observation");R.Exact(admin,"admin.claimed");
   var runBytes=R.Read(Path.Combine(runs,"intent.claimed"),policy);var claimBytes=R.Read(Path.Combine(admin,"admin.claimed"),policy);
   Need(R.Hash(runBytes)==runHash&&R.Hash(claimBytes)==claimHash);var intent=SodaDesktopSigninRunRecord.Unprotect(runBytes,owner,"intent");
   Need((string)intent.Field("packageSha256")==manifest&&(string)intent.Field("barrierSha256")==barrier&&(string)intent.Field("mode")=="admin"&&(string)intent.Field("adminSha256")==claimHash&&(long)intent.Field("expiresAt")<=wall());
   byte[] plain=null;try{using(var envelope=SodaDesktopSigninAdminEnvelope.Decode(claimBytes,owner)){
    Need(envelope.Nonce==(string)intent.Field("adminNonce"));plain=envelope.Decrypt();var request=P.Parse(plain,16384);P.Keys(request,"version","purpose","ownerSid","nonce","issuedAt","expiresAt","operation");
    Need(Convert.ToInt64(request["version"])==1&&(string)request["purpose"]=="desktop-signin-admin"&&(string)request["ownerSid"]==owner&&(string)request["nonce"]==envelope.Nonce);
    long issued=Convert.ToInt64(request["issuedAt"]),expires=Convert.ToInt64(request["expiresAt"]);Need(issued>=0&&issued<expires&&expires-issued<=300000&&expires<=wall()&&(long)intent.Field("issuedAt")>=issued&&(long)intent.Field("expiresAt")<=expires);
    var operation=(Dictionary<string,object>)request["operation"];P.Keys(operation,"kind","peer");var peer=(Dictionary<string,object>)operation["peer"];P.Keys(peer,"fingerprint","label");Need((string)operation["kind"]=="trust"&&(string)peer["fingerprint"]=="8d001013b25a257531b36f8434c4e28626ac87df156645ec249b14dbdca02686"&&(string)peer["label"]=="Owned signin verification");
   }}finally{if(plain!=null)Array.Clear(plain,0,plain.Length);}
   using(var journal=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runs,a),new string[0]))Need(journal.State()=="observed"&&journal.StartedRecord().RunId==intent.RunId);
   var names=Directory.GetFileSystemEntries(slot).Select(Path.GetFileName).ToArray();var history=new Dictionary<string,string>();foreach(string name in names.Except(new[]{"admin","runs","runtime","quiescence.lock","install.transition"}))using(var t=new R.Tree(Path.Combine(slot,name),policy,active))history.Add(name,t.Digest());
   using(var savedRuntime=new R.Tree(runtime,policy,active)){
    Need(savedRuntime.Digest()==expectedRuntime);SortedDictionary<string,object> fields;
    using(var tree=new R.Tree(slot,policy,active)){
     Need(tree.Digest()==expectedInventory);
     if(action=="inspect"){Need(SodaDesktopSigninPackageNative.Absent(marker));return new Dictionary<string,object>{{"state","inspected"},{"runtimeSha256",expectedRuntime},{"inventorySha256",expectedInventory},{"mutates",false}};}
     if(action=="bind"){
      Need(SodaDesktopSigninPackageNative.Absent(marker)&&failed());
      fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-trust-case-restart"},{"ownerSid",owner},{"packageSha256",manifest},{"inventorySha256",expectedInventory},{"runtimeSha256",expectedRuntime},{"barrierSha256",barrier},{"runFileSha256",runHash},{"claimFileSha256",claimHash},{"runId",intent.RunId},{"scmInstance",critical},{"recoveryId",Guid.NewGuid().ToString("N")},{"boundAt",wall()}};
      byte[] ticket=R.Encode(fields);R.Write(marker,ticket,policy,create);using(var fresh=new R.Tree(slot,policy,active))tree.Same(fresh);Need(active());return new Dictionary<string,object>{{"state","bound"},{"ticketSha256",R.Hash(ticket)},{"startsService",false},{"reboots",false}};
     }
     byte[] bytes=R.Read(marker,policy);Need(R.Hash(bytes)==ticketHash);var raw=P.Parse(bytes,16384);P.Keys(raw,"version","purpose","ownerSid","packageSha256","inventorySha256","runtimeSha256","barrierSha256","runFileSha256","claimFileSha256","runId","scmInstance","recoveryId","boundAt");fields=new SortedDictionary<string,object>(raw,StringComparer.Ordinal);
     Need(R.Hash(R.Encode(fields))==ticketHash&&fields["version"] is int&&(int)fields["version"]==1&&(string)fields["purpose"]=="desktop-signin-trust-case-restart"&&(string)fields["ownerSid"]==owner&&(string)fields["packageSha256"]==manifest&&(string)fields["inventorySha256"]==expectedInventory&&(string)fields["runtimeSha256"]==expectedRuntime&&(string)fields["barrierSha256"]==barrier&&(string)fields["runFileSha256"]==runHash&&(string)fields["claimFileSha256"]==claimHash&&(string)fields["runId"]==intent.RunId&&Convert.ToInt64(fields["boundAt"])<=wall());
     R.RequireNewInstance((string)fields["scmInstance"],critical);Need(System.Text.RegularExpressions.Regex.IsMatch(fields["recoveryId"] as string??"","\\A[a-f0-9]{32}\\z"));
    }
    string id=(string)fields["recoveryId"],runArchive="runs-trust-case-"+id,adminArchive="admin-trust-case-"+id;string rh,ah;
    using(var t=new R.Tree(runs,policy,active))rh=t.Digest();using(var t=new R.Tree(admin,policy,active))ah=t.Digest();using(var t=new R.Tree(slot,policy,active))Need(t.Digest()==expectedInventory);
    Need(R.Hash(R.Read(marker,policy))==ticketHash&&active()&&SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,runArchive))&&SodaDesktopSigninPackageNative.Absent(Path.Combine(slot,adminArchive)));
    Need(MoveFileExW(runs,Path.Combine(slot,runArchive),8));if(after!=null)after("runs-archived");Need(active());Need(MoveFileExW(admin,Path.Combine(slot,adminArchive),8));if(after!=null)after("admin-archived");Need(active());
    mkdir(runs);mkdir(admin);if(after!=null)after("directories-created");
    var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"createdAt",wall()}},owner);
    using(var j=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Installer,active,a=>policy(runs,a),new string[0],createFile:create))j.Initialize(initial);if(after!=null)after("initial-written");
    string receipt="trust-case-"+id+".json";var result=new SortedDictionary<string,object>(fields,StringComparer.Ordinal){{"ticketSha256",ticketHash},{"newScmInstance",critical},{"newRunId",initial.RunId},{"runsArchive",runArchive},{"adminArchive",adminArchive},{"recoveredAt",wall()},{"originalOutcome","unknown"},{"keysPreserved",true},{"cleanExitClaimed",false}};
    R.Write(Path.Combine(slot,receipt),R.Encode(result),policy,create);if(after!=null)after("receipt-written");
    using(var t=new R.Tree(Path.Combine(slot,runArchive),policy,active))Need(t.Digest()==rh);using(var t=new R.Tree(Path.Combine(slot,adminArchive),policy,active))Need(t.Digest()==ah);foreach(var h in history)using(var t=new R.Tree(Path.Combine(slot,h.Key),policy,active))Need(t.Digest()==h.Value);
    R.Exact(admin);R.Exact(slot,names.Concat(new[]{runArchive,adminArchive,receipt}).ToArray());using(var j=new SodaDesktopSigninRunJournal(runs,owner,manifest,barrier,SodaDesktopSigninRunJournal.Role.Reader,active,a=>policy(runs,a),new string[0]))Need(j.State()=="initial"&&j.CleanBoundary().Digest()==initial.Digest());
    using(var t=new R.Tree(runtime,policy,active))Need(t.Digest()==expectedRuntime);savedRuntime.Check();Need(active()&&R.Hash(R.Read(marker,policy))==ticketHash);File.Delete(marker);Need(active());
    return new Dictionary<string,object>{{"state","recovered"},{"keysPreserved",true},{"originalOutcome","unknown"},{"cleanExitClaimed",false},{"started",false},{"provider",Provider}};
   }
  }
 }
}
