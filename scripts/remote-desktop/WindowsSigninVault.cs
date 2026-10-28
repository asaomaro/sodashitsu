// Dedicated enrollment protection and read-only facts. No service or OS input.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class SodaDesktopSigninVault {
    [StructLayout(LayoutKind.Sequential)]internal struct Info {
        public uint Attributes,CreatedLow,CreatedHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",SetLastError=true)]static extern uint GetFileType(SafeFileHandle handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr GetStdHandle(int kind);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool LookupAccountSidW(string system,byte[] sid,StringBuilder name,ref uint nameSize,StringBuilder domain,ref uint domainSize,out int use);
    static Exception Failure(){return new InvalidOperationException("Signin enrollment is unavailable");}
    public static void VerifyLayouts(){if(Marshal.SizeOf(typeof(Info))!=52 || Marshal.OffsetOf(typeof(Info),"Links").ToInt32()!=40)throw Failure();}
    public static string Owner(string owner){
        try {
            if(owner==null || owner.Length>184 || owner=="S-1-5-18" || owner=="S-1-5-19" || owner=="S-1-5-20")throw Failure();
            var sid=new SecurityIdentifier(owner);
            if(sid.Value!=owner)throw Failure();return owner;
        }catch{throw Failure();}
    }
    public static bool SystemPrimary(){using(var identity=WindowsIdentity.GetCurrent())return identity.IsSystem && identity.ImpersonationLevel==TokenImpersonationLevel.None;}
    public static bool PipeOutput(){using(var handle=new SafeFileHandle(GetStdHandle(-11),false))return !handle.IsInvalid && GetFileType(handle)==3;}
    public static bool PipeInput(){using(var handle=new SafeFileHandle(GetStdHandle(-10),false))return !handle.IsInvalid && GetFileType(handle)==3;}
    public static bool UserAccount(string owner){
        try {
            var sid=new SecurityIdentifier(Owner(owner));var bytes=new byte[sid.BinaryLength];sid.GetBinaryForm(bytes,0);
            uint nameSize=0,domainSize=0;int use;
            if(LookupAccountSidW(null,bytes,null,ref nameSize,null,ref domainSize,out use) || Marshal.GetLastWin32Error()!=122 || nameSize<1 || nameSize>1024 || domainSize>1024)return false;
            var name=new StringBuilder((int)nameSize);var domain=new StringBuilder((int)Math.Max(1,domainSize));
            return LookupAccountSidW(null,bytes,name,ref nameSize,domain,ref domainSize,out use) && use==1;
        }catch{return false;}
    }
    public static string StoragePath(string owner){
        var text=Encoding.UTF8.GetBytes(Owner(owner));byte[] hash;
        using(var sha=SHA256.Create())hash=sha.ComputeHash(text);
        string slot=BitConverter.ToString(hash).Replace("-","").ToLowerInvariant();
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"sodashitsu","desktop-signin",slot,"enrollment.dpapi");
    }
    static byte[] Entropy(string owner){return Encoding.UTF8.GetBytes("Sodashitsu signin enrollment v1\0"+Owner(owner));}
    public static byte[] Protect(byte[] plain,string owner){
        byte[] copy=null,entropy=null,result=null;
        try {
            if(plain==null || plain.Length<1 || plain.Length>16384)throw Failure();
            copy=(byte[])plain.Clone();entropy=Entropy(owner);result=ProtectedData.Protect(copy,entropy,DataProtectionScope.LocalMachine);
            if(result.Length<1 || result.Length>65536){Array.Clear(result,0,result.Length);throw Failure();}return result;
        }catch{throw Failure();}finally{if(copy!=null)Array.Clear(copy,0,copy.Length);if(entropy!=null)Array.Clear(entropy,0,entropy.Length);}
    }
    public static byte[] Unprotect(byte[] cipher,string owner){
        byte[] copy=null,entropy=null,result=null;
        try {
            if(cipher==null || cipher.Length<1 || cipher.Length>65536)throw Failure();
            copy=(byte[])cipher.Clone();entropy=Entropy(owner);result=ProtectedData.Unprotect(copy,entropy,DataProtectionScope.LocalMachine);
            if(result.Length<1 || result.Length>16384){Array.Clear(result,0,result.Length);throw Failure();}return result;
        }catch{throw Failure();}finally{if(copy!=null)Array.Clear(copy,0,copy.Length);if(entropy!=null)Array.Clear(entropy,0,entropy.Length);}
    }
    // Separate DPAPI domain for a single local administration request. ACLs
    // remain mandatory: machine DPAPI alone does not isolate local accounts.
    static byte[] AdminEntropy(string owner,string nonce){
        Guid value;if(nonce==null||!Guid.TryParseExact(nonce,"D",out value)||value==Guid.Empty||value.ToString("D")!=nonce)throw Failure();
        return Encoding.UTF8.GetBytes("Sodashitsu signin admin v1\0"+Owner(owner)+"\0"+nonce);
    }
    static byte[] AdminCrypt(byte[] input,string owner,string nonce,bool encrypt){
        byte[] copy=null,entropy=null,result=null;
        try{
            if(input==null||input.Length<1||input.Length>(encrypt?16384:65536))throw Failure();
            copy=(byte[])input.Clone();entropy=AdminEntropy(owner,nonce);
            result=encrypt?ProtectedData.Protect(copy,entropy,DataProtectionScope.LocalMachine):ProtectedData.Unprotect(copy,entropy,DataProtectionScope.LocalMachine);
            if(result.Length<1||result.Length>(encrypt?65536:16384)){Array.Clear(result,0,result.Length);throw Failure();}return result;
        }catch{throw Failure();}finally{if(copy!=null)Array.Clear(copy,0,copy.Length);if(entropy!=null)Array.Clear(entropy,0,entropy.Length);}
    }
    public static byte[] ProtectAdmin(byte[] plain,string owner,string nonce){return AdminCrypt(plain,owner,nonce,true);}
    public static byte[] UnprotectAdmin(byte[] cipher,string owner,string nonce){return AdminCrypt(cipher,owner,nonce,false);}
    public sealed class FileFacts {
        readonly Info info;
        readonly uint type;
        internal FileFacts(Info info,uint type){this.info=info;this.type=type;}
        public bool Regular {get{return type==1 && info.Links==1 && (info.Attributes&(16|1024))==0 && info.SizeHigh==0 && info.SizeLow>0 && info.SizeLow<=65536;}}
        public bool Same(FileFacts other){return other!=null && Regular && other.Regular && info.Volume==other.info.Volume && info.IndexHigh==other.info.IndexHigh && info.IndexLow==other.info.IndexLow && info.SizeLow==other.info.SizeLow && info.Attributes==other.info.Attributes && info.WriteLow==other.info.WriteLow && info.WriteHigh==other.info.WriteHigh;}
    }
    public static FileFacts Facts(SafeFileHandle handle){
        VerifyLayouts();Info info;if(handle==null || handle.IsInvalid || handle.IsClosed || !GetFileInformationByHandle(handle,out info))throw Failure();
        return new FileFacts(info,GetFileType(handle));
    }
}
