using System;using System.Diagnostics;using System.IO;using System.Runtime.InteropServices;using System.Threading;using System.Security.Principal;using System.Web.Script.Serialization;
    public sealed class SodaCableRender : IDisposable {
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
        IntPtr client,render;uint capacity;bool initialized,started,disposed;
        public SodaCableRender(string endpoint) {
            if(String.IsNullOrWhiteSpace(endpoint)||endpoint.Length>512||endpoint.IndexOf('\0')>=0||IntPtr.Size!=8)throw new ArgumentException("Explicit virtual endpoint required");
            IntPtr enumerator=IntPtr.Zero,device=IntPtr.Zero;
            try {
                Check(CoInitializeEx(IntPtr.Zero,0));initialized=true;Guid clsid=new Guid("bcde0395-e52f-467c-8e3d-c4579291692e"),iid=new Guid("a95664d2-9614-4f35-a746-de8db63617e6");
                Check(CoCreateInstance(ref clsid,IntPtr.Zero,23,ref iid,out enumerator));Check(Method<Device>(enumerator,5)(enumerator,endpoint,out device));
                iid=new Guid("1cb9ad4c-dbfa-4c32-b178-c2f568a703b2");Check(Method<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out client));
                var format=new Format{tag=1,channels=1,rate=48000,average=96000,alignment=2,bits=16};
                Check(Method<Initialize>(client,3)(client,0,0x88000000u,600000,0,ref format,IntPtr.Zero));Check(Method<Size>(client,4)(client,out capacity));if(capacity<960||capacity>48000)throw new InvalidDataException("Microphone buffer");
                iid=new Guid("f294acfc-3146-4483-a7bf-addca7c260e2");Check(Method<Service>(client,14)(client,ref iid,out render));Check(Method<Action>(client,10)(client));started=true;
            } catch{Dispose();throw;}finally{Release(ref device);Release(ref enumerator);}
        }
        public bool Write(byte[] pcm,Func<bool> allowed) {
            if(disposed||pcm.Length!=1920)throw new InvalidOperationException();var clock=Stopwatch.StartNew();uint padding;
            while(true){if(!allowed())return false;Check(Method<Size>(client,6)(client,out padding));if(padding>capacity)throw new InvalidDataException();if(padding<=960&&capacity-padding>=960)break;if(clock.ElapsedMilliseconds>=60)throw new System.TimeoutException("Microphone render stalled");Thread.Sleep(2);}
            if(!allowed())return false;IntPtr buffer;Check(Method<Get>(render,3)(render,960,out buffer));
            bool copied=false;try{if(allowed()){Marshal.Copy(pcm,0,buffer,pcm.Length);copied=true;}}finally{Check(Method<ReleaseBuffer>(render,4)(render,960,copied?0u:2u));}
            return copied;
        }
        public void Dispose(){if(disposed)return;disposed=true;try{if(started)Method<Action>(client,11)(client);}finally{Release(ref render);Release(ref client);if(initialized)CoUninitialize();}}
    }public static class SodaCableRenderCheck { [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
 [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool WTSQuerySessionInformationW(IntPtr s,uint session,int kind,out IntPtr data,out uint count);
 [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern void WTSFreeMemory(IntPtr data);
 static bool Active(){uint session=WTSGetActiveConsoleSessionId();if(session!=1||Process.GetCurrentProcess().SessionId!=1)return false;IntPtr data;uint count;if(!WTSQuerySessionInformationW(IntPtr.Zero,session,25,out data,out count))return false;try{return count>=20&&Marshal.ReadInt32(data)==1&&Marshal.ReadInt32(data,8)==1&&Marshal.ReadInt32(data,12)==0&&Marshal.ReadInt32(data,16)==1;}finally{WTSFreeMemory(data);}}
 public static int Main(){var result=new System.Collections.Generic.Dictionary<string,object>();byte[] pcm=new byte[1920];try{using(var id=WindowsIdentity.GetCurrent())if(id.IsSystem||id.User.Value!="S-1-5-21-2255109513-3773794534-3440117263-1001"||!Active()||Environment.MachineName!="OSK2-024680-2")throw new InvalidOperationException("Owner differs");var clock=Stopwatch.StartNew();int count=0;using(var sink=new SodaCableRender("{0.0.0.00000000}.{ded45c33-6f1c-4ab3-ba1e-312a650683e4}")){clock.Restart();for(int seq=0;seq<300&&clock.ElapsedMilliseconds<10000;seq++){for(int i=0;i<960;i++){short sample=(short)Math.Round(Math.Sin(2*Math.PI*997*(seq*960+i)/48000)*8000);var bytes=BitConverter.GetBytes(sample);pcm[i*2]=bytes[0];pcm[i*2+1]=bytes[1];}if(!sink.Write(pcm,()=>clock.ElapsedMilliseconds<10000&&Active()))throw new InvalidOperationException("Render interrupted");Array.Clear(pcm,0,pcm.Length);count++;long wait=(seq+1)*20-clock.ElapsedMilliseconds;if(wait>0)Thread.Sleep((int)wait);}}result["ok"]=count==300;result["frames"]=count;result["elapsedMs"]=clock.ElapsedMilliseconds;result["generatedOnly"]=true;}catch(Exception e){result["ok"]=false;result["errorKind"]=e.GetType().Name;result["hresult"]=e.HResult;result["renderStalled"]=e is TimeoutException;}finally{Array.Clear(pcm,0,pcm.Length);File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"result.json"),new JavaScriptSerializer().Serialize(result));}return (bool)result["ok"]?0:1;}}