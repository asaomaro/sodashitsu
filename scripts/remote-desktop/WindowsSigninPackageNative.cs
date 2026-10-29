// Read-only installed-code verification. No process launch, SCM or key access.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class SodaDesktopSigninPackageNative {
    [StructLayout(LayoutKind.Sequential)]internal struct Info {
        public uint Attributes,CreatedLow,CreatedHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",SetLastError=true)]static extern uint GetFileType(SafeFileHandle handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",ExactSpelling=true)]static extern uint GetSecurityInfo(SafeFileHandle handle,int type,uint requested,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",ExactSpelling=true)]static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",ExactSpelling=true)]static extern IntPtr LocalFree(IntPtr value);
    static Exception Failure(){return new InvalidOperationException("Signin package is unavailable");}
    public static void VerifyLayouts(){if(Marshal.SizeOf(typeof(Info))!=52||Marshal.OffsetOf(typeof(Info),"Links").ToInt32()!=40)throw Failure();}
    internal sealed class Snapshot {
        internal readonly Info Value;readonly uint type;
        internal Snapshot(Info value,uint type){Value=value;this.type=type;}
        internal bool Regular(bool directory,long maximum){return type==1&&(Value.Attributes&1024)==0&&((Value.Attributes&16)!=0)==directory&&(directory||Value.Links==1&&Value.SizeHigh==0&&Value.SizeLow>0&&Value.SizeLow<=maximum);}
        internal string Fingerprint(){
            if(!Regular(false,1))throw Failure();using(var memory=new MemoryStream())using(var writer=new BinaryWriter(memory)){
                writer.Write(Value.Volume);writer.Write(Value.IndexHigh);writer.Write(Value.IndexLow);writer.Write(Value.CreatedHigh);writer.Write(Value.CreatedLow);writer.Write(Value.WriteHigh);writer.Write(Value.WriteLow);writer.Write(Value.Attributes);writer.Write(Value.SizeHigh);writer.Write(Value.SizeLow);writer.Flush();using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(memory.ToArray())).Replace("-","").ToLowerInvariant();
            }
        }
        internal bool Same(Snapshot other,bool directory,long maximum){
            return other!=null&&Regular(directory,maximum)&&other.Regular(directory,maximum)&&Value.Volume==other.Value.Volume&&Value.IndexHigh==other.Value.IndexHigh&&Value.IndexLow==other.Value.IndexLow&&Value.Attributes==other.Value.Attributes&&
                (directory||Value.SizeLow==other.Value.SizeLow&&Value.WriteLow==other.Value.WriteLow&&Value.WriteHigh==other.Value.WriteHigh);
        }
    }
    internal sealed class Held : IDisposable {
        internal string Path;internal bool Directory,Package;internal long Maximum;internal SafeFileHandle Handle;internal FileStream Stream;internal Snapshot Before;
        public void Dispose(){if(Stream!=null)Stream.Dispose();else if(Handle!=null)Handle.Dispose();}
    }
    static Snapshot Facts(SafeFileHandle handle){Info info;if(handle==null||handle.IsInvalid||handle.IsClosed||!GetFileInformationByHandle(handle,out info))throw Failure();return new Snapshot(info,GetFileType(handle));}
    static byte[] Security(SafeFileHandle handle){
        IntPtr owner,group,dacl,sacl,descriptor=IntPtr.Zero;
        try {
            uint code=GetSecurityInfo(handle,1,5,out owner,out group,out dacl,out sacl,out descriptor);
            if(code!=0||descriptor==IntPtr.Zero)throw Failure();
            uint length=GetSecurityDescriptorLength(descriptor);if(length<20||length>131072)throw Failure();
            var bytes=new byte[length];Marshal.Copy(descriptor,bytes,0,(int)length);return bytes;
        }finally{if(descriptor!=IntPtr.Zero)LocalFree(descriptor);}
    }
    static Held Hold(string path,bool directory,bool package,long maximum){
        return OpenCore(path,directory,package,maximum,descriptor=>SodaDesktopSigninPackage.CodeAcl(descriptor,package),null);
    }
    // Internal test seams exercise the same native ownership path on generated
    // ordinary-user files. Verify always supplies the fixed CodeAcl policy.
    internal static Held OpenCore(string path,bool directory,bool package,long maximum,Func<byte[],bool> policy,Action<FileStream> afterOpen){return OpenSharedCore(path,directory,package,maximum,1,policy,afterOpen);}
    internal static Held OpenRenamableCore(string path,long maximum,Func<byte[],bool> policy){return OpenSharedCore(path,false,true,maximum,5,policy,null);}
    internal static Held OpenExclusiveCore(string path,Func<byte[],bool> policy,Action<FileStream> afterOpen){return OpenSharedCore(path,false,true,1,0,policy,afterOpen);}
    static Held OpenSharedCore(string path,bool directory,bool package,long maximum,uint share,Func<byte[],bool> policy,Action<FileStream> afterOpen){
        var handle=CreateFileW(path,directory?0x20080u:0x80020000u,share,IntPtr.Zero,3,(directory?0x02000000u:0x08000000u)|0x00200000u,IntPtr.Zero);
        Held held=null;
        try {
            if(handle==null||handle.IsInvalid)throw Failure();
            held=new Held{Path=path,Directory=directory,Package=package,Maximum=maximum,Handle=handle,Before=Facts(handle)};
            if(!held.Before.Regular(directory,maximum)||!policy(Security(handle)))throw Failure();
            if(!directory){held.Stream=new FileStream(handle,FileAccess.Read,65536,false);if(afterOpen!=null)afterOpen(held.Stream);}
            return held;
        }catch{if(held!=null)held.Dispose();else if(handle!=null)handle.Dispose();throw;}
    }
    internal static void Release(List<Held> held){for(int i=held.Count-1;i>=0;i--){try{held[i].Dispose();}catch{}}held.Clear();}
    internal static void CheckCore(Held held,Func<byte[],bool> policy){if(!held.Before.Same(Facts(held.Handle),held.Directory,held.Maximum)||!policy(Security(held.Handle)))throw Failure();}
    static void Check(Held held){CheckCore(held,bytes=>SodaDesktopSigninPackage.CodeAcl(bytes,held.Package));}
    static string Full(string root,string relative){return Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar));}
    static bool Within(string root,string path){return String.Equals(root,path,StringComparison.OrdinalIgnoreCase)||path.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
    static byte[] Read(Held file){
        int length=checked((int)file.Before.Value.SizeLow);var result=new byte[length];int offset=0;
        while(offset<length){int count=file.Stream.Read(result,offset,length-offset);if(count==0)throw Failure();offset+=count;}
        if(file.Stream.ReadByte()!=-1)throw Failure();return result;
    }
    static void Inventory(HashSet<string> directories,HashSet<string> files){
        var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);int maximum=directories.Count+files.Count;
        foreach(string directory in directories)foreach(string path in Directory.EnumerateFileSystemEntries(directory)){
            if(seen.Count>=maximum||!seen.Add(path)||!directories.Contains(path)&&!files.Contains(path))throw Failure();
        }
        if(seen.Count!=maximum-1)throw Failure();
    }
    /** Retain this lease until the verified child has stopped. Disposing it is
     * not a substitute for stopping a child; this verifier never launches one. */
    public sealed class Lease : IDisposable {
        readonly string root;readonly List<Held> held;readonly object gate=new object();bool closed;internal readonly string ManifestSha256;
        internal Lease(string root,List<Held> held,string manifestSha256){this.root=root;this.held=held;ManifestSha256=manifestSha256;}
        public bool Current(){lock(gate){try{return !closed&&SodaDesktopSigninVault.SystemPrimary()&&!closed;}catch{return false;}}}
        string Get(string relative){if(!Current())throw Failure();return Full(root,relative);}
        public string Node {get{return Get("node.exe");}}
        public string Bootstrap {get{return Get("bootstrap.mjs");}}
        public void Dispose(){lock(gate){if(closed)return;closed=true;Release(held);}}
    }
    public static Lease Verify(string owner){return VerifyImage(owner,"DesktopSigninService.exe");}
    public static Lease VerifyWorker(string owner){return VerifyImage(owner,"DesktopSigninWorker.exe");}
    static Lease VerifyImage(string owner,string image){
        var held=new List<Held>();bool transferred=false;
        try {
            if(!SodaDesktopSigninVault.SystemPrimary()||!Environment.Is64BitProcess)throw Failure();
            VerifyLayouts();
            string program=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),root=Path.Combine(program,"Sodashitsu","DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner));
            using(var self=Process.GetCurrentProcess())if(!String.Equals(self.MainModule.FileName,Full(root,image),StringComparison.OrdinalIgnoreCase))throw Failure();
            if(root.Length>512||root.Length<3||root[1]!=':'||root[2]!='\\')throw Failure();
            var drive=new DriveInfo(Path.GetPathRoot(root));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();
            var allDirectories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var packageDirectories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var files=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(string name in SodaDesktopSigninPackage.RequiredPaths())files.Add(Full(root,name));files.Add(Full(root,"signin-package.json"));
            foreach(string file in files){string current=Path.GetDirectoryName(file);int depth=0;while(!String.IsNullOrEmpty(current)){if(++depth>64)throw Failure();allDirectories.Add(current);if(Within(root,current))packageDirectories.Add(current);current=Path.GetDirectoryName(current);}}
            var ordered=new List<string>(allDirectories);ordered.Sort((a,b)=>a.Length==b.Length?StringComparer.OrdinalIgnoreCase.Compare(a,b):a.Length.CompareTo(b.Length));
            foreach(string directory in ordered)held.Add(Hold(directory,true,Within(root,directory),0));
            Inventory(packageDirectories,files);
            var manifest=Hold(Full(root,"signin-package.json"),false,true,32768);held.Add(manifest);
            byte[] manifestBytes=Read(manifest);string manifestSha256;SodaDesktopSigninPackage description;try{using(var sha=SHA256.Create())manifestSha256=BitConverter.ToString(sha.ComputeHash(manifestBytes)).Replace("-","").ToLowerInvariant();description=SodaDesktopSigninPackage.Decode(new UTF8Encoding(false,true).GetString(manifestBytes),owner);}finally{Array.Clear(manifestBytes,0,manifestBytes.Length);}Check(manifest);
            foreach(var entry in description.Entries()){
                var file=Hold(Full(root,entry.Path),false,true,SodaDesktopSigninPackage.MaximumBytes(entry.Path));held.Add(file);
                if(file.Before.Value.SizeLow!=entry.Bytes)throw Failure();
                string hash;using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(file.Stream)).Replace("-","").ToLowerInvariant();
                if(hash!=entry.Sha256)throw Failure();Check(file);
            }
            Inventory(packageDirectories,files);foreach(var file in held)Check(file);
            if(!SodaDesktopSigninVault.SystemPrimary())throw Failure();
            var lease=new Lease(root,held,manifestSha256);transferred=true;return lease;
        }catch{throw Failure();}finally{if(!transferred)Release(held);}
    }
}
