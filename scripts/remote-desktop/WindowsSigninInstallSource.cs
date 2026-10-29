// Read-only reviewed release bytes. Source ownership never authorizes execution;
// the explicit manifest SHA, closed inventory and per-file hashes bind copying.
using System;
using System.IO;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
internal sealed class SodaDesktopSigninInstallSource:IDisposable {
    readonly object gate=new object();readonly string root;readonly List<SodaDesktopSigninPackageNative.Held> held;readonly Dictionary<string,SodaDesktopSigninPackageNative.Held> files;
    internal readonly SodaDesktopSigninPackage Package;internal readonly string ManifestSha256;readonly byte[] manifest;bool ended,copying;
    static Exception Failure(){return new InvalidOperationException("Reviewed signin release source is unavailable");}
    SodaDesktopSigninInstallSource(string root,List<SodaDesktopSigninPackageNative.Held> held,Dictionary<string,SodaDesktopSigninPackageNative.Held> files,SodaDesktopSigninPackage package,string hash,byte[] manifest){this.root=root;this.held=held;this.files=files;Package=package;ManifestSha256=hash;this.manifest=manifest;}
    static string Full(string root,string relative){return Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar));}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    static void Inventory(string root,IEnumerable<string> names){
        var expectedFiles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase){root};
        foreach(string relative in names){string path=Full(root,relative);expectedFiles.Add(path);for(string parent=Path.GetDirectoryName(path);!String.Equals(parent,root,StringComparison.OrdinalIgnoreCase);parent=Path.GetDirectoryName(parent)){if(String.IsNullOrEmpty(parent)||directories.Count>64)throw Failure();directories.Add(parent);}}
        var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(string directory in directories)foreach(string path in Directory.GetFileSystemEntries(directory)){if(seen.Count>128||!seen.Add(path)||!expectedFiles.Contains(path)&&!directories.Contains(path))throw Failure();}if(seen.Count!=expectedFiles.Count+directories.Count-1)throw Failure();
    }
    static byte[] Read(SodaDesktopSigninPackageNative.Held file){byte[] bytes=new byte[checked((int)file.Before.Value.SizeLow)];bool transferred=false;try{file.Stream.Position=0;int at=0;while(at<bytes.Length){int n=file.Stream.Read(bytes,at,bytes.Length-at);if(n==0)throw Failure();at+=n;}if(file.Stream.ReadByte()!=-1)throw Failure();SodaDesktopSigninPackageNative.CheckCore(file,acl=>true);transferred=true;return bytes;}finally{if(!transferred)Array.Clear(bytes,0,bytes.Length);}}
    internal static SodaDesktopSigninInstallSource Open(string directory,string owner,string expected){
        var held=new List<SodaDesktopSigninPackageNative.Held>();byte[] bytes=null;bool transferred=false;
        try{
            if(String.IsNullOrEmpty(directory)||!Path.IsPathRooted(directory)||directory.Length>512||directory.Length<4||directory[1]!=':'||directory[2]!='\\'||directory.Substring(2).Contains(":")||!String.Equals(Path.GetFullPath(directory),directory,StringComparison.OrdinalIgnoreCase)||expected==null||!System.Text.RegularExpressions.Regex.IsMatch(expected,"\\A[a-f0-9]{64}\\z"))throw Failure();
            var drive=new DriveInfo(Path.GetPathRoot(directory));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();
            held.Add(SodaDesktopSigninPackageNative.OpenCore(directory,true,false,0,acl=>true,null));
            var manifest=SodaDesktopSigninPackageNative.OpenCore(Path.Combine(directory,"signin-package.json"),false,false,32768,acl=>true,null);held.Add(manifest);bytes=Read(manifest);if(Hash(bytes)!=expected)throw Failure();var package=SodaDesktopSigninPackage.Decode(new UTF8Encoding(false,true).GetString(bytes),owner);
            var names=new List<string>{"signin-package.json"};foreach(var entry in package.Entries())names.Add(entry.Path);Inventory(directory,names);
            var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(string name in names)for(string parent=Path.GetDirectoryName(Full(directory,name));!String.Equals(parent,directory,StringComparison.OrdinalIgnoreCase);parent=Path.GetDirectoryName(parent)){if(String.IsNullOrEmpty(parent)||directories.Count>64)throw Failure();directories.Add(parent);}
            var ordered=new List<string>(directories);ordered.Sort((a,b)=>a.Length.CompareTo(b.Length));foreach(string path in ordered)held.Add(SodaDesktopSigninPackageNative.OpenCore(path,true,false,0,acl=>true,null));
            var files=new Dictionary<string,SodaDesktopSigninPackageNative.Held>(StringComparer.Ordinal);foreach(var entry in package.Entries()){
                var file=SodaDesktopSigninPackageNative.OpenCore(Full(directory,entry.Path),false,false,SodaDesktopSigninPackage.MaximumBytes(entry.Path),acl=>true,null);held.Add(file);if(file.Before.Value.SizeLow!=entry.Bytes)throw Failure();string digest;using(var sha=SHA256.Create())digest=BitConverter.ToString(sha.ComputeHash(file.Stream)).Replace("-","").ToLowerInvariant();if(digest!=entry.Sha256)throw Failure();SodaDesktopSigninPackageNative.CheckCore(file,acl=>true);files.Add(entry.Path,file);
            }
            Inventory(directory,names);foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,acl=>true);var result=new SodaDesktopSigninInstallSource(directory,held,files,package,expected,bytes);transferred=true;return result;
        }catch{throw Failure();}finally{if(!transferred){if(bytes!=null)Array.Clear(bytes,0,bytes.Length);SodaDesktopSigninPackageNative.Release(held);}}
    }
    internal bool Current(){lock(gate){try{if(ended)return false;var names=new List<string>{"signin-package.json"};foreach(var entry in Package.Entries())names.Add(entry.Path);Inventory(root,names);foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,acl=>true);return !ended;}catch{ended=true;return false;}}}
    internal void Copy(string destination,Action<string> createPrivateDirectory,Func<string,byte[],bool> policy,Func<bool> current,Func<string,FileStream> createFile=null){lock(gate){
        if(ended||copying||createPrivateDirectory==null||policy==null||current==null)throw Failure();copying=true;createFile=createFile??(path=>new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None));var target=new List<SodaDesktopSigninPackageNative.Held>();byte[] buffer=new byte[65536];
        try{
            Action check=()=>{if(!current()||!Current())throw Failure();foreach(var item in target)SodaDesktopSigninPackageNative.CheckCore(item,acl=>policy(item.Path,acl));if(!current())throw Failure();};
            check();target.Add(SodaDesktopSigninPackageNative.OpenCore(destination,true,true,0,acl=>policy(destination,acl),null));if(Directory.GetFileSystemEntries(destination).Length!=0)throw Failure();
            var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var entry in Package.Entries())for(string parent=Path.GetDirectoryName(Full(destination,entry.Path));!String.Equals(parent,destination,StringComparison.OrdinalIgnoreCase);parent=Path.GetDirectoryName(parent)){if(String.IsNullOrEmpty(parent)||directories.Count>64)throw Failure();directories.Add(parent);}
            var ordered=new List<string>(directories);ordered.Sort((a,b)=>a.Length.CompareTo(b.Length));foreach(string directory in ordered){check();createPrivateDirectory(directory);target.Add(SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,acl=>policy(directory,acl),null));}
            foreach(var entry in Package.Entries()){
                check();var source=files[entry.Path];source.Stream.Position=0;long read=0;string digest;using(var sha=SHA256.Create())using(var output=createFile(Full(destination,entry.Path))){
                    while(read<entry.Bytes){check();int n=source.Stream.Read(buffer,0,(int)Math.Min(buffer.Length,entry.Bytes-read));if(n==0)throw Failure();output.Write(buffer,0,n);sha.TransformBlock(buffer,0,n,buffer,0);read+=n;}
                    if(source.Stream.ReadByte()!=-1)throw Failure();sha.TransformFinalBlock(new byte[0],0,0);digest=BitConverter.ToString(sha.Hash).Replace("-","").ToLowerInvariant();if(digest!=entry.Sha256)throw Failure();check();output.Flush(true);
                }
                var copied=SodaDesktopSigninPackageNative.OpenCore(Full(destination,entry.Path),false,true,SodaDesktopSigninPackage.MaximumBytes(entry.Path),acl=>policy(Full(destination,entry.Path),acl),null);target.Add(copied);if(copied.Before.Value.SizeLow!=entry.Bytes)throw Failure();check();
            }
            check();string manifestPath=Path.Combine(destination,"signin-package.json");using(var output=createFile(manifestPath)){output.Write(manifest,0,manifest.Length);check();output.Flush(true);}target.Add(SodaDesktopSigninPackageNative.OpenCore(manifestPath,false,true,32768,acl=>policy(manifestPath,acl),null));
            var names=new List<string>{"signin-package.json"};foreach(var entry in Package.Entries())names.Add(entry.Path);Inventory(destination,names);check();
        }catch{ended=true;throw;}finally{Array.Clear(buffer,0,buffer.Length);SodaDesktopSigninPackageNative.Release(target);copying=false;}
    }}
    public void Dispose(){lock(gate){ended=true;Array.Clear(manifest,0,manifest.Length);SodaDesktopSigninPackageNative.Release(held);}}
}
