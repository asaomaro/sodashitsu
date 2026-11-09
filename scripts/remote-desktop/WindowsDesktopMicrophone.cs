// PCM is received only on an owner/PID authenticated private pipe. Its render
// endpoint is selected locally (a virtual cable); never use a default speaker.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using Microsoft.Win32.SafeHandles;
public sealed class SodaDesktopMicrophone : IDisposable {
    public interface ISink : IDisposable { void Write(byte[] pcm,Func<bool> allowed); }
    public static readonly byte[] Hello={83,68,77,73,1,1,16,0,128,187,0,0,192,3,0,0};
    // A packet is always 960 mono samples. Add only bounded silence when the
    // observed queue is empty, without extending the existing 40ms maximum.
    internal static uint RenderFrameCount(uint padding,uint capacity) {
        if(capacity<960||capacity>48000||padding>capacity||padding>960||capacity-padding<960)throw new InvalidDataException("Microphone render plan");
        return 960u+(padding==0?Math.Min(960u,capacity-960u):0u);
    }
    internal static int StageRender(byte[] pcm,byte[] scratch,uint frames) {
        if(scratch==null||scratch.Length!=3840)throw new InvalidDataException("Microphone scratch");
        Array.Clear(scratch,0,scratch.Length);
        if(pcm==null||pcm.Length!=1920||frames<960||frames>1920)throw new InvalidDataException("Microphone render data");
        Buffer.BlockCopy(pcm,0,scratch,checked((int)(frames-960)*2),pcm.Length);return checked((int)frames*2);
    }
    internal sealed class Statistics {
        internal bool capacityKnown,saturated;internal uint capacity;
        internal int packetReadCount,entryExpiredCount,writeAttempts,pcmCommitCount,paddingZeroCount,prefixFrames,writeExpiryRejectedCount,silentReleaseCount;internal double maxWriteMs,maxReadInterarrivalMs;double previousRead=-1;
        internal void Add(ref int value,int amount){if(amount<0||value>Int32.MaxValue-amount){value=Int32.MaxValue;saturated=true;}else value+=amount;}
        internal void Packet(double wall){if(previousRead>=0){double gap=wall-previousRead;if(Double.IsNaN(gap)||Double.IsInfinity(gap)||gap<0||gap>100000)saturated=true;else maxReadInterarrivalMs=Math.Max(maxReadInterarrivalMs,gap);}previousRead=wall;Add(ref packetReadCount,1);}
        internal void WriteTime(double value){if(Double.IsNaN(value)||Double.IsInfinity(value)||value<0||value>100000){saturated=true;return;}maxWriteMs=Math.Max(maxWriteMs,value);}
        internal object Snapshot(){return new{version=1,capacityKnown,capacityFrames=capacityKnown?(uint?)capacity:null,packetReadCount,entryExpiredCount,writeAttempts,pcmCommitCount,paddingZeroCount,prefixFrames,writeExpiryRejectedCount,silentReleaseCount,maxWriteMs=writeAttempts>0?(double?)maxWriteMs:null,maxReadInterarrivalMs=packetReadCount>=2?(double?)maxReadInterarrivalMs:null,saturated};}
    }
    Statistics statistics=new Statistics();
    // Final metadata only. Dispose/join and the owner must establish retirement first.
    public object ReadDiagnostics(){return stopping&&!thread.IsAlive?statistics.Snapshot():null;}
    readonly string name;readonly int clientPid;readonly Func<bool> allowed;readonly Func<ISink> factory;readonly Thread thread;readonly Func<int,bool> peerGuard;
    volatile bool stopping;NamedPipeServerStream pipe;
    public SodaDesktopMicrophone(string name,int clientPid,Func<bool> allowed,string endpoint)
        :this(name,clientPid,allowed,delegate{return new Wasapi(endpoint);}){}
    public SodaDesktopMicrophone(string name,int clientPid,Func<bool> allowed,string endpoint,Func<int,bool> peerGuard)
        :this(name,clientPid,allowed,delegate{return new Wasapi(endpoint);},peerGuard){}
    public SodaDesktopMicrophone(string name,int clientPid,Func<bool> allowed,Func<ISink> factory):this(name,clientPid,allowed,factory,null){}
    public SodaDesktopMicrophone(string name,int clientPid,Func<bool> allowed,Func<ISink> factory,Func<int,bool> peerGuard) {
        Guid guid;if(name==null||!name.StartsWith("SodaDesktopMicrophone-",StringComparison.Ordinal)||name.Length!="SodaDesktopMicrophone-".Length+32||!Guid.TryParseExact(name.Substring("SodaDesktopMicrophone-".Length),"N",out guid)||clientPid<=0||allowed==null||factory==null)throw new ArgumentException("Microphone owner");
        this.name=name;this.clientPid=clientPid;this.allowed=allowed;this.factory=factory;this.peerGuard=peerGuard;
        thread=new Thread(Run);thread.IsBackground=true;thread.SetApartmentState(ApartmentState.MTA);thread.Start();
    }
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
    bool Alive(){return !stopping&&allowed();}
    // The kernel object survives a Node worker/module replacement. Local is scoped
    // to this Windows session; SID isolates users. All endpoints share one owner.
    static bool TakeEndpointLease(out Mutex lease) {
        using(var identity=WindowsIdentity.GetCurrent()) {
            if(identity.User==null)throw new InvalidOperationException("Microphone user required");
            lease=new Mutex(false,@"Local\SodashitsuMicrophone-"+identity.User.Value);
        }
        try{return lease.WaitOne(0);}
        catch(AbandonedMutexException){
            // Abandonment alone is not a device-retirement receipt. Reject this start.
            lease.ReleaseMutex();return false;
        }
    }
    static void StopUnretiredOwner() {
        // Never let this thread leave an uncertain sink behind in a live process.
        // Kill only the dedicated helper/actor which owns the audio device.
        try{using(var self=Process.GetCurrentProcess())self.Kill();}catch{}
        while(true)Thread.Sleep(1000);
    }
    void Run() {
        Mutex endpointLease=null;bool endpointOwned=false;NamedPipeServerStream server=null;byte[] packet=new byte[1932],pcm=new byte[1920];
        try {
            if(!Alive())return;
            server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,SodaDesktopPipeSecurity.OwnerSecurity());pipe=server;
            Complete(callback=>server.BeginWaitForConnection(callback,null),2000,value=>{server.EndWaitForConnection(value);return 0;});
            uint pid;if(!Alive()||!GetNamedPipeClientProcessId(server.SafePipeHandle,out pid)||pid!=(uint)clientPid||peerGuard!=null&&!peerGuard((int)pid)||!Alive())return;
            // Enumerate/activate no endpoint before the private pipe is authenticated.
            endpointOwned=TakeEndpointLease(out endpointLease);if(!endpointOwned||!Alive())return;
            var sink=factory();var native=sink as Wasapi;if(native!=null)statistics=native.statistics;
            try {
                if(!Alive())return;
                Complete(callback=>server.BeginWrite(Hello,0,Hello.Length,callback,null),100,value=>{server.EndWrite(value);return 0;});
                uint previous=0;var readClock=Stopwatch.StartNew();
                while(Alive()) {
                    int offset=0;var clock=Stopwatch.StartNew();
                    while(offset<packet.Length) {
                        int count=Complete(callback=>server.BeginRead(packet,offset,packet.Length-offset,callback,null),Math.Max(1,2000-(int)clock.ElapsedMilliseconds),value=>server.EndRead(value),packet);if(count<=0)throw new EndOfStreamException();offset+=count;
                    }
                    statistics.Packet(readClock.Elapsed.TotalMilliseconds);
                    uint seq=BitConverter.ToUInt32(packet,0);double expiry=BitConverter.ToDouble(packet,4),now=(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
                    if(seq<=previous||Double.IsNaN(expiry)||Double.IsInfinity(expiry)||expiry>now+150)throw new InvalidDataException("Microphone frame order");previous=seq;
                    if(!Alive())return;
                    if(expiry>=now){Buffer.BlockCopy(packet,12,pcm,0,pcm.Length);sink.Write(pcm,()=>{if(!Alive())return false;bool fresh=expiry>=(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;if(!fresh)statistics.Add(ref statistics.writeExpiryRejectedCount,1);return fresh;});}else statistics.Add(ref statistics.entryExpiredCount,1);Array.Clear(pcm,0,pcm.Length);Array.Clear(packet,0,packet.Length);
                }
            } finally {
                try{if(sink!=null)sink.Dispose();}
                catch{Array.Clear(packet,0,packet.Length);Array.Clear(pcm,0,pcm.Length);StopUnretiredOwner();}
            }
        } catch { /* No endpoint IDs or audio contents in logs. */ }
        finally {stopping=true;Array.Clear(packet,0,packet.Length);Array.Clear(pcm,0,pcm.Length);pipe=null;try{if(server!=null)server.Dispose();}finally{try{if(endpointOwned)endpointLease.ReleaseMutex();}finally{if(endpointLease!=null)endpointLease.Dispose();}}}
    }
    T Complete<T>(Func<AsyncCallback,IAsyncResult> begin,int timeout,Func<IAsyncResult,T> finish,byte[] clearWhenRetired=null) {
        return SodaDesktopPipeOperation.Wait(begin,finish,timeout,Alive,()=>{if(stopping&&clearWhenRetired!=null)Array.Clear(clearWhenRetired,0,clearWhenRetired.Length);});
    }
    public void Dispose(){stopping=true;var stream=pipe;if(stream!=null)try{stream.Dispose();}catch{}if(Thread.CurrentThread!=thread&&!thread.Join(1000))throw new System.TimeoutException("Microphone worker stop");}
    sealed class Wasapi : ISink {
        [StructLayout(LayoutKind.Sequential,Pack=2)]struct Format{public ushort tag,channels;public uint rate,average;public ushort alignment,bits,extra;}
        [DllImport("ole32.dll")]static extern int CoInitializeEx(IntPtr reserved,uint flags);
        [DllImport("ole32.dll")]static extern void CoUninitialize();
        [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Device(IntPtr self,[MarshalAs(UnmanagedType.LPWStr)]string id,out IntPtr device);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Activate(IntPtr self,ref Guid iid,uint context,IntPtr parameters,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Initialize(IntPtr self,int mode,uint flags,long duration,long period,ref Format format,IntPtr session);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Service(IntPtr self,ref Guid iid,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Action(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Size(IntPtr self,out uint frames);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Get(IntPtr self,uint frames,out IntPtr bytes);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int ReleaseBuffer(IntPtr self,uint frames,uint flags);
        static T Method<T>(IntPtr target,int slot)where T:class{return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(target),slot*IntPtr.Size),typeof(T))as T;}
        static void Check(int hr){if(hr<0)Marshal.ThrowExceptionForHR(hr);}
        static void Release(ref IntPtr value){if(value!=IntPtr.Zero){Marshal.Release(value);value=IntPtr.Zero;}}
        internal readonly Statistics statistics=new Statistics();
        IntPtr client,render;uint capacity;bool initialized,started,disposed;readonly byte[] scratch=new byte[3840];
        public Wasapi(string endpoint) {
            if(String.IsNullOrWhiteSpace(endpoint)||endpoint.Length>512||endpoint.IndexOf('\0')>=0||IntPtr.Size!=8)throw new ArgumentException("Explicit virtual endpoint required");
            IntPtr enumerator=IntPtr.Zero,device=IntPtr.Zero;
            try {
                Check(CoInitializeEx(IntPtr.Zero,0));initialized=true;Guid clsid=new Guid("bcde0395-e52f-467c-8e3d-c4579291692e"),iid=new Guid("a95664d2-9614-4f35-a746-de8db63617e6");
                Check(CoCreateInstance(ref clsid,IntPtr.Zero,23,ref iid,out enumerator));Check(Method<Device>(enumerator,5)(enumerator,endpoint,out device));
                iid=new Guid("1cb9ad4c-dbfa-4c32-b178-c2f568a703b2");Check(Method<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out client));
                var format=new Format{tag=1,channels=1,rate=48000,average=96000,alignment=2,bits=16};
                Check(Method<Initialize>(client,3)(client,0,0x88000000u,600000,0,ref format,IntPtr.Zero));Check(Method<Size>(client,4)(client,out capacity));if(capacity<960||capacity>48000)throw new InvalidDataException("Microphone buffer");statistics.capacity=capacity;statistics.capacityKnown=true;
                iid=new Guid("f294acfc-3146-4483-a7bf-addca7c260e2");Check(Method<Service>(client,14)(client,ref iid,out render));Check(Method<Action>(client,10)(client));started=true;
            } catch{try{Dispose();}catch{StopUnretiredOwner();}throw;}finally{Release(ref device);Release(ref enumerator);}
        }
        public void Write(byte[] pcm,Func<bool> allowed) {
            if(disposed||pcm.Length!=1920)throw new InvalidOperationException();var clock=Stopwatch.StartNew();uint padding;statistics.Add(ref statistics.writeAttempts,1);try{
            while(true){if(!allowed())return;Check(Method<Size>(client,6)(client,out padding));if(padding>capacity)throw new InvalidDataException();if(padding<=960&&capacity-padding>=960)break;if(clock.ElapsedMilliseconds>=60)throw new System.TimeoutException("Microphone render stalled");Thread.Sleep(2);}
            if(padding==0)statistics.Add(ref statistics.paddingZeroCount,1);uint frames=RenderFrameCount(padding,capacity);
            if(!allowed())return;IntPtr buffer;Check(Method<Get>(render,3)(render,frames,out buffer));
            bool copied=false;try{if(allowed()){int length=StageRender(pcm,scratch,frames);Marshal.Copy(scratch,0,buffer,length);copied=true;}}finally{Array.Clear(scratch,0,scratch.Length);Check(Method<ReleaseBuffer>(render,4)(render,frames,copied?0u:2u));if(copied){statistics.Add(ref statistics.pcmCommitCount,1);statistics.Add(ref statistics.prefixFrames,checked((int)(frames-960)));}else statistics.Add(ref statistics.silentReleaseCount,1);}
            }finally{statistics.WriteTime(clock.Elapsed.TotalMilliseconds);}
        }
        public void Dispose(){if(disposed)return;disposed=true;try{if(started)Method<Action>(client,11)(client);}finally{Array.Clear(scratch,0,scratch.Length);Release(ref render);Release(ref client);if(initialized)CoUninitialize();}}
    }
}
