using System;using System.Diagnostics;using System.IO;using System.Runtime.InteropServices;using System.Threading;using System.Security.Principal;using System.Web.Script.Serialization;
    public sealed class SodaCableCapture : IDisposable {
        public const int Rate=48000,Channels=2,PcmBytes=3840;
        [StructLayout(LayoutKind.Sequential,Pack=2)]struct Format {public ushort tag,channels;public uint rate,average;public ushort alignment,bits,extra;}
        [DllImport("ole32.dll")]static extern int CoInitializeEx(IntPtr reserved,uint flags);
        [DllImport("ole32.dll")]static extern void CoUninitialize();
        [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Endpoint(IntPtr self,[MarshalAs(UnmanagedType.LPWStr)]string id,out IntPtr device);
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
        public SodaCableCapture(Func<long> clock) {
            if(clock==null||IntPtr.Size!=8)throw new NotSupportedException("Audio runtime");this.clock=clock;
            IntPtr enumerator=IntPtr.Zero,device=IntPtr.Zero;
            try {
                Check(CoInitializeEx(IntPtr.Zero,0));initialized=true;
                Guid clsid=new Guid("bcde0395-e52f-467c-8e3d-c4579291692e"),iid=new Guid("a95664d2-9614-4f35-a746-de8db63617e6");
                Check(CoCreateInstance(ref clsid,IntPtr.Zero,23,ref iid,out enumerator));Check(Method<Endpoint>(enumerator,5)(enumerator,"{0.0.1.00000000}.{79a8896c-862d-49b9-9e0b-6e55897c7c38}",out device));
                iid=new Guid("1cb9ad4c-dbfa-4c32-b178-c2f568a703b2");Check(Method<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out client));
                var format=new Format{tag=1,channels=Channels,rate=Rate,average=Rate*Channels*2,alignment=Channels*2,bits=16};
                Check(Method<Initialize>(client,3)(client,0,0x88000000u,1000000,0,ref format,IntPtr.Zero));
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
    }public static class SodaCableCaptureCheck {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
 [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool WTSQuerySessionInformationW(IntPtr s,uint session,int kind,out IntPtr data,out uint count);
 [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern void WTSFreeMemory(IntPtr data);
 static bool Active(){uint session=WTSGetActiveConsoleSessionId();if(session!=1||Process.GetCurrentProcess().SessionId!=1)return false;IntPtr data;uint count;if(!WTSQuerySessionInformationW(IntPtr.Zero,session,25,out data,out count))return false;try{return count>=20&&Marshal.ReadInt32(data)==1&&Marshal.ReadInt32(data,8)==1&&Marshal.ReadInt32(data,12)==0&&Marshal.ReadInt32(data,16)==1;}finally{WTSFreeMemory(data);}}
 static double Magnitude(byte[] pcm,out double rms){double x=0,y=0,sum=0;int samples=pcm.Length/4;for(int i=0;i<samples;i++){double value=BitConverter.ToInt16(pcm,i*4);sum+=value*value;double angle=2*Math.PI*997*i/48000;x+=value*Math.Cos(angle);y+=value*Math.Sin(angle);}rms=Math.Sqrt(sum/samples);return Math.Sqrt(x*x+y*y)*2/samples;}
 public static void VerifyGenerated(){byte[] data=new byte[3840];try{double rms;if(Magnitude(data,out rms)!=0||rms!=0)throw new Exception("Silence detector failed");foreach(int frequency in new[]{997,2000}){for(int i=0;i<960;i++){short sample=(short)Math.Round(Math.Sin(2*Math.PI*frequency*i/48000)*8000);var bytes=BitConverter.GetBytes(sample);Buffer.BlockCopy(bytes,0,data,i*4,2);Buffer.BlockCopy(bytes,0,data,i*4+2,2);}double score=Magnitude(data,out rms);if(frequency==997&&score<7000||frequency==2000&&score>800)throw new Exception("Tone detector failed");}}finally{Array.Clear(data,0,data.Length);}}
 public static int Main(){var outcome=new System.Collections.Generic.Dictionary<string,object>();byte[] pcm=new byte[SodaCableCapture.PcmBytes];try{
  VerifyGenerated();using(var identity=WindowsIdentity.GetCurrent())if(identity.User.Value!="S-1-5-21-2255109513-3773794534-3440117263-1001"||identity.IsSystem||Environment.MachineName!="OSK2-024680-2"||!Active())throw new InvalidOperationException("Active owner required");
  var clock=Stopwatch.StartNew();int chunks=0,tones=0,baselineChunks=0;double baselinePeak=0,peak=0,peakTone=0;
  using(var capture=new SodaCableCapture(()=>clock.ElapsedTicks*1000000/Stopwatch.Frequency)){
   clock.Restart();File.WriteAllText(Path.Combine(Root,"ready"),"ready");
   while(clock.ElapsedMilliseconds<20000&&!File.Exists(Path.Combine(Root,"stop"))){if(!Active())throw new InvalidOperationException("Desktop changed");long timestamp;if(!capture.Read(pcm,out timestamp)){Thread.Sleep(5);continue;}double rms;double mag=Magnitude(pcm,out rms);Array.Clear(pcm,0,pcm.Length);chunks++;peak=Math.Max(peak,rms);peakTone=Math.Max(peakTone,mag);if(clock.ElapsedMilliseconds<2000){baselineChunks++;baselinePeak=Math.Max(baselinePeak,mag);}else if(mag>800&&mag>rms*.8)tones++;}
  }
  bool detected=baselineChunks>=10&&baselinePeak<100&&tones>=10;outcome["ok"]=detected;outcome["virtualCaptureOnly"]=true;outcome["physicalMicrophoneUsed"]=false;outcome["frequencyHz"]=997;outcome["chunks"]=chunks;outcome["baselineChunks"]=baselineChunks;outcome["baselinePeakTone"]=Math.Round(baselinePeak);outcome["toneChunks"]=tones;outcome["peakRms"]=Math.Round(peak);outcome["peakToneMagnitude"]=Math.Round(peakTone);outcome["rawAudioStored"]=false;
 }catch(Exception e){outcome["ok"]=false;outcome["errorKind"]=e.GetBaseException().GetType().Name;}
 finally{Array.Clear(pcm,0,pcm.Length);File.WriteAllText(Path.Combine(Root,"result.json"),Json.Serialize(outcome));}return outcome.ContainsKey("ok")&&(bool)outcome["ok"]?0:1;}
}
