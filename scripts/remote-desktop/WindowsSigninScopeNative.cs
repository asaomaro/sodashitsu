// Runtime only. Automated validation compiles this without constructing it.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public sealed class SodaDesktopSigninScopeNative:IDisposable {
    readonly int session;readonly Guid nonce;readonly bool registerWts;readonly Process self,broker;
    readonly SodaDesktopSigninCandidateNative candidate=new SodaDesktopSigninCandidateNative();
    readonly SodaDesktopProtectedEpoch epoch=new SodaDesktopProtectedEpoch();
    readonly ManualResetEvent ready=new ManualResetEvent(false);readonly object markerGate=new object();
    Thread observer;volatile bool live,closed;int observerId,sequence,objectId,childId;ushort atom;IntPtr window;WinEvent callback;
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]delegate void WinEvent(IntPtr hook,uint kind,IntPtr hwnd,int obj,int child,uint thread,uint time);
    [StructLayout(LayoutKind.Sequential)]struct MSG{public IntPtr Window;public uint Kind;public UIntPtr WParam;public IntPtr LParam;public uint Time;public int X,Y;public uint Private;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern ushort GlobalAddAtomW(string name);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern ushort GlobalDeleteAtom(ushort value);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("wtsapi32.dll",SetLastError=true)]static extern bool WTSRegisterSessionNotification(IntPtr hwnd,uint flags);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("wtsapi32.dll")]static extern bool WTSUnRegisterSessionNotification(IntPtr hwnd);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEvent callback,uint process,uint thread,uint flags);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern bool UnhookWinEvent(IntPtr hook);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern void NotifyWinEvent(uint kind,IntPtr hwnd,int obj,int child);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool PeekMessageW(out MSG message,IntPtr window,uint min,uint max,uint remove);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern int GetMessageW(out MSG message,IntPtr window,uint min,uint max);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern bool TranslateMessage(ref MSG message);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern IntPtr DispatchMessageW(ref MSG message);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern bool PostThreadMessageW(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
    sealed class PrivateWindow:NativeWindow,IDisposable {
        readonly Action changed;
        internal PrivateWindow(Action changed){this.changed=changed;CreateHandle(new CreateParams{Caption="",Parent=new IntPtr(-3)});}
        protected override void WndProc(ref Message message){if(message.Msg==0x2b1)changed();base.WndProc(ref message);}
        public void Dispose(){DestroyHandle();}
    }
    static Exception Failure(){return new InvalidOperationException("Signin scope is unavailable");}
    public SodaDesktopSigninScopeNative(string owner,int session,int brokerPid,long brokerStarted,Guid nonce){
        VerifyLayouts();this.session=session;this.nonce=nonce;registerWts=true;
        try{
            if(session<1||nonce==Guid.Empty||!SodaDesktopSigninVault.SystemPrimary()||!candidate.SystemWithTcb)throw Failure();
            self=Process.GetCurrentProcess();broker=Process.GetProcessById(brokerPid);
            string expected=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner),"DesktopSigninWorker.exe");
            if(self.Handle==IntPtr.Zero||broker.Handle==IntPtr.Zero||self.HasExited||broker.HasExited||self.SessionId!=session||broker.SessionId!=0||broker.StartTime.ToUniversalTime().Ticks!=brokerStarted||!String.Equals(self.MainModule.FileName,expected,StringComparison.OrdinalIgnoreCase)||!String.Equals(broker.MainModule.FileName,expected,StringComparison.OrdinalIgnoreCase))throw Failure();
            SodaDesktopSigninCandidate.Candidate facts;if(!SodaDesktopSigninCandidate.Read(candidate,(uint)session,out facts))throw Failure();
            observer=new Thread(Observe){IsBackground=true};observer.Start();if(!ready.WaitOne(2000)||!live||closed)throw Failure();
        }catch{Dispose();throw Failure();}
    }
    // Diagnostic owns only its private window/WinEvents. No session subscription,
    // native candidate read, SYSTEM token query, desktop capture or OS input.
    SodaDesktopSigninScopeNative(Guid nonce){this.nonce=nonce;try{VerifyLayouts();observer=new Thread(Observe){IsBackground=true};observer.Start();if(!ready.WaitOne(2000)||!live)throw Failure();}catch{Dispose();throw;}}
    public static void VerifyPrivateMarker(){
        using(var value=new SodaDesktopSigninScopeNative(Guid.NewGuid())){
            long before,after;if(!value.Checkpoint(out before)||!value.Checkpoint(out after)||before!=0||after!=0)throw Failure();
            long ignored;if(value.epoch.Checkpoint(id=>{},10,out ignored)||value.Checkpoint(out ignored))throw Failure();
        }
        Console.WriteLine("signin_scope_private_marker_delivery_and_terminal_timeout_passed");
    }
    void Observe(){
        IntPtr desktopHook=IntPtr.Zero,markerHook=IntPtr.Zero;bool registered=false;
        try{
            MSG message;PeekMessageW(out message,IntPtr.Zero,0,0,0);Interlocked.Exchange(ref observerId,(int)GetCurrentThreadId());
            atom=GlobalAddAtomW("Sodashitsu.SigninObserver."+nonce.ToString("D"));if(atom<0xc000)throw Failure();
            using(var own=new PrivateWindow(()=>epoch.Changed())){
                window=own.Handle;try{if(registerWts){registered=WTSRegisterSessionNotification(window,1);if(!registered)throw Failure();}
                callback=(hook,kind,hwnd,obj,child,thread,time)=>{
                    if(kind==0x20)epoch.Changed();
                    else if(kind==atom&&hwnd==window&&thread==(uint)Interlocked.CompareExchange(ref observerId,0,0))lock(markerGate){if(sequence!=0&&obj==objectId&&child==childId)epoch.Marker(sequence);}
                };
                if(registerWts)desktopHook=SetWinEventHook(0x20,0x20,IntPtr.Zero,callback,0,0,0);markerHook=SetWinEventHook(atom,atom,IntPtr.Zero,callback,0,0,0);
                live=(!registerWts||desktopHook!=IntPtr.Zero)&&markerHook!=IntPtr.Zero;ready.Set();if(!live)return;
                while(!closed&&GetMessageW(out message,IntPtr.Zero,0,0)>0){TranslateMessage(ref message);DispatchMessageW(ref message);}}
                finally{if(registered){WTSUnRegisterSessionNotification(window);registered=false;}}
            }
        }catch{}finally{
            live=false;epoch.Dispose();if(desktopHook!=IntPtr.Zero)UnhookWinEvent(desktopHook);if(markerHook!=IntPtr.Zero)UnhookWinEvent(markerHook);
            if(registered&&window!=IntPtr.Zero)WTSUnRegisterSessionNotification(window);window=IntPtr.Zero;
            if(atom!=0){GlobalDeleteAtom(atom);atom=0;}ready.Set();
        }
    }
    bool Checkpoint(out long value){return epoch.Checkpoint(id=>{
        byte[] bytes=new byte[8];using(var random=System.Security.Cryptography.RandomNumberGenerator.Create())random.GetBytes(bytes);
        int obj=BitConverter.ToInt32(bytes,0),child=BitConverter.ToInt32(bytes,4);
        lock(markerGate){sequence=id;objectId=obj;childId=child;}NotifyWinEvent(atom,window,obj,child);
    },250,out value);}
    public SodaDesktopSigninScope.Facts Read(){
        var facts=new SodaDesktopSigninScope.Facts{Session=session,Nonce=nonce};
        if(closed||!live)return facts;
        try{
            long before,after;if(!Checkpoint(out before)||before!=0)return facts;
            facts.BrokerPid=broker.Id;facts.BrokerStarted=broker.StartTime.ToUniversalTime().Ticks;facts.WorkerPid=self.Id;facts.WorkerStarted=self.StartTime.ToUniversalTime().Ticks;
            SodaDesktopSigninCandidate.Candidate first,second;
            bool candidateNow=SodaDesktopSigninCandidate.Read(candidate,(uint)session,out first);
            if(!Checkpoint(out after))return facts;
            facts.Epoch=after;facts.Observer=!closed&&live&&before==after&&after==0;
            facts.BrokerAlive=!broker.HasExited;facts.WorkerAlive=!self.HasExited;
            facts.Candidate=candidateNow&&facts.Observer&&SodaDesktopSigninCandidate.Read(candidate,(uint)session,out second)&&broker.SessionId==0&&self.SessionId==session;
            if(!Checkpoint(out after)||after!=before||closed||!live){facts.Observer=false;facts.Candidate=false;}
            return facts;
        }catch{facts.Observer=false;facts.Candidate=false;return facts;}
    }
    public void Dispose(){
        closed=true;epoch.Dispose();int id=Interlocked.CompareExchange(ref observerId,0,0);if(id!=0)PostThreadMessageW((uint)id,0x12,UIntPtr.Zero,IntPtr.Zero);
        bool ended=observer==null||observer.Join(1000);if(ended)ready.Dispose();if(broker!=null)broker.Dispose();if(self!=null)self.Dispose();
    }
    public static void VerifyLayouts(){if(IntPtr.Size!=8||Marshal.SizeOf(typeof(MSG))!=48)throw Failure();}
}
