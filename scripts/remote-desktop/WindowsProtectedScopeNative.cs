// Read-only SYSTEM worker facts. Construction is runtime-only and is never called
// by automated compile/policy checks. Does not acquire input rights or grant consent.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

public sealed class SodaDesktopProtectedScopeNative : IDisposable {
    readonly SodaDesktopProtectedScope scope;
    readonly Process self,broker;
    volatile bool disposed;
    [StructLayout(LayoutKind.Sequential)]struct GroupEntry {public IntPtr Sid;public uint Flags;}
    [StructLayout(LayoutKind.Sequential)]struct Groups {public uint Count;public GroupEntry First;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("wtsapi32.dll",SetLastError=true)]static extern bool WTSQueryUserToken(uint session,out IntPtr token);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr GetThreadDesktop(uint thread);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr desktop);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool GetUserObjectInformation(IntPtr value,int kind,StringBuilder name,uint size,out uint needed);
    public SodaDesktopProtectedScopeNative(SodaDesktopProtectedScope scope){
        if(scope==null)throw new ArgumentNullException("scope");CheckLayouts();this.scope=scope;
        using(var identity=WindowsIdentity.GetCurrent())if(!identity.IsSystem)throw new InvalidOperationException("Protected worker identity required");
        self=Process.GetCurrentProcess();
        try{
            broker=Process.GetProcessById(scope.BrokerPid);
            // Explicitly retain kernel handles for the entire scope lifetime.
            if(self.Handle==IntPtr.Zero||broker.Handle==IntPtr.Zero)throw new InvalidOperationException("Protected process handle unavailable");
            if(self.HasExited||broker.HasExited||self.Id!=scope.WorkerPid||self.StartTime.ToUniversalTime().Ticks!=scope.WorkerStarted||broker.StartTime.ToUniversalTime().Ticks!=scope.BrokerStarted||self.SessionId!=scope.Session||broker.SessionId!=0)throw new InvalidOperationException("Protected worker process scope mismatch");
        }catch{Dispose();throw;}
    }
    static string DesktopName(IntPtr desktop){if(desktop==IntPtr.Zero)return null;uint needed;var text=new StringBuilder(256);return GetUserObjectInformation(desktop,2,text,512,out needed)&&needed<=512?text.ToString():null;}
    static bool User(uint session,out string owner,out string logon){
        owner=logon=null;IntPtr token;if(!WTSQueryUserToken(session,out token)||token==IntPtr.Zero)return false;
        try{using(var identity=new WindowsIdentity(token)){if(identity.User==null)return false;owner=identity.User.Value;}
            uint needed;GetTokenInformation(token,2,IntPtr.Zero,0,out needed);if(needed<8||needed>65536)return false;IntPtr data=Marshal.AllocHGlobal((int)needed);
            try{if(!GetTokenInformation(token,2,data,needed,out needed))return false;int count=Marshal.ReadInt32(data),offset=Marshal.OffsetOf(typeof(Groups),"First").ToInt32(),size=Marshal.SizeOf(typeof(GroupEntry));if(count<1||count>1024||offset+(long)count*size>needed)return false;
                for(int i=0;i<count;i++){var entry=(GroupEntry)Marshal.PtrToStructure(IntPtr.Add(data,offset+i*size),typeof(GroupEntry));if((entry.Flags&0xc0000000u)==0xc0000000u){if(logon!=null)return false;logon=new SecurityIdentifier(entry.Sid).Value;}}
                return logon!=null&&logon.StartsWith("S-1-5-5-",StringComparison.Ordinal);
            }finally{Marshal.FreeHGlobal(data);}
        }finally{CloseHandle(token);}
    }
    public SodaDesktopProtectedScope.Facts Read(Func<int> lockState){
        var facts=new SodaDesktopProtectedScope.Facts{Generation=scope.Generation,Nonce=scope.Nonce};
        if(disposed)return facts;
        try{
            using(var identity=WindowsIdentity.GetCurrent())facts.System=identity.IsSystem;
            facts.Session=self.SessionId;uint active=WTSGetActiveConsoleSessionId();facts.ActiveSession=active>Int32.MaxValue?-1:(int)active;
            if(!facts.System||facts.Session!=scope.Session||facts.ActiveSession!=scope.Session||broker.HasExited||self.HasExited)return facts;
            facts.BrokerPid=broker.Id;facts.BrokerStarted=broker.StartTime.ToUniversalTime().Ticks;facts.WorkerPid=self.Id;facts.WorkerStarted=self.StartTime.ToUniversalTime().Ticks;
            string owner,logon;if(!User(active,out owner,out logon))return facts;
            facts.Owner=owner;facts.Logon=logon;facts.LockState=lockState();
            IntPtr input=OpenInputDesktop(0,false,1);try{facts.Desktop=DesktopName(input);}finally{if(input!=IntPtr.Zero)CloseDesktop(input);}
            facts.ThreadDesktop=DesktopName(GetThreadDesktop(GetCurrentThreadId()));
            return facts;
        }catch{facts.System=false;return facts;}
    }
    public void Dispose(){disposed=true;if(broker!=null)broker.Dispose();if(self!=null)self.Dispose();}
    public static void CheckLayouts(){if(IntPtr.Size!=8||Marshal.SizeOf(typeof(GroupEntry))!=16||Marshal.OffsetOf(typeof(Groups),"First").ToInt32()!=8)throw new InvalidOperationException("Protected scope native ABI");}
}
