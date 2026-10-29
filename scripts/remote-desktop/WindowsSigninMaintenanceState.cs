using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
internal sealed class SodaDesktopSigninMaintenanceState:IDisposable {
 internal readonly SodaDesktopSigninInstallFiles.Paths Paths;readonly Func<bool> scope;internal readonly Func<string,byte[],bool> Policy;readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();SodaDesktopSigninPackageNative.Held marker;string markerHash;bool ended,checking,cleared;
 internal SodaDesktopSigninUpgradeRecord Record;internal SodaDesktopSigninQuiescence.Lease Exclusive;
 static Exception Failure(){return new InvalidOperationException("Signin maintenance state is not retained and private");}
 static void Require(bool value){if(!value)throw Failure();}
 internal SodaDesktopSigninMaintenanceState(SodaDesktopSigninInstallFiles.Paths paths,Func<bool> scope,Func<string,byte[],bool> policy){Paths=paths;this.scope=scope;Policy=policy;try{
  var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(string leaf in new[]{paths.ProgramParent,paths.Slot,Path.Combine(paths.Slot,"admin"),Path.Combine(paths.Slot,"runtime")})for(string p=leaf;!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){if(names.Count>=128)throw Failure();names.Add(p);}var ordered=new List<string>(names);ordered.Sort((a,b)=>a.Length.CompareTo(b.Length));foreach(string p in ordered){Require(scope());held.Add(SodaDesktopSigninPackageNative.OpenCore(p,true,true,0,a=>policy(p,a),null));}Require(ParentsCurrent());
 }catch{Dispose();throw;}}
 bool ParentsCurrent(){if(ended||!scope())return false;try{foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,a=>Policy(item.Path,a));return scope()&&Directory.GetFileSystemEntries(Path.Combine(Paths.Slot,"admin")).Length==0;}catch{return false;}}
 internal static byte[] Read(SodaDesktopSigninPackageNative.Held file){file.Stream.Position=0;byte[] bytes=new byte[checked((int)file.Before.Value.SizeLow)];int at=0;while(at<bytes.Length){int n=file.Stream.Read(bytes,at,bytes.Length-at);if(n==0)throw Failure();at+=n;}Require(file.Stream.ReadByte()==-1);return bytes;}
 internal void OpenMarker(string owner,string oldHash,string newHash,string expected){Require(ParentsCurrent()&&marker==null&&!cleared);string path=Path.Combine(Paths.Slot,"install.transition");marker=SodaDesktopSigninPackageNative.OpenRenamableCore(path,8192,a=>Policy(path,a));byte[] bytes=Read(marker);markerHash=SodaDesktopSigninUpgradeRecord.Digest(bytes);Record=SodaDesktopSigninUpgradeRecord.Decode(bytes,owner,oldHash,newHash,expected??markerHash);Require(Current());}
 internal bool Current(){if(ended||checking){ended=true;return false;}checking=true;try{
  Require(ParentsCurrent());if(Exclusive!=null)Require(Exclusive.Current());string path=Path.Combine(Paths.Slot,"install.transition");if(marker!=null){SodaDesktopSigninPackageNative.CheckCore(marker,a=>Policy(path,a));using(var actual=SodaDesktopSigninPackageNative.OpenRenamableCore(path,8192,a=>Policy(path,a)))Require(marker.Before.Same(actual.Before,false,8192)&&SodaDesktopSigninUpgradeRecord.Digest(Read(actual))==markerHash);}else Require(SodaDesktopSigninPackageNative.Absent(path));Require(ParentsCurrent());return true;
 }catch{ended=true;return false;}finally{checking=false;}}
 internal void ClearMarker(){Require(Current()&&marker!=null&&!cleared);File.Delete(marker.Path);marker.Dispose();marker=null;cleared=true;Require(Current());}
 internal bool MarkerCleared{get{return cleared&&Current();}}
 internal SodaDesktopSigninPackageNative.Snapshot Capture(string path){Require(Current());using(var file=SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,a=>Policy(path,a),null)){Require(Current());return file.Before;}}
 internal string Identity(string path){return SodaDesktopSigninUpgradeFiles.DirectoryId(Capture(path));}
 static bool SameIdentity(SodaDesktopSigninPackageNative.Snapshot item,string expected){return SodaDesktopSigninUpgradeFiles.DirectoryId(item)==expected;}
 internal void RequireIdentity(string path,string expected){Require(SameIdentity(Capture(path),expected));}
 internal bool Absent(string path){Require(Current());return SodaDesktopSigninPackageNative.Absent(path);}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
 internal void Move(string from,string to,string expectedIdentity){Require(Current()&&marker!=null&&Absent(to));var before=Capture(from);Require(SameIdentity(before,expectedIdentity));Require(MoveFileExW(from,to,8));var after=Capture(to);Require(SameIdentity(after,expectedIdentity)&&before.Same(after,true,0)&&Current());}
 internal void CreateRuns(Action<string> create){string path=Path.Combine(Paths.Slot,"runs");Require(Current()&&marker!=null&&Absent(path));create(path);Require(Current());}
 public void Dispose(){ended=true;if(marker!=null){marker.Dispose();marker=null;}SodaDesktopSigninPackageNative.Release(held);}
}
