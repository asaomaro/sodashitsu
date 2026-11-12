// Fixed installation files only. New directories/files are never adopted or
// overwritten. Failed/private partial installation is left for explicit recovery.
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Text;
using System.Web.Script.Serialization;
internal static class SodaDesktopSigninInstallFiles {
    internal sealed class Paths {
        internal readonly string ProgramParent,DataParent,Code,Slot,Stage;
        internal Paths(string programParent,string dataParent,string owner,string id){ProgramParent=programParent;DataParent=dataParent;Code=Path.Combine(programParent,"DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner));Slot=Path.Combine(dataParent,SodaDesktopSigninPackage.Slot(owner));Stage=Path.Combine(programParent,".signin-"+SodaDesktopSigninPackage.Slot(owner)+"-"+id);
            foreach(string path in new[]{ProgramParent,DataParent}){if(path.Length<4||path.Length>512||path[1]!=':'||path[2]!='\\'||path.Substring(2).Contains(":"))throw Failure();var drive=new DriveInfo(Path.GetPathRoot(path));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();}
        }
        internal static Paths Installed(string owner,string id){SodaDesktopSigninVault.RequireNoLegacyState(owner);return new Paths(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu"),SodaDesktopSigninVault.StateRoot(),owner,id);}
    }
    [StructLayout(LayoutKind.Sequential)]struct SecurityAttributes {internal int Size;internal IntPtr Descriptor;internal int Inherit;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern uint GetFileAttributesW(string path);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool CreateDirectoryW(string path,ref SecurityAttributes security);
    static Exception Failure(){return new InvalidOperationException("Signin installation requires unused fixed paths");}
    internal static bool Absent(string path){uint value=GetFileAttributesW(path);if(value!=UInt32.MaxValue)return false;int error=Marshal.GetLastWin32Error();if(error!=2&&error!=3)throw Failure();return true;}
    internal static void CreatePrivateDirectory(string path){
        var descriptor=new RawSecurityDescriptor("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)");byte[] bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
        try{var security=new SecurityAttributes{Size=Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=pinned.AddrOfPinnedObject(),Inherit=0};if(!CreateDirectoryW(path,ref security))throw Failure();}finally{pinned.Free();}
    }
}
