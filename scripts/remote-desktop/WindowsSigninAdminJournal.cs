// Fixed journal transitions only. Caller must hold the owner controller mutex /
// quiescence boundary and validate the private directory and every ancestor.
// This core does not authenticate an administrator or initialize storage.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

public sealed class SodaDesktopSigninAdminJournal {
    readonly string directory;readonly Func<bool> owned;bool ended,checking;
    static Exception Failure(){return new InvalidOperationException("Signin administration journal is unavailable");}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,ExactSpelling=true)]static extern bool MoveFileExW(string source,string destination,uint flags);
    public SodaDesktopSigninAdminJournal(string directory,Func<bool> owned){if(String.IsNullOrEmpty(directory)||!Path.IsPathRooted(directory)||owned==null)throw Failure();this.directory=directory;this.owned=owned;Current();}
    void Current(){if(ended||checking){ended=true;throw Failure();}checking=true;try{if(!owned()||ended){ended=true;throw Failure();}}catch{ended=true;throw;}finally{checking=false;}}
    string PathOf(string name){return Path.Combine(directory,name);}
    static string Digest(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    static bool Hash(string text){if(text==null||text.Length!=64)return false;foreach(char c in text)if(!(c>='0'&&c<='9'||c>='a'&&c<='f'))return false;return true;}
    public string State(){
        Current();string[] files=Directory.GetFileSystemEntries(directory);Current();
        if(files.Length==0)return "normal";
        return files.Length==1&&String.Equals(Path.GetFileName(files[0]),"admin.pending",StringComparison.Ordinal)?"claim":"recovery";
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,ExactSpelling=true)]static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    internal static FileStream Read(string path){var handle=CreateFileW(path,0x80000000,5,IntPtr.Zero,3,0x200000,IntPtr.Zero);try{if(handle.IsInvalid)throw Failure();return new FileStream(handle,FileAccess.Read);}catch{handle.Dispose();throw;}}
    byte[] Bytes(FileStream stream){
        Current();var before=SodaDesktopSigninVault.Facts(stream.SafeFileHandle);if(!before.Regular)throw Failure();
        var bytes=new byte[(int)stream.Length];bool transferred=false;
        try{int offset=0;while(offset<bytes.Length){Current();int count=stream.Read(bytes,offset,bytes.Length-offset);if(count==0)throw Failure();offset+=count;}if(stream.ReadByte()!=-1||!before.Same(SodaDesktopSigninVault.Facts(stream.SafeFileHandle)))throw Failure();Current();transferred=true;return bytes;}
        finally{if(!transferred)Array.Clear(bytes,0,bytes.Length);}
    }
    public sealed class ClaimData {
        public readonly string Sha256;public readonly byte[] CipherEnvelope;
        internal ClaimData(string digest,byte[] bytes){Sha256=digest;CipherEnvelope=bytes;}
    }
    public ClaimData Claim(){
        Current();if(State()!="claim")throw Failure();byte[] bytes=null;bool transferred=false;
        try{using(var pending=Read(PathOf("admin.pending"))){
            var before=SodaDesktopSigninVault.Facts(pending.SafeFileHandle);bytes=Bytes(pending);Current();
            // Same volume, no replace/copy/reboot flag. Write-through rename is
            // the durable claim boundary before any operation may be dispatched.
            if(!MoveFileExW(PathOf("admin.pending"),PathOf("admin.claimed"),8))throw Failure();
            using(var claimed=Read(PathOf("admin.claimed"))){if(!before.Same(SodaDesktopSigninVault.Facts(claimed.SafeFileHandle)))throw Failure();}
            Current();var value=new ClaimData(Digest(bytes),bytes);transferred=true;return value;
        }}finally{if(!transferred&&bytes!=null)Array.Clear(bytes,0,bytes.Length);}
    }
    public ClaimData Claimed(){
        Current();if(Directory.GetFileSystemEntries(directory).Length!=1||State()!="recovery")throw Failure();
        using(var file=Read(PathOf("admin.claimed"))){byte[] bytes=Bytes(file);try{Current();return new ClaimData(Digest(bytes),bytes);}catch{Array.Clear(bytes,0,bytes.Length);throw;}}
    }
    void Match(string name,string expected){
        if(!Hash(expected))throw Failure();byte[] bytes=null;
        try{using(var file=Read(PathOf(name)))bytes=Bytes(file);if(Digest(bytes)!=expected)throw Failure();Current();}finally{if(bytes!=null)Array.Clear(bytes,0,bytes.Length);}
    }
    void Atomic(string stage,string destination,byte[] bytes){
        if(bytes==null||bytes.Length<1||bytes.Length>16384)throw Failure();Current();byte[] copy=(byte[])bytes.Clone();
        try{using(var file=new FileStream(PathOf(stage),FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(copy,0,copy.Length);Current();file.Flush(true);}
        Current();if(!MoveFileExW(PathOf(stage),PathOf(destination),8))throw Failure();Current();}finally{Array.Clear(copy,0,copy.Length);}
    }
    public void Result(string claimSha256,byte[] publicResult){
        Current();if(State()!="recovery"||Directory.GetFileSystemEntries(directory).Length!=1)throw Failure();Match("admin.claimed",claimSha256);
        Atomic("admin.result.pending","admin.result",publicResult);
    }
    public void Acknowledge(string claimSha256,string resultSha256){
        Current();if(Directory.GetFileSystemEntries(directory).Length!=2)throw Failure();Match("admin.claimed",claimSha256);Match("admin.result",resultSha256);
        byte[] ack=Encoding.ASCII.GetBytes(claimSha256+"\n"+resultSha256+"\n");try{Atomic("admin.ack.pending","admin.ack",ack);}finally{Array.Clear(ack,0,ack.Length);}
        // Ack remains until both originals have been removed. Every interrupted
        // cleanup therefore remains administrative recovery on the next start.
        Current();File.Delete(PathOf("admin.claimed"));Current();File.Delete(PathOf("admin.result"));Current();File.Delete(PathOf("admin.ack"));Current();
    }
}
