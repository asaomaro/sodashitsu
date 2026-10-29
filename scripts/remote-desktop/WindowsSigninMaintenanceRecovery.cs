// Explicit current-schema recovery, never generic repair or process control.
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
public static class SodaDesktopSigninMaintenanceRecovery {
 static Exception Failure(){return new InvalidOperationException("Signin recovery requires exact reviewed transition and independent clean evidence");}
 static void Require(bool value){if(!value)throw Failure();}
 static bool Within(string root,string path){return String.Equals(root,path,StringComparison.OrdinalIgnoreCase)||path.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 public static IDictionary<string,object> Run(string action,string owner,string oldHash,string newHash,string markerHash){
  Require(action=="inspect"||action=="resume"||action=="restore");Require(action=="resume"?!String.IsNullOrEmpty(markerHash):String.IsNullOrEmpty(markerHash));Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));var timer=Stopwatch.StartNew();
  using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000)){
   Func<bool> current=()=>timer.ElapsedMilliseconds<300000&&mutex.Current()&&SodaDesktopSigninPackageNative.Authority(true)&&timer.ElapsedMilliseconds<300000;var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));Func<string,byte[],bool> policy=(p,a)=>Within(paths.Slot,p)||Within(paths.ProgramParent,p)&&!String.Equals(paths.ProgramParent,p,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninPackage.CodeAcl(a,false);
   using(var state=new SodaDesktopSigninMaintenanceState(paths,current,policy)){
    if(action=="inspect"){state.OpenMarker(owner,oldHash,newHash,null);return state.Record.Public();}
    using(var service=SodaDesktopSigninUpgradeScm.Open(owner,current))return action=="resume"?Resume(owner,oldHash,newHash,markerHash,state,service,()=>SodaDesktopSigninQuiescence.Open(owner),SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile):Restore(owner,newHash,state,service,()=>SodaDesktopSigninQuiescence.Open(owner));
   }
  }
 }
 static SodaDesktopSigninRunJournal Journal(string path,string owner,string hash,string barrier,SodaDesktopSigninRunJournal.Role role,Func<bool> current,Func<string,byte[],bool> policy,Func<string,FileStream> create=null){return new SodaDesktopSigninRunJournal(path,owner,hash,barrier,role,current,a=>policy(path,a),new string[0],createFile:create);}
 static SodaDesktopSigninRunRecord Boundary(string path,string owner,string hash,string barrier,Func<bool> current,Func<string,byte[],bool> policy){using(var journal=Journal(path,owner,hash,barrier,SodaDesktopSigninRunJournal.Role.Reader,current,policy))return journal.CleanBoundary();}
 static SodaDesktopSigninRunRecord OldBoundary(SodaDesktopSigninMaintenanceState state,string path){var r=state.Record;state.RequireIdentity(path,r.OldRuns);var boundary=Boundary(path,r.Owner,r.OldHash,r.Barrier,state.Current,state.Policy);Require(boundary.RunId==r.OldRun&&boundary.Digest()==r.OldDigest&&boundary.Kind==(r.OldState=="initial"?"initial":"observed-stop"));return boundary;}
 static SodaDesktopSigninUpgrade.Package Package(SodaDesktopSigninMaintenanceState state,string path,string hash,string identity){state.RequireIdentity(path,identity);return new SodaDesktopSigninUpgrade.Package(path,state.Record.Owner,hash,state.Policy,state.Current);}
 static string NewRuns(SodaDesktopSigninMaintenanceState state,string path){string ignored;return NewRuns(state,path,out ignored);}
 static string NewRuns(SodaDesktopSigninMaintenanceState state,string path,out string identity){identity=null;var r=state.Record;if(state.Absent(path))return "absent";using(var parent=SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,a=>state.Policy(path,a),null)){
  identity=SodaDesktopSigninUpgradeFiles.DirectoryId(parent.Before);Require(state.Current());string[] names=Directory.GetFileSystemEntries(path);if(names.Length==0)return "empty";
  if(names.Length==1&&Path.GetFileName(names[0])=="initial"){var initial=Boundary(path,r.Owner,r.NewHash,r.Barrier,state.Current,state.Policy);Require(initial.Kind=="initial"&&initial.RunId==r.NewRun);return "initial";}
  if(names.Length==1&&Path.GetFileName(names[0])=="initial.writing"){var attributes=File.GetAttributes(names[0]);Require((attributes&(FileAttributes.Directory|FileAttributes.ReparsePoint))==0&&new FileInfo(names[0]).Length<=16384);Require(state.Current());return "writing";}throw Failure();
 }}
 internal static IDictionary<string,object> Resume(string owner,string oldHash,string newHash,string markerHash,SodaDesktopSigninMaintenanceState state,SodaDesktopSigninUpgradeScm service,Func<SodaDesktopSigninQuiescence.Pin> barrier,Action<string> createDirectory,Func<string,FileStream> createFile,Action<string> afterStep=null){
  Require(!String.IsNullOrEmpty(markerHash));state.OpenMarker(owner,oldHash,newHash,markerHash);var r=state.Record;var p=state.Paths;service.Inspect(true);
  using(var pin=barrier())using(var exclusive=pin.Exclusive()){
   state.Exclusive=exclusive;Require(state.Current()&&exclusive.Fingerprint==r.Barrier);string codeArchive=Path.Combine(p.ProgramParent,r.CodeArchive),stage=Path.Combine(p.ProgramParent,r.StageName),runArchive=Path.Combine(p.Slot,r.RunArchive),runs=Path.Combine(p.Slot,"runs"),incomplete=Path.Combine(p.Slot,"runs-incomplete-"+r.Id);
   bool oldAtFixed=state.Absent(codeArchive);bool codeMissing=state.Absent(p.Code);bool stageMissing=state.Absent(stage);Require(oldAtFixed?!codeMissing&&!stageMissing:codeMissing?!stageMissing:stageMissing);
   bool oldRunsFixed=state.Absent(runArchive);if(!oldRunsFixed)Require(!oldAtFixed&&!codeMissing&&stageMissing);string oldRuns=oldRunsFixed?runs:runArchive;OldBoundary(state,oldRuns);string newRunIdentity=null;string newState=oldRunsFixed?"old":NewRuns(state,runs,out newRunIdentity);Require(newState!="writing"||state.Absent(incomplete));
   SodaDesktopSigninUpgrade.Package old=null,fresh=null;
   try{
    old=Package(state,oldAtFixed?p.Code:codeArchive,r.OldHash,r.OldCode);fresh=Package(state,stageMissing?p.Code:stage,r.NewHash,r.StageId);Require(old.Current()&&fresh.Current()&&state.Current());service.Inspect(true);
    if(oldAtFixed){Require(old.Current());old.Dispose();old=null;Require(state.Current());state.Move(p.Code,codeArchive,r.OldCode);if(afterStep!=null)afterStep("code-archived");old=Package(state,codeArchive,r.OldHash,r.OldCode);}
    if(!stageMissing){Require(fresh.Current()&&old.Current());fresh.Dispose();fresh=null;service.Inspect(true);Require(state.Current());state.Move(stage,p.Code,r.StageId);if(afterStep!=null)afterStep("new-code-published");fresh=Package(state,p.Code,r.NewHash,r.StageId);}
    Require(old.Current()&&fresh.Current()&&state.Current());OldBoundary(state,oldRuns);service.Inspect(true);
    if(oldRunsFixed){state.Move(runs,runArchive,r.OldRuns);if(afterStep!=null)afterStep("runs-archived");OldBoundary(state,runArchive);newState="absent";}
    if(newState=="writing"){string actualIdentity;Require(NewRuns(state,runs,out actualIdentity)=="writing"&&actualIdentity==newRunIdentity&&state.Absent(incomplete));state.Move(runs,incomplete,newRunIdentity);if(afterStep!=null)afterStep("incomplete-preserved");newState="absent";}
    Func<bool> clean=()=>state.Current()&&exclusive.Fingerprint==r.Barrier&&old.Current()&&fresh.Current()&&OldBoundary(state,runArchive)!=null;
    Require(clean());if(newState=="absent"){state.CreateRuns(createDirectory);newState="empty";}
    if(newState=="empty"){
     Require(NewRuns(state,runs)=="empty"&&clean());var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",r.NewRun},{"packageSha256",r.NewHash},{"barrierSha256",r.Barrier},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}},owner);
     using(var journal=Journal(runs,owner,r.NewHash,r.Barrier,SodaDesktopSigninRunJournal.Role.Installer,clean,state.Policy,createFile))journal.Initialize(initial);if(afterStep!=null)afterStep("initial-written");
    }
    Func<bool> completed=()=>clean()&&NewRuns(state,runs)=="initial";Require(completed());service.Inspect(true);Require(completed());state.ClearMarker();service.RestoreManual(()=>state.MarkerCleared&&completed());Require(state.MarkerCleared&&completed());return new Dictionary<string,object>{{"state","upgrade-resumed"},{"started",false},{"packageSha256",r.NewHash},{"codeArchive",codeArchive},{"runArchive",runArchive}};
   }finally{if(fresh!=null)fresh.Dispose();if(old!=null)old.Dispose();}
  }
 }
 internal static IDictionary<string,object> Restore(string owner,string hash,SodaDesktopSigninMaintenanceState state,SodaDesktopSigninUpgradeScm service,Func<SodaDesktopSigninQuiescence.Pin> barrier){
  Require(state.Record==null&&state.Current());service.Inspect(true);using(var package=new SodaDesktopSigninUpgrade.Package(state.Paths.Code,owner,hash,state.Policy,state.Current))using(var pin=barrier())using(var exclusive=pin.Exclusive()){
   state.Exclusive=exclusive;string fingerprint=exclusive.Fingerprint;string runs=Path.Combine(state.Paths.Slot,"runs");var boundary=Boundary(runs,owner,hash,fingerprint,state.Current,state.Policy);Func<bool> clean=()=>state.Current()&&exclusive.Fingerprint==fingerprint&&package.Current()&&Boundary(runs,owner,hash,fingerprint,state.Current,state.Policy).Digest()==boundary.Digest();service.RestoreManual(clean);Require(clean());return new Dictionary<string,object>{{"state","clean-manual-restored"},{"started",false},{"packageSha256",hash}};
  }
 }
}
