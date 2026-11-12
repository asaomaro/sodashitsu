// Local, administrator-only request/reply. No durable request or result files.
using System;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using Microsoft.Win32.SafeHandles;
internal static class SodaDesktopSigninAdminPipe {
    [StructLayout(LayoutKind.Sequential)]struct SA{internal int Size;internal IntPtr Descriptor;internal int Inherit;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern SafePipeHandle CreateNamedPipeW(string name,uint open,uint mode,uint max,uint output,uint input,uint timeout,ref SA sa);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe,out uint pid);
    internal static string Name(string owner){return "SodaDesktopSigninAdmin-"+SodaDesktopSigninPackage.Slot(owner);}
    static void Require(bool value){if(!value)throw new InvalidOperationException("Signin administration is unavailable");}
    internal static NamedPipeServerStream Listen(string owner){
        var acl=new RawSecurityDescriptor("O:SYG:SYD:P(D;;GA;;;NU)(A;;GA;;;SY)(A;;GA;;;BA)");byte[] bytes=new byte[acl.BinaryLength];acl.GetBinaryForm(bytes,0);var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);SafePipeHandle handle=null;
        try{
            var sa=new SA{Size=Marshal.SizeOf(typeof(SA)),Descriptor=pinned.AddrOfPinnedObject()};
            // FIRST_PIPE_INSTANCE, overlapped, byte stream, REJECT_REMOTE_CLIENTS.
            handle=CreateNamedPipeW(@"\\.\pipe\"+Name(owner),0x40080003,8,1,16388,16388,0,ref sa);Require(handle!=null&&!handle.IsInvalid);
            var pipe=new NamedPipeServerStream(PipeDirection.InOut,true,false,handle);handle=null;return pipe;
        }finally{if(handle!=null)handle.Dispose();pinned.Free();}
    }
    internal static void Authenticate(NamedPipeServerStream pipe){
        bool admin=false;pipe.RunAsClient(()=>{using(var identity=WindowsIdentity.GetCurrent())admin=identity.ImpersonationLevel>=TokenImpersonationLevel.Impersonation&&new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);});Require(admin&&SodaDesktopSigninVault.SystemPrimary());
    }
    internal static void AuthenticateServer(NamedPipeClientStream pipe,uint expectedPid){uint pid;Require(GetNamedPipeServerProcessId(pipe.SafePipeHandle,out pid)&&pid==expectedPid);}
    internal static byte[] Read(Stream stream){
        var header=new byte[4];Exact(stream,header);int size=BitConverter.ToInt32(header,0);Require(size>0&&size<=16384);var bytes=new byte[size];try{Exact(stream,bytes);return bytes;}catch{Array.Clear(bytes,0,bytes.Length);throw;}
    }
    static void Exact(Stream stream,byte[] bytes){int at=0;while(at<bytes.Length){int count=stream.Read(bytes,at,bytes.Length-at);if(count==0)throw new EndOfStreamException();at+=count;}}
    internal static void Write(Stream stream,byte[] bytes){Require(bytes!=null&&bytes.Length>0&&bytes.Length<=16384);var header=BitConverter.GetBytes(bytes.Length);stream.Write(header,0,4);stream.Write(bytes,0,bytes.Length);stream.Flush();}
}
