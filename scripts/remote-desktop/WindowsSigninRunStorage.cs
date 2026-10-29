// Installed Host-only fixed path adapter. No storage initialization or repair.
using System;
using System.IO;
using System.Collections.Generic;
using System.Security.Cryptography;
internal static class SodaDesktopSigninRunStorage {
    static Exception Failure(){return new InvalidOperationException("Signin run storage is unavailable");}
    static string Slot(string owner){
        string path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"sodashitsu","desktop-signin",SodaDesktopSigninPackage.Slot(owner));
        if(path.Length>512||path.Length<3||path[1]!=':'||path[2]!='\\')throw Failure();var drive=new DriveInfo(Path.GetPathRoot(path));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();return path;
    }
    internal static SodaDesktopSigninRunJournal OpenHost(string owner,string package,string barrier,Func<bool> current){
        return OpenFixed(owner,package,barrier,SodaDesktopSigninRunJournal.Role.Host,current,false);
    }
    internal static SodaDesktopSigninRunJournal OpenController(string owner,string package,string barrier,SodaDesktopSigninRunJournal.Role role,Func<bool> current){
        if(role!=SodaDesktopSigninRunJournal.Role.Reader&&role!=SodaDesktopSigninRunJournal.Role.Controller&&role!=SodaDesktopSigninRunJournal.Role.Observer)throw Failure();return OpenFixed(owner,package,barrier,role,current,true);
    }
    static SodaDesktopSigninRunJournal OpenFixed(string owner,string package,string barrier,SodaDesktopSigninRunJournal.Role role,Func<bool> current,bool controller){
        if(!SodaDesktopSigninPackageNative.Authority(controller)||current==null||!current())throw Failure();string slot=Slot(owner),runs=Path.Combine(slot,"runs");
        var parents=new List<string>();for(string item=slot;!String.IsNullOrEmpty(item);item=Path.GetDirectoryName(item)){if(parents.Count>=64)throw Failure();parents.Add(item);}parents.Reverse();
        return new SodaDesktopSigninRunJournal(runs,owner,package,barrier,role,()=>SodaDesktopSigninPackageNative.Authority(controller)&&current(),SodaDesktopSigninQuiescence.Private,parents,(path,bytes)=>String.Equals(path,slot,StringComparison.OrdinalIgnoreCase)||String.Equals(path,runs,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(bytes):SodaDesktopSigninPackage.CodeAcl(bytes,false),()=>SodaDesktopSigninControllerMutex.AcquireJournal(owner,5000));
    }
    // No decryption: only the actual pending envelope's canonical owner/nonce
    // and cipher-envelope digest are needed to bind the selected startup branch.
    internal static bool ControllerMode(string owner,SodaDesktopSigninRunRecord intent,Func<bool> current){if(!SodaDesktopSigninPackageNative.Authority(true))return false;return ModeCore(Path.Combine(Slot(owner),"admin"),owner,intent,current,SodaDesktopSigninQuiescence.Private);}
    internal static bool Mode(string owner,SodaDesktopSigninRunRecord intent,Func<bool> current){
        if(!SodaDesktopSigninVault.SystemPrimary())return false;
        return ModeCore(Path.Combine(Slot(owner),"admin"),owner,intent,current,SodaDesktopSigninQuiescence.Private);
    }
    internal static bool ModeCore(string directory,string owner,SodaDesktopSigninRunRecord intent,Func<bool> current,Func<byte[],bool> policy){
        if(intent==null||intent.Kind!="intent"||intent.Owner!=owner||current==null||!current())return false;
        using(var parent=SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,policy,null)){
            string[] files=Directory.GetFileSystemEntries(directory);SodaDesktopSigninPackageNative.CheckCore(parent,policy);if(!current())return false;
            if((string)intent.Field("mode")=="normal")return files.Length==0&&current();
            string pending=Path.Combine(directory,"admin.pending");if(files.Length!=1||!String.Equals(files[0],pending,StringComparison.OrdinalIgnoreCase))return false;
            using(var file=SodaDesktopSigninPackageNative.OpenCore(pending,false,true,65536,policy,null)){
                byte[] bytes=new byte[checked((int)file.Before.Value.SizeLow)];
                try{int at=0;while(at<bytes.Length){if(!current())return false;int n=file.Stream.Read(bytes,at,bytes.Length-at);if(n==0)return false;at+=n;}if(file.Stream.ReadByte()!=-1)return false;SodaDesktopSigninPackageNative.CheckCore(file,policy);SodaDesktopSigninPackageNative.CheckCore(parent,policy);
                    using(var envelope=SodaDesktopSigninAdminEnvelope.Decode(bytes,owner))using(var sha=SHA256.Create())return envelope.Nonce==(string)intent.Field("adminNonce")&&BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()==(string)intent.Field("adminSha256")&&current();
                }finally{Array.Clear(bytes,0,bytes.Length);}
            }
        }
    }
}
