// Read-only SYSTEM worker facts. Construction is runtime-only and is never called
// by automated compile/policy checks. Does not acquire input rights or grant consent.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;

public sealed class SodaDesktopProtectedScopeNative : IDisposable {
    readonly SodaDesktopProtectedScope scope;
    readonly Process self,broker;
    readonly Thread observer;
    readonly ManualResetEventSlim ready=new ManualResetEventSlim(false);
    readonly WinEvent callback;
    volatile bool live,disposed;
    int observerId;
    readonly SodaDesktopProtectedEpoch epochs=new SodaDesktopProtectedEpoch();
    ushort markerAtom;
    int markerThread;
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]delegate void WinEvent(IntPtr hook,uint kind,IntPtr hwnd,int objectId,int child,uint eventThread,uint time);
    [StructLayout(LayoutKind.Sequential)]struct Message {public IntPtr Window;public uint Kind;public UIntPtr WParam;public IntPtr LParam;public uint Time;public int X,Y;public uint Private;}
    [StructLayout(LayoutKind.Sequential)]struct GroupEntry {public IntPtr Sid;public uint Flags;}
    [StructLayout(LayoutKind.Sequential)]struct Groups {public uint Count;public GroupEntry First;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern ushort GlobalAddAtom(string name);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern ushort GlobalDeleteAtom(ushort atom);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern void NotifyWinEvent(uint kind,IntPtr window,int objectId,int child);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("wtsapi32.dll",SetLastError=true)]static extern bool WTSQueryUserToken(uint session,out IntPtr token);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr GetThreadDesktop(uint thread);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr desktop);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool GetUserObjectInformation(IntPtr value,int kind,StringBuilder name,uint size,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEvent callback,uint process,uint thread,uint flags);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern bool UnhookWinEvent(IntPtr hook);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool PeekMessage(out Message message,IntPtr window,uint min,uint max,uint remove);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetMessage(out Message message,IntPtr window,uint min,uint max);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
    public SodaDesktopProtectedScopeNative(SodaDesktopProtectedScope scope){
        if(scope==null)throw new ArgumentNullException("scope");this.scope=scope;
        using(var identity=WindowsIdentity.GetCurrent())if(!identity.IsSystem)throw new InvalidOperationException("Protected worker identity required");
        self=Process.GetCurrentProcess();
        try{
            broker=Process.GetProcessById(scope.BrokerPid);
            // Open/cache real process handles before validating PID and creation time.
            if(self.HasExited||broker.HasExited||self.Id!=scope.WorkerPid||self.StartTime.ToUniversalTime().Ticks!=scope.WorkerStarted||broker.StartTime.ToUniversalTime().Ticks!=scope.BrokerStarted||self.SessionId!=scope.Session||broker.SessionId!=0)throw new InvalidOperationException("Protected worker process scope mismatch");
            markerAtom=GlobalAddAtom("Sodashitsu.ProtectedObserver."+scope.Nonce.ToString("D"));
            if(markerAtom<0xc000)throw new InvalidOperationException("Protected observer marker unavailable");
            callback=(hook,kind,window,obj,child,thread,time)=>{
                if(kind==0x20)epochs.Changed();
                else if(kind==markerAtom&&window==IntPtr.Zero&&child==0&&thread==(uint)Interlocked.CompareExchange(ref markerThread,0,0))epochs.Marker(obj);
            };
            observer=new Thread(Observe){IsBackground=true};observer.Start();
            if(!ready.Wait(2000)||!live)throw new InvalidOperationException("Protected desktop observer unavailable");
        }catch{Dispose();throw;}
    }
    void Observe(){
        IntPtr hook=IntPtr.Zero;GCHandle root=GCHandle.Alloc(callback);
        try{
            Message message;PeekMessage(out message,IntPtr.Zero,0,0,0);Interlocked.Exchange(ref observerId,(int)GetCurrentThreadId());
            hook=SetWinEventHook(0x20,markerAtom,IntPtr.Zero,callback,0,0,0);live=hook!=IntPtr.Zero;ready.Set();
            if(!live)return;
            while(!disposed&&GetMessage(out message,IntPtr.Zero,0,0)>0){}
        }catch{}finally{live=false;if(hook!=IntPtr.Zero)UnhookWinEvent(hook);root.Free();epochs.Dispose();if(markerAtom!=0){GlobalDeleteAtom(markerAtom);markerAtom=0;}}
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
        if(disposed||!live)return facts;
        try{
            long before;if(!Checkpoint(out before))return facts;
            using(var identity=WindowsIdentity.GetCurrent())facts.System=identity.IsSystem;
            facts.Session=self.SessionId;uint active=WTSGetActiveConsoleSessionId();facts.ActiveSession=active>Int32.MaxValue?-1:(int)active;
            if(!facts.System||facts.Session!=scope.Session||facts.ActiveSession!=scope.Session||broker.HasExited||self.HasExited)return facts;
            facts.BrokerPid=broker.Id;facts.BrokerStarted=broker.StartTime.ToUniversalTime().Ticks;facts.WorkerPid=self.Id;facts.WorkerStarted=self.StartTime.ToUniversalTime().Ticks;
            string owner,logon;if(!User(active,out owner,out logon))return facts;
            facts.Owner=owner;facts.Logon=logon;facts.LockState=lockState();
            IntPtr input=OpenInputDesktop(0,false,1);try{facts.Desktop=DesktopName(input);}finally{if(input!=IntPtr.Zero)CloseDesktop(input);}
            facts.ThreadDesktop=DesktopName(GetThreadDesktop(GetCurrentThreadId()));
            string againOwner,againLogon;long after;if(!Checkpoint(out after)){facts.System=false;return facts;}facts.DesktopEpoch=after;
            bool same=before==after&&WTSGetActiveConsoleSessionId()==active&&User(active,out againOwner,out againLogon)&&owner==againOwner&&logon==againLogon&&!disposed&&live;
            // Locking while already on Winlogon does not necessarily change the
            // desktop name. Re-read lock state after the identity/desktop reads.
            SealSnapshot(facts,()=>{long final;return same&&!disposed&&live&&Checkpoint(out final)&&final==before;},lockState);
            return facts;
        }catch{facts.System=false;return facts;}
    }
    bool Checkpoint(out long value){
        return epochs.Checkpoint(sequence=>{Interlocked.Exchange(ref markerThread,(int)GetCurrentThreadId());NotifyWinEvent(markerAtom,IntPtr.Zero,sequence,0);},250,out value);
    }
    public static void SealSnapshot(SodaDesktopProtectedScope.Facts facts,Func<bool> same,Func<int> lockState){
        try{if(same()&&lockState()==facts.LockState&&same())return;}catch{}
        facts.System=false;facts.Desktop=null;
    }
    public void Dispose(){disposed=true;epochs.Dispose();int thread=Interlocked.CompareExchange(ref observerId,0,0);if(thread!=0)PostThreadMessage((uint)thread,0x12,UIntPtr.Zero,IntPtr.Zero);bool ended=observer==null||observer.Join(1000);if(ended){ready.Dispose();if(markerAtom!=0){GlobalDeleteAtom(markerAtom);markerAtom=0;}}if(broker!=null)broker.Dispose();if(self!=null)self.Dispose();}
    public static void VerifyLayouts(){if(IntPtr.Size!=8||Marshal.SizeOf(typeof(Message))!=48||Marshal.SizeOf(typeof(GroupEntry))!=16||Marshal.OffsetOf(typeof(Groups),"First").ToInt32()!=8)throw new InvalidOperationException("Protected scope native ABI");}
}
