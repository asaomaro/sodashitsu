// Optional normal-desktop WASAPI loopback. PCM has its own authenticated local
// pipe: it never shares the video stdout or input-ACK stderr streams.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

public sealed class SodaDesktopAudio : IDisposable {
    public const int Rate=48000,Channels=2,Samples=960,PcmBytes=3840;
    public interface ISource : IDisposable { bool Read(byte[] pcm,out long timestamp); }
    public static readonly byte[] Hello={83,68,65,80,1,2,16,0,128,187,0,0,192,3,0,0};
    readonly Thread thread;
    readonly string name;
    readonly int clientPid;
    readonly Func<bool> allowed;
    readonly Func<ISource> factory;
    volatile bool stopping,active;
    NamedPipeServerStream pipe;
    int frames;
    public bool Active {get{return active;}}
    public int Frames {get{return Thread.VolatileRead(ref frames);}}
    public SodaDesktopAudio(string name,int clientPid,Func<bool> allowed,Func<long> clock)
        :this(name,clientPid,allowed,delegate{return new Wasapi(clock);}){}
    // Injectable generated PCM source is used by the native checks, with the
    // same pipe authentication/start/stop path and no audio-device activation.
    public SodaDesktopAudio(string name,int clientPid,Func<bool> allowed,Func<ISource> factory) {
        Guid parsed;
        if(name==null||!name.StartsWith("SodaDesktopAudio-",StringComparison.Ordinal)||name.Length!=49||!Guid.TryParseExact(name.Substring(17),"N",out parsed))throw new ArgumentException("Audio pipe name");
        if(clientPid<=0||allowed==null||factory==null)throw new ArgumentException("Audio owner");
        this.name=name;this.clientPid=clientPid;this.allowed=allowed;this.factory=factory;
        thread=new Thread(Run);thread.IsBackground=true;thread.SetApartmentState(ApartmentState.MTA);thread.Start();
    }
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
    public static PipeSecurity OwnerSecurity(){return SodaDesktopPipeSecurity.OwnerSecurity();}
    void Run() {
        NamedPipeServerStream server=null;
        try {
            if(stopping||!allowed())return;
            // Duplex grants read attributes for PID verification; application
            // traffic is one-way PCM only and the server never reads input.
            server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,8192,8192,OwnerSecurity());pipe=server;
            if(stopping||!allowed())return;
            SodaDesktopPipeOperation.Wait(callback=>server.BeginWaitForConnection(callback,null),value=>{server.EndWaitForConnection(value);return 0;},2000,()=>!stopping&&allowed());
            uint pid;if(stopping||!allowed()||!GetNamedPipeClientProcessId(server.SafePipeHandle,out pid)||pid!=(uint)clientPid)return;
            // Do not even enumerate/activate a render endpoint before ownership
            // and the current normal-desktop permission have been checked.
            using(var source=factory()) {
                if(stopping||!allowed())return;Write(server,Hello);active=true;
                var pcm=new byte[PcmBytes];uint seq=0;long previous=-1;
                try {
                    while(!stopping&&allowed()) {
                        long timestamp;
                        if(!source.Read(pcm,out timestamp)){Thread.Sleep(5);continue;}
                        if(timestamp<0||timestamp>9007199254740991L||timestamp<=previous||seq==UInt32.MaxValue)throw new InvalidDataException("Audio frame order");
                        if(stopping||!allowed())break;
                        var bytes=new byte[16+PcmBytes];Buffer.BlockCopy(BitConverter.GetBytes(PcmBytes),0,bytes,0,4);Buffer.BlockCopy(BitConverter.GetBytes(++seq),0,bytes,4,4);Buffer.BlockCopy(BitConverter.GetBytes(timestamp),0,bytes,8,8);Buffer.BlockCopy(pcm,0,bytes,16,PcmBytes);
                        Write(server,bytes);previous=timestamp;Interlocked.Increment(ref frames);Array.Clear(bytes,16,PcmBytes);
                    }
                } finally {Array.Clear(pcm,0,pcm.Length);}
            }
        } catch { /* No device names, paths or audio bytes are logged. */ }
        finally {active=false;pipe=null;if(server!=null)server.Dispose();}
    }
    void Write(NamedPipeServerStream server,byte[] bytes) {
        SodaDesktopPipeOperation.Wait(callback=>server.BeginWrite(bytes,0,bytes.Length,callback,null),value=>{server.EndWrite(value);return 0;},50,()=>!stopping&&allowed(),()=>{if(bytes.Length>16)Array.Clear(bytes,16,bytes.Length-16);});
    }
    public bool Stop(int milliseconds) {
        if(milliseconds<1||milliseconds>1000)throw new ArgumentOutOfRangeException("milliseconds");
        stopping=true;active=false;var stream=pipe;if(stream!=null)try{stream.Dispose();}catch{}
        return Thread.CurrentThread!=thread&&thread.Join(milliseconds);
    }
    public void Dispose(){if(!Stop(1000))throw new System.TimeoutException("Audio worker did not stop");}

    sealed class Wasapi : ISource {
        [StructLayout(LayoutKind.Sequential,Pack=2)]struct Format {public ushort tag,channels;public uint rate,average;public ushort alignment,bits,extra;}
        [DllImport("ole32.dll")]static extern int CoInitializeEx(IntPtr reserved,uint flags);
        [DllImport("ole32.dll")]static extern void CoUninitialize();
        [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Endpoint(IntPtr self,int flow,int role,out IntPtr device);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Activate(IntPtr self,ref Guid iid,uint context,IntPtr parameters,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Initialize(IntPtr self,int mode,uint flags,long duration,long period,ref Format format,IntPtr session);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Service(IntPtr self,ref Guid iid,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Action(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int PacketSize(IntPtr self,out uint frames);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int BufferGet(IntPtr self,out IntPtr bytes,out uint frames,out uint flags,out ulong devicePosition,out ulong qpcPosition);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int BufferRelease(IntPtr self,uint frames);
        static T Method<T>(IntPtr target,int slot)where T:class{return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(target),slot*IntPtr.Size),typeof(T))as T;}
        static void Check(int hr){if(hr<0)Marshal.ThrowExceptionForHR(hr);}
        static void Release(ref IntPtr pointer){if(pointer!=IntPtr.Zero){Marshal.Release(pointer);pointer=IntPtr.Zero;}}
        readonly Func<long> clock;
        IntPtr client,capture;
        bool initialized,started,disposed;
        readonly byte[] raw=new byte[48000*4],partial=new byte[PcmBytes];
        int rawLength,rawOffset,partialLength;
        long rawTimestamp,partialTimestamp,lastTimestamp=-1;
        public Wasapi(Func<long> clock) {
            if(clock==null||IntPtr.Size!=8)throw new NotSupportedException("Audio runtime");this.clock=clock;
            IntPtr enumerator=IntPtr.Zero,device=IntPtr.Zero;
            try {
                Check(CoInitializeEx(IntPtr.Zero,0));initialized=true;
                Guid clsid=new Guid("bcde0395-e52f-467c-8e3d-c4579291692e"),iid=new Guid("a95664d2-9614-4f35-a746-de8db63617e6");
                Check(CoCreateInstance(ref clsid,IntPtr.Zero,23,ref iid,out enumerator));Check(Method<Endpoint>(enumerator,4)(enumerator,0,0,out device));
                iid=new Guid("1cb9ad4c-dbfa-4c32-b178-c2f568a703b2");Check(Method<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out client));
                var format=new Format{tag=1,channels=Channels,rate=Rate,average=Rate*Channels*2,alignment=Channels*2,bits=16};
                Check(Method<Initialize>(client,3)(client,0,0x88020000u,1000000,0,ref format,IntPtr.Zero));
                iid=new Guid("c8adbd64-e71e-48a0-a4de-185c395cd317");Check(Method<Service>(client,14)(client,ref iid,out capture));Check(Method<Action>(client,10)(client));started=true;
            } catch {Dispose();throw;}
            finally {Release(ref device);Release(ref enumerator);}
        }
        public bool Read(byte[] pcm,out long timestamp) {
            if(disposed||pcm.Length!=PcmBytes)throw new InvalidOperationException("Audio frame size");timestamp=0;
            while(partialLength<PcmBytes) {
                if(rawOffset>=rawLength) {
                    uint available;Check(Method<PacketSize>(capture,5)(capture,out available));if(available==0)return false;
                    IntPtr data;uint frames,flags;ulong position,qpc;Check(Method<BufferGet>(capture,3)(capture,out data,out frames,out flags,out position,out qpc));
                    try {
                        if(frames==0||frames>48000)throw new InvalidDataException("Audio packet size");
                        if((flags&5)!=0)partialLength=0;
                        rawLength=checked((int)frames*4);rawOffset=0;
                        if((flags&2)!=0)Array.Clear(raw,0,rawLength);else{if(data==IntPtr.Zero)throw new InvalidDataException("Audio packet pointer");Marshal.Copy(data,raw,0,rawLength);}
                        double age=(flags&4)!=0?0:(Stopwatch.GetTimestamp()*1000000.0/Stopwatch.Frequency-(double)qpc/10.0);
                        rawTimestamp=Math.Max(0,clock()-(long)Math.Max(0,Math.Min(age,1000000)));
                    }finally{Check(Method<BufferRelease>(capture,4)(capture,frames));}
                }
                if(partialLength==0)partialTimestamp=rawTimestamp+(long)(rawOffset/4*1000000.0/Rate);
                int count=Math.Min(PcmBytes-partialLength,rawLength-rawOffset);Buffer.BlockCopy(raw,rawOffset,partial,partialLength,count);rawOffset+=count;partialLength+=count;
            }
            Buffer.BlockCopy(partial,0,pcm,0,PcmBytes);partialLength=0;timestamp=Math.Max(partialTimestamp,lastTimestamp+20000);lastTimestamp=timestamp;return true;
        }
        public void Dispose(){if(disposed)return;disposed=true;try{if(started)Method<Action>(client,11)(client);}finally{Release(ref capture);Release(ref client);Array.Clear(raw,0,raw.Length);Array.Clear(partial,0,partial.Length);if(initialized)CoUninitialize();}}
    }
}
