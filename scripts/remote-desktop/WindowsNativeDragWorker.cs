// Fixed one-operation STA worker. Browser authentication/gesture tickets are checked by
// the parent loopback gateway; this process accepts only its inherited private stdin.
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Sodashitsu.NativeDrag
{
    internal interface IDragBackend
    {
        void Initialize();bool Allowed();bool LeftHeld();int Drop(NativeDragDataObject data,DragLease lease,Action finalAdmission,out uint effect);void Pump();void Finish();
    }
    [ComVisible(true),Guid("00000121-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDragDropSource
    {
        [PreserveSig]int QueryContinueDrag([MarshalAs(UnmanagedType.Bool)]bool escape,uint keys);
        [PreserveSig]int GiveFeedback(uint effect);
    }
    [ComVisible(true),ClassInterface(ClassInterfaceType.None)]
    public sealed class DragDropSource:IDragDropSource
    {
        private readonly DragLease lease;
        internal DragDropSource(DragLease lease){this.lease=lease;}
        public int QueryContinueDrag(bool escape,uint keys)
        {
            try{lease.Validate();if(escape)return 0x40101;return (keys&1)==0?0x40100:0;}
            catch{return 0x40101;}
        }
        public int GiveFeedback(uint effect){return 0x40102;}
    }
    internal sealed class DragOutcome
    {
        internal readonly int Result;internal readonly uint Effect;
        internal DragOutcome(int result,uint effect){Result=result;Effect=effect;}
    }
    internal static class NativeDragAdmission
    {
        internal static DragOutcome Invoke(Func<bool> allowed,Func<bool> held,Action finalAdmission,Func<DragOutcome> native)
        {
            if(!allowed()||!held())return new DragOutcome(0x40101,0);
            finalAdmission();return native();
        }
    }
    internal sealed class NativeDragBackend:IDragBackend
    {
        [DllImport("ole32.dll")]private static extern int OleInitialize(IntPtr reserved);
        [DllImport("ole32.dll")]private static extern void OleUninitialize();
        [DllImport("ole32.dll")]private static extern int DoDragDrop([MarshalAs(UnmanagedType.Interface)]IDataObject data,[MarshalAs(UnmanagedType.Interface)]IDragDropSource source,uint allowed,out uint effects);
        [DllImport("user32.dll")]private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll",SetLastError=true)]private static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
        [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]private static extern bool GetUserObjectInformation(IntPtr desktop,int index,StringBuilder name,uint size,out uint needed);
        [DllImport("user32.dll")]private static extern bool CloseDesktop(IntPtr desktop);
        [DllImport("user32.dll")]private static extern IntPtr GetThreadDesktop(uint thread);
        [DllImport("kernel32.dll")]private static extern uint GetCurrentThreadId();
        [DllImport("kernel32.dll")]private static extern uint WTSGetActiveConsoleSessionId();
        private static bool Default(IntPtr desktop){uint needed;StringBuilder name=new StringBuilder(256);return desktop!=IntPtr.Zero&&GetUserObjectInformation(desktop,2,name,512,out needed)&&name.ToString()=="Default";}
        public bool Allowed()
        {
            using(WindowsIdentity identity=WindowsIdentity.GetCurrent())
            using(Process current=Process.GetCurrentProcess())
            {
                if(identity.IsSystem||identity.User==null||new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator)||(uint)current.SessionId!=WTSGetActiveConsoleSessionId()||!Default(GetThreadDesktop(GetCurrentThreadId())))return false;
                IntPtr desktop=OpenInputDesktop(0,false,1);try{return Default(desktop);}finally{if(desktop!=IntPtr.Zero)CloseDesktop(desktop);}
            }
        }
        public void Initialize(){if(Thread.CurrentThread.GetApartmentState()!=ApartmentState.STA||!Allowed()||OleInitialize(IntPtr.Zero)<0)throw new InvalidOperationException("Normal interactive STA worker required");}
        public bool LeftHeld(){return (GetAsyncKeyState(1)&0x8000)!=0;}
        public int Drop(NativeDragDataObject data,DragLease lease,Action finalAdmission,out uint effect)
        {
            DragOutcome result=NativeDragAdmission.Invoke(Allowed,LeftHeld,finalAdmission,delegate{uint nativeEffect;int code=DoDragDrop(data,new DragDropSource(lease),1,out nativeEffect);return new DragOutcome(code,nativeEffect);});effect=result.Effect;return result.Result;
        }
        public void Pump(){System.Windows.Forms.Application.DoEvents();Thread.Sleep(10);}
        public void Finish(){OleUninitialize();}
    }
    internal static class NativeDragWorker
    {
        private sealed class State
        {
            internal int Abort,Done,Phase;internal long Begin,LastBeat;internal DragDataPump Pump;internal DragLease Lease;internal NativeDragDataObject Data;
        }
        private static void Signal(ManualResetEvent value) { try { value.Set(); } catch(ObjectDisposedException) { } }
        private static void FinalAdmission(State state,Stopwatch clock)
        {
            if(Volatile.Read(ref state.Abort)!=0||clock.ElapsedMilliseconds-Interlocked.Read(ref state.Begin)>=750)throw new IOException("Native final gesture admission expired");
        }
        private static void Admit(State state,Stopwatch clock,IDragBackend backend)
        {
            if(Volatile.Read(ref state.Abort)!=0)throw new IOException("Native gesture cancelled");
            bool allowed=backend.Allowed(),held=backend.LeftHeld();
            if(!allowed||!held||Volatile.Read(ref state.Abort)!=0||clock.ElapsedMilliseconds-Interlocked.Read(ref state.Begin)>=750)throw new IOException("Native gesture expired before OLE admission");
        }
        private static string Nonce(Stream input)
        {
            byte[] value=new byte[65];
            try
            {
                for(int at=0;at<value.Length;at++){int next=input.ReadByte();if(next<0)throw new EndOfStreamException();value[at]=(byte)next;}
                if(value[64]!=10)throw new IOException("Invalid private native header");
                for(int i=0;i<64;i++)if(!((value[i]>=48&&value[i]<=57)||(value[i]>=97&&value[i]<=102)))throw new IOException("Invalid private native nonce");
                return Encoding.ASCII.GetString(value,0,64);
            }
            finally{Array.Clear(value,0,value.Length);}
        }
        internal static int Run(Stream input,TextWriter output,IDragBackend backend,Func<IDisposable> acquire,Action<int> forceExit)
        {
            State state=new State();Stopwatch clock=Stopwatch.StartNew();
            using(ManualResetEvent manifestReady=new ManualResetEvent(false))
            using(ManualResetEvent pumpReady=new ManualResetEvent(false))
            using(BlockingCollection<object> outbound=new BlockingCollection<object>(32))
            {
                // Watchdog never waits for a COM target, ReadByte, WriteLine or a slot wait.
                Thread watchdog=new Thread(delegate()
                {
                    long cancellation=-1;bool startedCleanup=false;
                    while(Volatile.Read(ref state.Done)==0)
                    {
                        long now=clock.ElapsedMilliseconds;int phase=Volatile.Read(ref state.Phase);
                        bool expired=phase==0?now>=6000:phase==1?now-Interlocked.Read(ref state.Begin)>=750:now-Interlocked.Read(ref state.LastBeat)>=5000||now-Interlocked.Read(ref state.Begin)>=900000;
                        if(expired||state.Pump!=null&&!state.Pump.Alive)Interlocked.Exchange(ref state.Abort,1);
                        if(Volatile.Read(ref state.Abort)!=0)
                        {
                            if(cancellation<0)cancellation=now;
                            if(!startedCleanup){startedCleanup=true;ThreadPool.QueueUserWorkItem(delegate{try{if(state.Pump!=null)state.Pump.Dispose();if(state.Lease!=null)state.Lease.Cancel();if(state.Data!=null)state.Data.Dispose();}catch{}});}
                            Signal(manifestReady);Signal(pumpReady);if(now-cancellation>=5000){forceExit(3);return;}
                        }
                        Thread.Sleep(10);
                    }
                }){IsBackground=true,Name="soda-native-drag-deadline"};watchdog.Start();
                bool initialized=false;IDisposable slot=null;Thread reader=null,writer=null;
                try
                {
                    string nonce=Nonce(input);if(!backend.Allowed())throw new IOException("Native desktop not permitted");
                    slot=acquire();backend.Initialize();initialized=true;
                    JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=8};
                    writer=new Thread(delegate()
                    {
                        try{foreach(object value in outbound.GetConsumingEnumerable()){output.WriteLine(json.Serialize(value));output.Flush();}}
                        catch{Interlocked.Exchange(ref state.Abort,1);}
                    }){IsBackground=true,Name="soda-native-drag-output"};writer.Start();
                    Action<object> emit=delegate(object value){if(!outbound.TryAdd(value))throw new IOException("Native output queue limit");};
                    DragPacketReader packets=new DragPacketReader(input,nonce);
                    reader=new Thread(delegate()
                    {
                        try
                        {
                            while(Volatile.Read(ref state.Abort)==0)
                            {
                                DragPacket packet=packets.Read();if(packet==null||packet.Type=="cancel")throw new IOException("Native input ended");
                                if(packet.Type=="begin"){Interlocked.Exchange(ref state.Begin,clock.ElapsedMilliseconds);Volatile.Write(ref state.Phase,1);}
                                else if(packet.Type=="seal")
                                {
                                    Signal(manifestReady);if(!pumpReady.WaitOne(5000)||Volatile.Read(ref state.Abort)!=0)throw new IOException("Native initialization expired");
                                }
                                else if(packet.Type=="beat")
                                {
                                    if(state.Pump==null||state.Lease==null||!state.Pump.Beat(packets.Scope)||!state.Lease.Beat(packets.Scope))throw new IOException("Native heartbeat expired");Interlocked.Exchange(ref state.LastBeat,clock.ElapsedMilliseconds);
                                }
                                else if(packet.Type=="bytes"||packet.Type=="end")
                                {
                                    if(state.Pump==null)throw new IOException("Native source unavailable");state.Pump.Accept(packet);
                                }
                            }
                        }
                        catch{Interlocked.Exchange(ref state.Abort,1);Signal(manifestReady);Signal(pumpReady);}
                    }){IsBackground=true,Name="soda-native-drag-input"};reader.Start();
                    emit(new{type="ready",nonce});manifestReady.WaitOne();
                    if(Volatile.Read(ref state.Abort)!=0||clock.ElapsedMilliseconds-Interlocked.Read(ref state.Begin)>=750||!backend.Allowed()||!backend.LeftHeld())throw new IOException("Native gesture expired");
                    state.Pump=new DragDataPump(packets.Scope,packets.Manifest,delegate{return clock.ElapsedMilliseconds;},delegate(DragReadNeed need){emit(new{type="need",nonce,request=need.Request,index=need.Index,offset=need.Offset,length=need.Length});});
                    state.Lease=new DragLease(packets.Scope,packets.Manifest,state.Pump.Fetch,delegate{return Volatile.Read(ref state.Abort)==0&&state.Pump.Alive&&backend.Allowed();},delegate{return clock.ElapsedMilliseconds;});
                    state.Data=new NativeDragDataObject(state.Lease);Admit(state,clock,backend);Interlocked.Exchange(ref state.LastBeat,clock.ElapsedMilliseconds);Volatile.Write(ref state.Phase,2);Signal(pumpReady);
                    Admit(state,clock,backend);uint effect;int result=backend.Drop(state.Data,state.Lease,delegate{FinalAdmission(state,clock);},out effect);state.Data.DropReturned(result,effect);
                    while(!state.Data.ExtractionTerminal&&Volatile.Read(ref state.Abort)==0)backend.Pump();
                    if(Volatile.Read(ref state.Abort)!=0||!state.Data.CopyCompleted||(result!=0&&result!=0x40100)||effect!=1)throw new IOException("Native copy cancelled");
                    state.Data.Dispose();state.Pump.Dispose();
                    if(!state.Lease.WaitIdle(5000)||!state.Pump.WaitIdle(5000))throw new IOException("Native data did not drain");
                    emit(new{type="finished",nonce,copy=true});outbound.CompleteAdding();
                    if(!writer.Join(5000))throw new IOException("Native output did not drain");return 0;
                }
                catch{Interlocked.Exchange(ref state.Abort,1);return 3;}
                finally
                {
                    // A stuck cleanup still has the independent watchdog. Do not disable it early.
                    Interlocked.Exchange(ref state.Abort,1);
                    if(state.Data!=null)state.Data.Dispose();if(state.Lease!=null)state.Lease.Cancel();if(state.Pump!=null)state.Pump.Dispose();
                    if(initialized)backend.Finish();if(slot!=null)slot.Dispose();
                    Volatile.Write(ref state.Done,1);
                }
            }
        }
        [STAThread] internal static int Main(string[] args)
        {
            if(args.Length!=0)return 3;
            return Run(Console.OpenStandardInput(),Console.Out,new NativeDragBackend(),NativeDragSlot.Acquire,Environment.Exit);
        }
    }
}
