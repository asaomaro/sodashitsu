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
    Thread observer;
    readonly ManualResetEventSlim ready=new ManualResetEventSlim(false);
    WinEvent callback;
    volatile bool live,disposed;
    int observerId;
    readonly SodaDesktopProtectedEpoch epochs=new SodaDesktopProtectedEpoch();
    ushort markerAtom;
    IntPtr markerWindow;
    readonly object markerGate=new object();
    int markerSequence,markerObject,markerChild;
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]delegate void WinEvent(IntPtr hook,uint kind,IntPtr hwnd,int objectId,int child,uint eventThread,uint time);
    [StructLayout(LayoutKind.Sequential)]struct Message {public IntPtr Window;public uint Kind;public UIntPtr WParam;public IntPtr LParam;public uint Time;public int X,Y;public uint Private;}
    [StructLayout(LayoutKind.Sequential)]struct GroupEntry {public IntPtr Sid;public uint Flags;}
    [StructLayout(LayoutKind.Sequential)]struct Groups {public uint Count;public GroupEntry First;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern ushort GlobalAddAtom(string name);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("kernel32.dll")]static extern ushort GlobalDeleteAtom(ushort atom);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowEx(uint extended,string kind,string title,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr window);
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
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll")]static extern bool TranslateMessage(ref Message message);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr DispatchMessage(ref Message message);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
    public SodaDesktopProtectedScopeNative(SodaDesktopProtectedScope scope){
        if(scope==null)throw new ArgumentNullException("scope");VerifyLayouts();this.scope=scope;
        using(var identity=WindowsIdentity.GetCurrent())if(!identity.IsSystem)throw new InvalidOperationException("Protected worker identity required");
        self=Process.GetCurrentProcess();
        try{
            broker=Process.GetProcessById(scope.BrokerPid);
            // Explicitly retain kernel handles for the entire scope lifetime.
            if(self.Handle==IntPtr.Zero||broker.Handle==IntPtr.Zero)throw new InvalidOperationException("Protected process handle unavailable");
            if(self.HasExited||broker.HasExited||self.Id!=scope.WorkerPid||self.StartTime.ToUniversalTime().Ticks!=scope.WorkerStarted||broker.StartTime.ToUniversalTime().Ticks!=scope.BrokerStarted||self.SessionId!=scope.Session||broker.SessionId!=0)throw new InvalidOperationException("Protected worker process scope mismatch");
            StartObserver(scope.Nonce);
        }catch{Dispose();throw;}
    }
    void StartObserver(Guid nonce){
            markerAtom=GlobalAddAtom("Sodashitsu.ProtectedObserver."+nonce.ToString("D"));
            if(markerAtom<0xc000)throw new InvalidOperationException("Protected observer marker unavailable");
            callback=(hook,kind,window,obj,child,thread,time)=>{
                if(kind==0x20)epochs.Changed();
                else if(kind==markerAtom&&window==markerWindow&&thread==(uint)Interlocked.CompareExchange(ref observerId,0,0)){
                    lock(markerGate)if(markerSequence!=0&&obj==markerObject&&child==markerChild)epochs.Marker(markerSequence);
                }
            };
            observer=new Thread(Observe){IsBackground=true};observer.Start();
            if(!ready.Wait(2000)||!live)throw new InvalidOperationException("Protected desktop observer unavailable");
    }
    // Observer-only diagnostic: no token/session/desktop facts, capture or input.
    SodaDesktopProtectedScopeNative(Guid nonce){try{StartObserver(nonce);}catch{Dispose();throw;}}
    public static void VerifyMarkerDelivery(){
        VerifyLayouts();
        using(var observer=new SodaDesktopProtectedScopeNative(Guid.NewGuid())){
            long before,after;
            if(!observer.Checkpoint(out before)||!observer.Checkpoint(out after)||after<before)throw new InvalidOperationException("Private WinEvent marker delivery failed");
            // An unanswered private marker must revoke subsequent checks forever.
            long discarded;
            if(observer.epochs.Checkpoint(id=>{},10,out discarded)||observer.Checkpoint(out discarded))throw new InvalidOperationException("Private marker timeout did not revoke observer");
        }
        Console.WriteLine("protected_private_marker_delivery_passed: own private WinEvents only; no screen capture/input/lock/session or service changes");
    }
    void Observe(){
        IntPtr hook=IntPtr.Zero;GCHandle root=GCHandle.Alloc(callback);
        try{
            Message message;PeekMessage(out message,IntPtr.Zero,0,0,0);Interlocked.Exchange(ref observerId,(int)GetCurrentThreadId());
            markerWindow=CreateWindowEx(0,"STATIC","",0,0,0,0,0,new IntPtr(-3),IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
            if(markerWindow==IntPtr.Zero)throw new InvalidOperationException("Private marker window unavailable");
            hook=SetWinEventHook(0x20,markerAtom,IntPtr.Zero,callback,0,0,0);live=hook!=IntPtr.Zero;ready.Set();
            if(!live)return;
            while(!disposed&&GetMessage(out message,IntPtr.Zero,0,0)>0){TranslateMessage(ref message);DispatchMessage(ref message);}
        }catch{}finally{live=false;if(hook!=IntPtr.Zero)UnhookWinEvent(hook);if(markerWindow!=IntPtr.Zero){DestroyWindow(markerWindow);markerWindow=IntPtr.Zero;}root.Free();epochs.Dispose();if(markerAtom!=0){GlobalDeleteAtom(markerAtom);markerAtom=0;}}
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
        return epochs.Checkpoint(sequence=>{
            // idEventThread is the window's owner thread, not this calling thread.
            // Fresh opaque object/child tokens prevent guessed or stale markers.
            byte[] bytes=new byte[8];using(var random=System.Security.Cryptography.RandomNumberGenerator.Create())random.GetBytes(bytes);
            int obj=BitConverter.ToInt32(bytes,0)&Int32.MaxValue,child=BitConverter.ToInt32(bytes,4)&Int32.MaxValue;
            lock(markerGate){markerSequence=sequence;markerObject=obj;markerChild=child;}
            NotifyWinEvent(markerAtom,markerWindow,obj,child);
        },250,out value);
    }
    public static void SealSnapshot(SodaDesktopProtectedScope.Facts facts,Func<bool> same,Func<int> lockState){
        try{if(same()&&lockState()==facts.LockState&&same())return;}catch{}
        facts.System=false;facts.Desktop=null;
    }
    public void Dispose(){disposed=true;epochs.Dispose();int thread=Interlocked.CompareExchange(ref observerId,0,0);if(thread!=0)PostThreadMessage((uint)thread,0x12,UIntPtr.Zero,IntPtr.Zero);bool ended=observer==null||observer.Join(1000);if(ended){ready.Dispose();if(markerAtom!=0){GlobalDeleteAtom(markerAtom);markerAtom=0;}}if(broker!=null)broker.Dispose();if(self!=null)self.Dispose();}
    public static void VerifyLayouts(){if(IntPtr.Size!=8||Marshal.SizeOf(typeof(Message))!=48||Marshal.SizeOf(typeof(GroupEntry))!=16||Marshal.OffsetOf(typeof(Groups),"First").ToInt32()!=8)throw new InvalidOperationException("Protected scope native ABI");}
}
