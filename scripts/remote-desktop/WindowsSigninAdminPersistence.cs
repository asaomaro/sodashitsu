// Only fixed installed SYSTEM helper entry points call the public wrapper.
// Core accepts generated temp roots/ACL callbacks for tests; it is not auth.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
public static class SodaDesktopSigninAdminPersistence {
    static Exception Failure(){return new InvalidOperationException("Signin administration persistence is unavailable");}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle file,out SodaDesktopSigninVault.Info info);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint GetFileType(SafeFileHandle file);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string source,string destination,uint flags);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool DeleteFileW(string path);
    static void Current(Func<bool> current){if(current==null||!current())throw Failure();}
    static string Full(string path){if(String.IsNullOrEmpty(path)||!Path.IsPathRooted(path)||path.Length>512||path.Length<3||path[1]!=':'||path[2]!='\\'||path.Substring(2).Contains(":"))throw Failure();string full=Path.GetFullPath(path);if(!String.Equals(full,path,StringComparison.OrdinalIgnoreCase))throw Failure();return full;}
    static bool SamePath(string a,string b){return String.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
    static SafeFileHandle DirectoryLease(string path,Func<string,bool> policy){
        var file=CreateFileW(path,0x20080,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);try{SodaDesktopSigninVault.Info info;if(file.IsInvalid||GetFileType(file)!=1||!GetFileInformationByHandle(file,out info)||(info.Attributes&16)==0||(info.Attributes&1024)!=0||!policy(path))throw Failure();return file;}catch{file.Dispose();throw;}
    }
    public static void CommitVault(string owner,string source,string destination,string kind,Func<bool> current,Func<string,bool> directoryPolicy,Func<FileStream,bool> filePolicy){
        if(!SodaDesktopSigninVault.SystemPrimary()||!SodaDesktopSigninVault.UserAccount(owner))throw Failure();
        string runtime=Path.Combine(Path.GetDirectoryName(SodaDesktopSigninVault.StoragePath(owner)),"runtime");
        CommitVaultCore(runtime,source,destination,kind,current,directoryPolicy,filePolicy);
    }
    internal static void CommitVaultCore(string runtime,string source,string destination,string kind,Func<bool> current,Func<string,bool> directoryPolicy,Func<FileStream,bool> filePolicy,Action afterFinalInspection=null){
        Current(current);runtime=Full(runtime);source=Full(source);destination=Full(destination);if(directoryPolicy==null||filePolicy==null)throw Failure();
        bool marker=SamePath(destination,Path.Combine(runtime,"desktop-endpoint-required.json")),identity=SamePath(destination,Path.Combine(runtime,"desktop-endpoint","identity.json"));
        if(!marker&&!identity||kind!="initialize"&&kind!="trust"&&kind!="revoke"||marker&&kind!="initialize")throw Failure();
        string stage=Path.GetDirectoryName(source),leaf=Path.GetFileName(stage),directory=Path.Combine(runtime,"desktop-endpoint");
        if(!SamePath(Path.GetDirectoryName(stage),directory)||!Regex.IsMatch(leaf,marker?"\\A\\.policy-[A-Za-z0-9]{6}\\z":"\\A\\.write-[A-Za-z0-9]{6}\\z")||Path.GetFileName(source)!=(marker?"required.json":"identity.json"))throw Failure();
        var held=new List<SafeFileHandle>();FileStream target=null;
        try{
            foreach(string path in new[]{runtime,directory,stage}){Current(current);held.Add(DirectoryLease(path,directoryPolicy));}
            Current(current);using(var file=SodaDesktopSigninAdminJournal.Read(source)){
                var before=SodaDesktopSigninVault.Facts(file.SafeFileHandle);if(!before.Regular||!filePolicy(file))throw Failure();
                // A missing target is allowed for explicit initialization. Any
                // existing target must be a single private regular file.
                string parent=Path.GetDirectoryName(destination);bool exists=false;foreach(string item in Directory.GetFileSystemEntries(parent))if(SamePath(item,destination)){exists=true;break;}
                if(!exists&&kind!="initialize")throw Failure();
                if(exists){target=SodaDesktopSigninAdminJournal.Read(destination);if(!SodaDesktopSigninVault.Facts(target.SafeFileHandle).Regular||!filePolicy(target))throw Failure();target.Dispose();target=null;}
                if(!before.Same(SodaDesktopSigninVault.Facts(file.SafeFileHandle)))throw Failure();
                if(afterFinalInspection!=null)afterFinalInspection();
                Current(current);if(!MoveFileExW(source,destination,9))throw Failure();
                using(var actual=SodaDesktopSigninAdminJournal.Read(destination)){if(!before.Same(SodaDesktopSigninVault.Facts(actual.SafeFileHandle))||!filePolicy(actual))throw Failure();}
                Current(current);
            }
        }finally{if(target!=null)target.Dispose();for(int i=held.Count-1;i>=0;i--)held[i].Dispose();}
    }
    public static void Enrollment(string owner,string nonce,byte[] plain,string kind,Func<bool> current,Func<string,bool> directoryPolicy,Func<FileStream,bool> filePolicy){
        if(!SodaDesktopSigninVault.SystemPrimary()||!SodaDesktopSigninVault.UserAccount(owner)||kind!="enroll")throw Failure();Current(current);byte[] cipher=null;
        try{cipher=SodaDesktopSigninVault.Protect(plain,owner);EnrollmentCore(SodaDesktopSigninVault.StoragePath(owner),nonce,cipher,current,directoryPolicy,filePolicy);}finally{if(cipher!=null)Array.Clear(cipher,0,cipher.Length);}
    }
    internal static void EnrollmentCore(string path,string nonce,byte[] cipher,Func<bool> current,Func<string,bool> directoryPolicy,Func<FileStream,bool> filePolicy){
        Current(current);path=Full(path);Guid id;if(Path.GetFileName(path)!="enrollment.dpapi"||!Guid.TryParseExact(nonce,"D",out id)||id==Guid.Empty||id.ToString("D")!=nonce||cipher==null||cipher.Length<1||cipher.Length>65536||directoryPolicy==null||filePolicy==null)throw Failure();
        string directory=Path.GetDirectoryName(path),stage=Path.Combine(directory,".enrollment-"+nonce+".pending");bool created=false,moved=false;SodaDesktopSigninVault.FileFacts ours=null;
        using(var lease=DirectoryLease(directory,directoryPolicy))try{
            Current(current);using(var output=new FileStream(stage,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None)){
                created=true;Current(current);output.Write(cipher,0,cipher.Length);Current(current);output.Flush(true);ours=SodaDesktopSigninVault.Facts(output.SafeFileHandle);if(!ours.Regular||!filePolicy(output))throw Failure();
            }
            using(var source=SodaDesktopSigninAdminJournal.Read(stage)){
                if(!ours.Same(SodaDesktopSigninVault.Facts(source.SafeFileHandle))||!filePolicy(source))throw Failure();
                foreach(string item in Directory.GetFileSystemEntries(directory))if(SamePath(item,path)){using(var old=SodaDesktopSigninAdminJournal.Read(path)){if(!SodaDesktopSigninVault.Facts(old.SafeFileHandle).Regular||!filePolicy(old))throw Failure();}break;}
                Current(current);if(!MoveFileExW(stage,path,9))throw Failure();moved=true;
                using(var actual=SodaDesktopSigninAdminJournal.Read(path)){if(!ours.Same(SodaDesktopSigninVault.Facts(actual.SafeFileHandle))||!filePolicy(actual))throw Failure();}Current(current);
            }
        }finally{
            // Only clean a stage whose exact identity was captured after a
            // successful flush. Unknown/partial files remain explicit recovery.
            if(created&&!moved&&ours!=null)try{using(var file=SodaDesktopSigninAdminJournal.Read(stage)){if(ours.Same(SodaDesktopSigninVault.Facts(file.SafeFileHandle)))File.Delete(stage);}}catch{}
        }
    }
    public static void DisableEnrollment(string owner,string kind,Func<bool> current,Func<string,bool> directoryPolicy,Func<FileStream,bool> filePolicy){
        if(!SodaDesktopSigninVault.SystemPrimary()||!SodaDesktopSigninVault.UserAccount(owner)||kind!="disable")throw Failure();DisableEnrollmentCore(SodaDesktopSigninVault.StoragePath(owner),current,directoryPolicy,filePolicy);
    }
    internal static void DisableEnrollmentCore(string path,Func<bool> current,Func<string,bool> directoryPolicy,Func<FileStream,bool> filePolicy){
        Current(current);path=Full(path);if(Path.GetFileName(path)!="enrollment.dpapi"||directoryPolicy==null||filePolicy==null)throw Failure();string directory=Path.GetDirectoryName(path);
        using(var lease=DirectoryLease(directory,directoryPolicy)){
            bool exists=false;foreach(string item in Directory.GetFileSystemEntries(directory))if(SamePath(item,path)){exists=true;break;}if(!exists){Current(current);return;}
            using(var file=SodaDesktopSigninAdminJournal.Read(path)){
                if(!SodaDesktopSigninVault.Facts(file.SafeFileHandle).Regular||!filePolicy(file))throw Failure();Current(current);if(!DeleteFileW(path))throw Failure();
            }Current(current);
        }
    }

}
