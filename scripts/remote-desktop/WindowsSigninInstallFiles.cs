// Fixed installation files only. New directories/files are never adopted or
// overwritten. Failed/private partial installation is left for explicit recovery.
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Text;
using System.Web.Script.Serialization;
internal sealed class SodaDesktopSigninInstallFiles:IDisposable {
    internal sealed class Paths {
        internal readonly string ProgramParent,DataParent,Code,Slot,Stage;
        internal Paths(string programParent,string dataParent,string owner,string id){ProgramParent=programParent;DataParent=dataParent;Code=Path.Combine(programParent,"DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner));Slot=Path.Combine(dataParent,SodaDesktopSigninPackage.Slot(owner));Stage=Path.Combine(programParent,".signin-"+SodaDesktopSigninPackage.Slot(owner)+"-"+id);
            foreach(string path in new[]{ProgramParent,DataParent}){if(path.Length<4||path.Length>512||path[1]!=':'||path[2]!='\\'||path.Substring(2).Contains(":"))throw Failure();var drive=new DriveInfo(Path.GetPathRoot(path));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();}
        }
        internal static Paths Installed(string owner,string id){return new Paths(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"sodashitsu","desktop-signin"),owner,id);}
    }
    [StructLayout(LayoutKind.Sequential)]struct SecurityAttributes {internal int Size;internal IntPtr Descriptor;internal int Inherit;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern uint GetFileAttributesW(string path);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool CreateDirectoryW(string path,ref SecurityAttributes security);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
    readonly object gate=new object();readonly Paths paths;readonly Func<string,byte[],bool> policy;readonly Func<bool> scope;readonly List<SodaDesktopSigninPackageNative.Held> held=new List<SodaDesktopSigninPackageNative.Held>();
    SodaDesktopSigninPackageNative.Held stage,marker;bool ended,published,cleared,checking;internal readonly byte[] MarkerBytes;
    static Exception Failure(){return new InvalidOperationException("Signin installation files require an unused verified location or explicit recovery");}
    internal static bool Absent(string path){uint value=GetFileAttributesW(path);if(value!=UInt32.MaxValue)return false;int error=Marshal.GetLastWin32Error();if(error!=2&&error!=3)throw Failure();return true;}
    internal static void CreatePrivateDirectory(string path){
        var descriptor=new RawSecurityDescriptor("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)");byte[] bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
        try{var security=new SecurityAttributes{Size=Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=pinned.AddrOfPinnedObject(),Inherit=0};if(!CreateDirectoryW(path,ref security))throw Failure();}finally{pinned.Free();}
    }
    SodaDesktopSigninInstallFiles(Paths paths,string owner,string id,string manifest,Func<string,byte[],bool> policy,Func<bool> scope){
        this.paths=paths;this.policy=policy;this.scope=scope;var value=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-install"},{"mode","initial"},{"ownerSid",owner},{"installId",id},{"packageSha256",manifest},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}};MarkerBytes=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value));
    }
    void Check(){if(!Current())throw Failure();}
    internal bool Current(){lock(gate){if(ended||checking){ended=true;return false;}checking=true;try{
        if(!scope()||ended){ended=true;return false;}foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,acl=>policy(item.Path,acl));if(stage!=null)SodaDesktopSigninPackageNative.CheckCore(stage,acl=>policy(stage.Path,acl));if(marker!=null&&!cleared)SodaDesktopSigninPackageNative.CheckCore(marker,acl=>policy(marker.Path,acl));if(ended||!scope()||ended){ended=true;return false;}return true;
    }catch{ended=true;return false;}finally{checking=false;}}}
    void Hold(string path){held.Add(SodaDesktopSigninPackageNative.OpenCore(path,true,true,0,acl=>policy(path,acl),null));Check();}
    void Parents(string leaf,Action<string> create){
        var names=new List<string>();for(string path=leaf;!String.IsNullOrEmpty(path);path=Path.GetDirectoryName(path)){if(names.Count>=64)throw Failure();names.Add(path);}names.Reverse();foreach(string path in names){Check();if(Absent(path)){create(path);Check();}Hold(path);}
    }
    internal static SodaDesktopSigninInstallFiles Prepare(Paths paths,string owner,string id,string manifest,Action<string> create,Func<string,byte[],bool> policy,Func<bool> scope,Func<string,FileStream> createFile=null){
        createFile=createFile??(path=>new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None));var files=new SodaDesktopSigninInstallFiles(paths,owner,id,manifest,policy,scope);bool transferred=false;try{
            files.Check();if(create==null||policy==null||!Absent(paths.Code)||!Absent(paths.Slot)||!Absent(paths.Stage))throw Failure();files.Parents(paths.ProgramParent,create);files.Parents(paths.DataParent,create);files.Check();create(paths.Slot);files.Hold(paths.Slot);
            foreach(string name in new[]{"runtime","admin","runs"}){string path=Path.Combine(paths.Slot,name);files.Check();create(path);files.Hold(path);}
            files.Check();using(var barrier=createFile(Path.Combine(paths.Slot,"quiescence.lock"))){barrier.WriteByte(83);files.Check();barrier.Flush(true);}
            files.Check();string markerPath=Path.Combine(paths.Slot,"install.transition");using(var marker=createFile(markerPath)){marker.Write(files.MarkerBytes,0,files.MarkerBytes.Length);files.Check();marker.Flush(true);}files.marker=SodaDesktopSigninPackageNative.OpenRenamableCore(markerPath,4096,acl=>policy(markerPath,acl));files.Check();
            create(paths.Stage);files.stage=SodaDesktopSigninPackageNative.OpenCore(paths.Stage,true,true,0,acl=>policy(paths.Stage,acl),null);files.Check();transferred=true;return files;
        }finally{if(!transferred)files.Dispose();}
    }
    internal void Publish(){lock(gate){Check();if(published||stage==null||!Absent(paths.Code))throw Failure();var before=stage.Before;
        // Parent remains private/pinned. Close stage-only no-delete handles for
        // Windows rename, then bind reopened target to the captured directory ID.
        stage.Dispose();stage=null;Check();if(!MoveFileExW(paths.Stage,paths.Code,8))throw Failure();var target=SodaDesktopSigninPackageNative.OpenCore(paths.Code,true,true,0,acl=>policy(paths.Code,acl),null);held.Add(target);if(!before.Same(target.Before,true,0))throw Failure();published=true;Check();
    }}
    internal void ClearMarker(){lock(gate){Check();if(!published||cleared||marker==null)throw Failure();string path=Path.Combine(paths.Slot,"install.transition");
        using(var actual=SodaDesktopSigninPackageNative.OpenRenamableCore(path,4096,acl=>policy(path,acl)))if(!marker.Before.Same(actual.Before,false,4096))throw Failure();Check();File.Delete(path);cleared=true;marker.Dispose();marker=null;Check();
    }}
    internal bool MarkerCleared{get{lock(gate){return cleared&&Current()&&Absent(Path.Combine(paths.Slot,"install.transition"));}}}
    public void Dispose(){lock(gate){ended=true;if(stage!=null){stage.Dispose();stage=null;}if(marker!=null){marker.Dispose();marker=null;}SodaDesktopSigninPackageNative.Release(held);Array.Clear(MarkerBytes,0,MarkerBytes.Length);}}
}
