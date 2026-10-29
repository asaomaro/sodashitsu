// Fixed maintenance artifacts. Never deletes old code, runs, runtime or secrets.
using System;
using System.IO;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
internal sealed class SodaDesktopSigninUpgradeFiles:IDisposable {
 internal readonly SodaDesktopSigninInstallFiles.Paths Paths;internal readonly string CodeArchive,RunArchive,Id,NewRunId;readonly Func<bool> scope;readonly Func<string,byte[],bool> policy;readonly Func<string,FileStream> createFile;readonly Action<string> createDirectory;
 readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();SodaDesktopSigninPackageNative.Held marker;bool ended,checking,marked,cleared;string markerHash;
 internal SodaDesktopSigninPackageNative.Snapshot OldCode,OldRuns,Stage;
 static Exception Failure(){return new InvalidOperationException("Signin upgrade files require intact retained private state");}
 static void Require(bool value){if(!value)throw Failure();}
 internal SodaDesktopSigninUpgradeFiles(SodaDesktopSigninInstallFiles.Paths paths,string id,Func<bool> scope,Func<string,byte[],bool> policy,Action<string> createDirectory,Func<string,FileStream> createFile){Paths=paths;Id=id;NewRunId=Guid.NewGuid().ToString("D");this.scope=scope;this.policy=policy;this.createDirectory=createDirectory;this.createFile=createFile;CodeArchive=Path.Combine(paths.ProgramParent,".signin-old-"+id);RunArchive=Path.Combine(paths.Slot,"runs-old-"+id);try{
  var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(string leaf in new[]{paths.ProgramParent,paths.Slot,Path.Combine(paths.Slot,"admin"),Path.Combine(paths.Slot,"runtime")})for(string path=leaf;!String.IsNullOrEmpty(path);path=Path.GetDirectoryName(path)){if(names.Count>=128)throw Failure();names.Add(path);}
  var ordered=new List<string>(names);ordered.Sort((a,b)=>a.Length.CompareTo(b.Length));foreach(string path in ordered){Require(scope());held.Add(SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,acl=>policy(path,acl),null));}
  Require(Current()&&SodaDesktopSigninPackageNative.Absent(paths.Stage)&&SodaDesktopSigninPackageNative.Absent(CodeArchive)&&SodaDesktopSigninPackageNative.Absent(RunArchive));OldCode=Capture(paths.Code);OldRuns=Capture(Path.Combine(paths.Slot,"runs"));Require(Current());
 }catch{Dispose();throw;}}
 internal SodaDesktopSigninPackageNative.Snapshot Capture(string path){using(var item=SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,acl=>policy(path,acl),null))return item.Before;}
 internal bool Current(){if(ended||checking){ended=true;return false;}checking=true;try{
  Require(scope());foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,acl=>policy(item.Path,acl));Require(Directory.GetFileSystemEntries(Path.Combine(Paths.Slot,"admin")).Length==0);
  if(marker!=null){SodaDesktopSigninPackageNative.CheckCore(marker,acl=>policy(marker.Path,acl));using(var actual=SodaDesktopSigninPackageNative.OpenRenamableCore(marker.Path,8192,acl=>policy(marker.Path,acl))){Require(marker.Before.Same(actual.Before,false,8192)&&Digest(Read(actual))==markerHash);}}
  else Require(SodaDesktopSigninPackageNative.Absent(Path.Combine(Paths.Slot,"install.transition")));Require(scope()&&!ended);return true;
 }catch{ended=true;return false;}finally{checking=false;}}
 static byte[] Read(SodaDesktopSigninPackageNative.Held file){file.Stream.Position=0;byte[] bytes=new byte[checked((int)file.Before.Value.SizeLow)];int at=0;while(at<bytes.Length){int n=file.Stream.Read(bytes,at,bytes.Length-at);if(n==0)throw Failure();at+=n;}Require(file.Stream.ReadByte()==-1);return bytes;}
 static string Digest(byte[] bytes){using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 internal static string DirectoryId(SodaDesktopSigninPackageNative.Snapshot value){Require(value!=null&&value.Regular(true,0));var v=value.Value;return v.Volume.ToString("x8")+v.IndexHigh.ToString("x8")+v.IndexLow.ToString("x8")+v.CreatedHigh.ToString("x8")+v.CreatedLow.ToString("x8");}
 internal void CreateStage(){Require(Current()&&SodaDesktopSigninPackageNative.Absent(Paths.Stage));createDirectory(Paths.Stage);Stage=Capture(Paths.Stage);Require(Current());}
 internal void Mark(string owner,string oldHash,string newHash,string barrier,string state,SodaDesktopSigninRunRecord boundary){Require(Current()&&!marked);var value=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-upgrade"},{"ownerSid",owner},{"upgradeId",Id},{"newRunId",NewRunId},{"stageName",Path.GetFileName(Paths.Stage)},{"oldPackage",oldHash},{"newPackage",newHash},{"barrier",barrier},{"oldState",state},{"oldRunId",boundary.RunId},{"oldBoundarySha256",boundary.Digest()},{"oldCode",DirectoryId(OldCode)},{"oldRuns",DirectoryId(OldRuns)},{"stage",DirectoryId(Stage)},{"codeArchive",Path.GetFileName(CodeArchive)},{"runArchive",Path.GetFileName(RunArchive)}};byte[] bytes=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value));Require(bytes.Length<=8192);string path=Path.Combine(Paths.Slot,"install.transition");
  using(var output=createFile(path)){output.Write(bytes,0,bytes.Length);output.Flush(true);}marker=SodaDesktopSigninPackageNative.OpenRenamableCore(path,8192,acl=>policy(path,acl));markerHash=Digest(bytes);marked=true;Require(Current());
 }
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
 internal void Move(string from,string to,SodaDesktopSigninPackageNative.Snapshot expected){Require(Current()&&marked&&!cleared&&SodaDesktopSigninPackageNative.Absent(to));Require(expected.Same(Capture(from),true,0));Require(Current());Require(MoveFileExW(from,to,8));Require(expected.Same(Capture(to),true,0));Require(Current());}
 internal void CreateRuns(){Require(Current()&&marked&&!cleared&&SodaDesktopSigninPackageNative.Absent(Path.Combine(Paths.Slot,"runs")));createDirectory(Path.Combine(Paths.Slot,"runs"));Require(Current());}
 internal void Clear(){Require(Current()&&marked&&!cleared&&marker!=null);string path=marker.Path;Require(Current());File.Delete(path);marker.Dispose();marker=null;cleared=true;Require(Current());}
 internal bool Cleared{get{return cleared&&Current();}}
 public void Dispose(){ended=true;if(marker!=null){marker.Dispose();marker=null;}SodaDesktopSigninPackageNative.Release(held);}
}
