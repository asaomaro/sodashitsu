// Current-schema explicit upgrade only. No legacy migration/compatibility path.
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
public static class SodaDesktopSigninUpgrade {
 static Exception Failure(){return new InvalidOperationException("Signin upgrade requires reviewed packages and independently clean stopped state");}
 static void Require(bool value){if(!value)throw Failure();}
 internal sealed class Package:IDisposable {
  SodaDesktopSigninInstallSource source;readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();readonly Func<string,byte[],bool> policy;readonly Func<bool> scope;
  internal Package(string root,string owner,string hash,Func<string,byte[],bool> policy,Func<bool> scope){this.policy=policy;this.scope=scope;try{Require(scope());source=SodaDesktopSigninInstallSource.Open(root,owner,hash);var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(string name in SodaDesktopSigninPackage.RequiredPaths()){string file=Path.Combine(root,name.Replace('/',Path.DirectorySeparatorChar));paths.Add(file);}paths.Add(Path.Combine(root,"signin-package.json"));var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(string file in paths)for(string parent=Path.GetDirectoryName(file);!String.IsNullOrEmpty(parent);parent=Path.GetDirectoryName(parent)){if(directories.Count>=128)throw Failure();directories.Add(parent);}foreach(string path in directories)held.Add(SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,acl=>policy(path,acl),null));foreach(string path in paths)held.Add(SodaDesktopSigninPackageNative.OpenCore(path,false,true,335544320,acl=>policy(path,acl),null));Require(Current());}catch{Dispose();throw;}}
  internal bool Current(){if(source==null||!scope()||!source.Current())return false;try{foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,acl=>policy(item.Path,acl));return scope();}catch{return false;}}
  public void Dispose(){if(source!=null){source.Dispose();source=null;}SodaDesktopSigninPackageNative.Release(held);}
 }
 static bool Within(string root,string path){return String.Equals(root,path,StringComparison.OrdinalIgnoreCase)||path.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 public static IDictionary<string,object> Run(string owner,string oldHash,string source,string newHash){
  Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));var timer=Stopwatch.StartNew();
  using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var release=SodaDesktopSigninInstallSource.Open(source,owner,newHash)){
   Func<bool> current=()=>timer.ElapsedMilliseconds<300000&&mutex.Current()&&SodaDesktopSigninPackageNative.Authority(true);var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));
   Func<string,byte[],bool> policy=(path,acl)=>Within(paths.Slot,path)||Within(paths.ProgramParent,path)&&!String.Equals(paths.ProgramParent,path,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(acl):SodaDesktopSigninPackage.CodeAcl(acl,false);
   using(var service=SodaDesktopSigninUpgradeScm.Open(owner,current))return Core(owner,oldHash,release,paths,service,current,()=>SodaDesktopSigninQuiescence.Open(owner),policy,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,SodaDesktopSigninPackageNative.CreatePrivateFile);
  }
 }
 static SodaDesktopSigninRunJournal Journal(string path,string owner,string hash,string barrier,SodaDesktopSigninRunJournal.Role role,Func<bool> current,Func<string,byte[],bool> policy,Func<string,FileStream> createFile){return new SodaDesktopSigninRunJournal(path,owner,hash,barrier,role,current,acl=>policy(path,acl),new string[0],createFile:createFile);}
 static SodaDesktopSigninRunRecord Boundary(string path,string owner,string hash,string barrier,Func<bool> current,Func<string,byte[],bool> policy){using(var journal=Journal(path,owner,hash,barrier,SodaDesktopSigninRunJournal.Role.Reader,current,policy,null))return journal.CleanBoundary();}
 internal static IDictionary<string,object> Core(string owner,string oldHash,SodaDesktopSigninInstallSource release,SodaDesktopSigninInstallFiles.Paths paths,SodaDesktopSigninUpgradeScm service,Func<bool> current,Func<SodaDesktopSigninQuiescence.Pin> barrier,Func<string,byte[],bool> policy,Action<string> createDirectory,Func<string,FileStream> createFile,Action<string> afterStep=null){
  Require(current()&&release.Current()&&oldHash!=release.ManifestSha256);service.Inspect(false);Package old=null,stage=null,archived=null,published=null;
  try{
   old=new Package(paths.Code,owner,oldHash,policy,current);
   using(var pin=barrier())using(var exclusive=pin.Exclusive()){
    string fingerprint=exclusive.Fingerprint;Func<bool> retained=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==fingerprint&&release.Current();
    string runs=Path.Combine(paths.Slot,"runs");var boundary=Boundary(runs,owner,oldHash,fingerprint,retained,policy);string state=boundary.Kind=="initial"?"initial":"complete";
    using(var files=new SodaDesktopSigninUpgradeFiles(paths,Guid.NewGuid().ToString("N"),retained,policy,createDirectory,createFile)){
     Func<bool> preparing=()=>retained()&&files.Current()&&old!=null&&old.Current();Require(preparing());files.CreateStage();release.Copy(paths.Stage,createDirectory,policy,preparing,createFile);stage=new Package(paths.Stage,owner,release.ManifestSha256,policy,retained);
     Func<bool> clean=()=>preparing()&&stage.Current()&&Boundary(runs,owner,oldHash,fingerprint,preparing,policy).Digest()==boundary.Digest();
     service.Disable(clean);Require(clean());files.Mark(owner,oldHash,release.ManifestSha256,fingerprint,state,boundary);
     // The private parents, marker and exclusive barrier remain held while
     // no-delete package/root/journal pins are closed for Windows rename.
     Require(clean());old.Dispose();old=null;stage.Dispose();stage=null;service.Inspect(true);Require(retained()&&files.Current());
     files.Move(paths.Code,files.CodeArchive,files.OldCode);if(afterStep!=null)afterStep("code-archived");Require(retained()&&files.Current());archived=new Package(files.CodeArchive,owner,oldHash,policy,retained);Require(archived.Current());
     files.Move(paths.Stage,paths.Code,files.Stage);published=new Package(paths.Code,owner,release.ManifestSha256,policy,retained);Require(published.Current());
     service.Inspect(true);Require(retained()&&files.Current()&&archived.Current()&&published.Current());
     // Boundary() releases its run-directory pins before this move. Reopen and
     // verify exactly the same run ID/digest after the nonreplace rename.
     Require(Boundary(runs,owner,oldHash,fingerprint,retained,policy).Digest()==boundary.Digest());files.Move(runs,files.RunArchive,files.OldRuns);if(afterStep!=null)afterStep("runs-archived");Require(retained()&&files.Current());
     Func<bool> proved=()=>retained()&&files.Current()&&archived.Current()&&published.Current()&&Boundary(files.RunArchive,owner,oldHash,fingerprint,retained,policy).Digest()==boundary.Digest();
     Require(proved());files.CreateRuns();var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",files.NewRunId},{"packageSha256",release.ManifestSha256},{"barrierSha256",fingerprint},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}},Owner(owner));
     using(var journal=Journal(runs,owner,release.ManifestSha256,fingerprint,SodaDesktopSigninRunJournal.Role.Installer,proved,policy,createFile))journal.Initialize(initial);if(afterStep!=null)afterStep("initial-written");Require(proved());
     Func<bool> completed=()=>proved()&&Boundary(runs,owner,release.ManifestSha256,fingerprint,proved,policy).Digest()==initial.Digest();Require(completed());service.Inspect(true);Require(completed());files.Clear();service.Manual(()=>files.Cleared&&completed());Require(files.Cleared&&completed());
     return new Dictionary<string,object>{{"state","upgraded"},{"started",false},{"packageSha256",release.ManifestSha256},{"oldPackageSha256",oldHash},{"codeArchive",files.CodeArchive},{"runArchive",files.RunArchive}};
    }
   }
  }finally{if(published!=null)published.Dispose();if(archived!=null)archived.Dispose();if(stage!=null)stage.Dispose();if(old!=null)old.Dispose();}
 }
 static string Owner(string owner){return SodaDesktopSigninPackage.OwnerSid(owner);}
}
