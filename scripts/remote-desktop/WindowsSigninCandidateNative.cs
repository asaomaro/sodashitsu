// Called only by a future dedicated SYSTEM worker in its console session.
// No service startup, desktop switch, input, capture or privilege adjustment.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

public sealed class SodaDesktopSigninCandidateNative : SodaDesktopSigninCandidate.Host {
    [StructLayout(LayoutKind.Sequential)]struct Luid { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential)]struct Privilege { public Luid Id; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)]struct Privileges { public uint Count; public Privilege First; }
    public static void VerifyLayouts() {
        if(!BitConverter.IsLittleEndian || Marshal.SizeOf(typeof(Luid))!=8 || Marshal.SizeOf(typeof(Privilege))!=12 || Marshal.SizeOf(typeof(Privileges))!=16 || Marshal.OffsetOf(typeof(Privileges),"First").ToInt32()!=4)throw new InvalidOperationException("Signin candidate native layout mismatch");
    }
    public SodaDesktopSigninCandidateNative() { VerifyLayouts(); }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool LookupPrivilegeValue(string system,string name,out Luid id);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("wtsapi32.dll",SetLastError=true)]static extern bool WTSQueryUserToken(uint session,out IntPtr token);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool WTSQuerySessionInformationW(IntPtr server,uint session,int kind,out IntPtr buffer,out uint size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("wtsapi32.dll")]static extern void WTSFreeMemory(IntPtr buffer);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr GetProcessWindowStation();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr GetThreadDesktop(uint thread);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",SetLastError=true)]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",SetLastError=true)]static extern bool CloseDesktop(IntPtr desktop);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool GetUserObjectInformationW(IntPtr handle,int kind,StringBuilder name,uint bytes,out uint needed);
    public bool SystemWithTcb {
        get {
            using(var identity=WindowsIdentity.GetCurrent()) {
                if(!identity.IsSystem || identity.ImpersonationLevel!=TokenImpersonationLevel.None)return false;
                Luid id;
                if(!LookupPrivilegeValue(null,"SeTcbPrivilege",out id))return false;
                uint needed;
                if(GetTokenInformation(identity.Token,3,IntPtr.Zero,0,out needed) || Marshal.GetLastWin32Error()!=122 || needed<4 || needed>65536)return false;
                IntPtr buffer=Marshal.AllocHGlobal((int)needed);
                try {
                    uint actual;
                    if(!GetTokenInformation(identity.Token,3,buffer,needed,out actual) || actual<4 || actual>needed)return false;
                    var bytes=new byte[(int)actual];Marshal.Copy(buffer,bytes,0,(int)actual);
                    return EnabledPrivilege(bytes,id.Low,id.High);
                } finally { Marshal.FreeHGlobal(buffer); }
            }
        }
    }
    // Pure bounded TOKEN_PRIVILEGES parser, shared by generated ABI tests.
    public static bool EnabledPrivilege(byte[] bytes,uint low,int high) {
        if(bytes==null || bytes.Length<4 || bytes.Length>6148 || !BitConverter.IsLittleEndian)return false;
        uint count=BitConverter.ToUInt32(bytes,0);
        if(count>512 || 4L+12L*count!=bytes.Length)return false;
        bool found=false,enabled=false;
        for(int index=0;index<(int)count;index++) {
            int offset=4+index*12;
            if(BitConverter.ToUInt32(bytes,offset)!=low || BitConverter.ToInt32(bytes,offset+4)!=high)continue;
            if(found)return false;
            found=true;uint attributes=BitConverter.ToUInt32(bytes,offset+8);
            enabled=(attributes&2)!=0 && (attributes&4)==0;
        }
        return found && enabled;
    }
    public int WorkerSession { get { using(var self=Process.GetCurrentProcess())return self.SessionId; } }
    public uint ConsoleSession() { return WTSGetActiveConsoleSessionId(); }
    public bool SessionState(uint session,out int state) {
        state=-1;IntPtr buffer=IntPtr.Zero;uint size=0;
        try {
            if(!WTSQuerySessionInformationW(IntPtr.Zero,session,8,out buffer,out size) || buffer==IntPtr.Zero || size!=4)return false;
            state=Marshal.ReadInt32(buffer);return true;
        } finally { if(buffer!=IntPtr.Zero)WTSFreeMemory(buffer); }
    }
    public bool EmptyUserName(uint session) {
        IntPtr buffer=IntPtr.Zero;uint size=0;
        try {
            return WTSQuerySessionInformationW(IntPtr.Zero,session,5,out buffer,out size) && buffer!=IntPtr.Zero && size==2 && Marshal.ReadInt16(buffer)==0;
        } finally { if(buffer!=IntPtr.Zero)WTSFreeMemory(buffer); }
    }
    public bool QueryToken(uint session,out IntPtr token,out int error) {
        bool success=WTSQueryUserToken(session,out token);
        error=success?0:Marshal.GetLastWin32Error();return success;
    }
    public void CloseToken(IntPtr token) { if(!CloseHandle(token))throw new InvalidOperationException("Signin candidate token cleanup failed"); }
    static string Name(IntPtr handle) {
        if(handle==IntPtr.Zero)return null;
        var text=new StringBuilder(64);uint needed;
        return GetUserObjectInformationW(handle,2,text,128,out needed) && needed>2 && needed<=128 ? text.ToString() : null;
    }
    public bool DesktopNames(out string station,out string input,out string thread) {
        station=input=thread=null;
        // Borrowed process/thread handles must not be closed.
        station=Name(GetProcessWindowStation());thread=Name(GetThreadDesktop(GetCurrentThreadId()));
        if(station==null || thread==null)return false;
        IntPtr desktop=OpenInputDesktop(0,false,1);
        if(desktop==IntPtr.Zero)return false;
        bool closed=false;
        try { input=Name(desktop); }
        finally { closed=CloseDesktop(desktop); }
        return closed && input!=null;
    }
}
