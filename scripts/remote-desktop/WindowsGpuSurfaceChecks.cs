// Hardware/generated textures only; never queries or captures the input desktop.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
namespace SodaDesktopTests {
 public static class GpuSurfaceChecks {
  const BindingFlags Private=BindingFlags.NonPublic|BindingFlags.Instance;
  [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
  [DllImport("d3d11.dll")]static extern int D3D11CreateDevice(IntPtr adapter,uint driver,IntPtr software,uint flags,IntPtr levels,uint count,uint sdk,out IntPtr device,out uint level,out IntPtr context);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate void Upload(IntPtr self,IntPtr resource,uint subresource,IntPtr box,IntPtr data,uint pitch,uint depth);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate void Topology(IntPtr self,uint value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate void GetTopology(IntPtr self,out uint value);
  [StructLayout(LayoutKind.Sequential)]struct TextureDesc{public uint width,height,mips,array,format,samples,quality,usage,bind,cpu,misc;}
  [StructLayout(LayoutKind.Sequential)]struct Mapped{public IntPtr data;public uint pitch,depth;}
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int CreateTexture(IntPtr self,ref TextureDesc desc,IntPtr initial,out IntPtr texture);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate void Copy(IntPtr self,IntPtr target,IntPtr source);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Map(IntPtr self,IntPtr resource,uint subresource,uint type,uint flags,out Mapped mapped);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate void Unmap(IntPtr self,IntPtr resource,uint subresource);
  static T Method<T>(IntPtr self,int slot)where T:class{return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(self),slot*IntPtr.Size),typeof(T))as T;}
  static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
  static void Set(SodaDesktopDxgi capture,string name,object value){typeof(SodaDesktopDxgi).GetField(name,Private).SetValue(capture,value);}
  static IntPtr Field(SodaDesktopDxgi capture,string name){return (IntPtr)typeof(SodaDesktopDxgi).GetField(name,Private).GetValue(capture);}
  public static void Run(string fixture,int width=640,int height=360,int fps=30) {
   int returned=0;var owned=new SodaDesktopDxgi.GpuFrame(IntPtr.Zero,()=>returned++);owned.BeginEncode();owned.Dispose();Check(returned==0,"Dispose reused a frame still owned by MF");
   bool duplicate=false;try{owned.BeginEncode();}catch(InvalidOperationException){duplicate=true;}Check(duplicate,"MF-owned GPU frame submitted twice");
   var retire=new SodaDesktopH264.RetireFrame(owned);retire.Invoke(IntPtr.Zero);retire.Invoke(IntPtr.Zero);owned.Dispose();Check(returned==1,"MF callback did not return frame exactly once");
   bool rejected=false;try{owned.BeginEncode();}catch(InvalidOperationException){rejected=true;}Check(rejected,"Retired GPU frame submitted twice");
   var retiring=(SodaDesktopDxgi)Activator.CreateInstance(typeof(SodaDesktopDxgi),Private,null,new object[]{2,2},null);bool stopped=false;
   Check(!retiring.TryEnableGpuSurfaces(),"Uninitialized capture enabled GPU input");
   var retireArgs=new object[]{retiring,new Action(()=>{var borrowed=retiring.GpuDevice;stopped=true;})};
   typeof(SodaDesktopHost).GetMethod("RetireCapture",BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,retireArgs);
   Check(stopped&&retireArgs[0]==null,"Capture was disposed before GPU encoder stopped");retiring.Dispose();
   var capture=(SodaDesktopDxgi)Activator.CreateInstance(typeof(SodaDesktopDxgi),Private,null,new object[]{width,height},null);
   try {
    IntPtr device,context;uint level;Marshal.ThrowExceptionForHR(D3D11CreateDevice(IntPtr.Zero,1,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out device,out level,out context));
    Set(capture,"device",device);Set(capture,"context",context);typeof(SodaDesktopDxgi).GetMethod("InitializeResources",Private).Invoke(capture,new object[]{width,height});
    byte[] pixels=new byte[width*height*4];
    for(int y=0;y<height;y++)for(int x=0;x<width;x++) {
     var color=y<height/2?(x<width/2?Color.Red:Color.Lime):(x<width/2?Color.Blue:Color.Yellow);
     if(x>=256&&x<384&&y>=144&&y<216)color=Color.FromArgb(128,128,128);
     int i=(y*width+x)*4;pixels[i]=color.B;pixels[i+1]=color.G;pixels[i+2]=color.R;pixels[i+3]=255;
    }
    var pin=GCHandle.Alloc(pixels,GCHandleType.Pinned);
    try{var upload=(Upload)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(context),48*IntPtr.Size),typeof(Upload));upload(context,Field(capture,"source"),0,IntPtr.Zero,pin.AddrOfPinnedObject(),(uint)(width*4),0);}finally{pin.Free();}
    Check(capture.TryEnableGpuSurfaces(),"GPU NV12 plane targets unavailable");
    var setTopology=(Topology)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(context),24*IntPtr.Size),typeof(Topology));
    var getTopology=(GetTopology)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(context),83*IntPtr.Size),typeof(GetTopology));
    setTopology(context,2);
    var render=typeof(SodaDesktopDxgi).GetMethod("RenderGpuFrame",Private);
    var leases=new List<SodaDesktopDxgi.GpuFrame>();
    try {
     for(int i=0;i<4;i++)leases.Add((SodaDesktopDxgi.GpuFrame)render.Invoke(capture,new object[]{0,0,false}));
     uint saved;getTopology(context,out saved);Check(saved==2,"GPU render changed encoder context state");
     var distinct=new HashSet<IntPtr>();foreach(var lease in leases)Check(distinct.Add(lease.Texture),"In-use GPU texture reused");
     rejected=false;try{render.Invoke(capture,new object[]{0,0,false});}catch(TargetInvocationException e){rejected=e.InnerException is TimeoutException;}Check(rejected,"GPU pool was not bounded to four");
     IntPtr first=leases[0].Texture;leases[0].Dispose();
     using(var again=(SodaDesktopDxgi.GpuFrame)render.Invoke(capture,new object[]{0,0,false}))Check(again.Texture==first,"Retired GPU texture was not reused");
    }finally{foreach(var lease in leases)lease.Dispose();}
    // Test-only readback: compare real NV12 planes, including cursor clipping,
    // against the established packed-NV12 path. Production GPU encode never maps.
    IntPtr staging=IntPtr.Zero;
    try {
     var desc=new TextureDesc{width=(uint)width,height=(uint)height,mips=1,array=1,format=103,samples=1,usage=3,cpu=0x20000};
     Marshal.ThrowExceptionForHR(Method<CreateTexture>(device,5)(device,ref desc,IntPtr.Zero,out staging));
     var actual=new byte[width*height*3/2];var expected=new byte[actual.Length];var packed=typeof(SodaDesktopDxgi).GetMethod("RenderNv12",Private);
     foreach(var cursor in new[]{new[]{0,0,1},new[]{width-2,height-2,1},new[]{-5,-5,1},new[]{10,10,0}}) {
      using(var lease=(SodaDesktopDxgi.GpuFrame)render.Invoke(capture,new object[]{cursor[0],cursor[1],cursor[2]==1})) {
       Method<Copy>(context,47)(context,staging,lease.Texture);Mapped mapped;Marshal.ThrowExceptionForHR(Method<Map>(context,14)(context,staging,0,1,0,out mapped));
       try{Check(mapped.pitch>=(uint)width&&mapped.pitch<256*1024,"Invalid NV12 pitch");for(int y=0;y<height*3/2;y++)Marshal.Copy(IntPtr.Add(mapped.data,checked(y*(int)mapped.pitch)),actual,y*width,width);}finally{Method<Unmap>(context,15)(context,staging,0);}
      }
      packed.Invoke(capture,new object[]{expected,cursor[0],cursor[1],cursor[2]==1});
      for(int i=0;i<actual.Length;i++)Check(Math.Abs(actual[i]-expected[i])<=1,"NV12 surface plane/cursor mismatch at "+i);
      uint saved;getTopology(context,out saved);Check(saved==2,"Snapshot render changed encoder context state");
     }
    }finally{if(staging!=IntPtr.Zero)Marshal.Release(staging);}
    using(var unconfirmed=SodaDesktopH264.CreateForDesktop(width,height,fps,2500,capture))Check(!unconfirmed.GpuInput,"Unconfirmed desktop used GPU surface input");
    Set(capture,"hasFrame",true);
    var packets=new List<object>();var timings=new List<double>();int readbacks=capture.CpuReadbacks;
    double gpuCpu;using(var p=Process.GetCurrentProcess())gpuCpu=p.TotalProcessorTime.TotalMilliseconds;
    using(var encoder=SodaDesktopH264.CreateForDesktop(width,height,fps,2500,capture)) {
     Check(encoder.GpuInput,"Encoder did not select GPU input");
     for(int frame=0;frame<90;frame++) {
      var t=Stopwatch.StartNew();var lease=(SodaDesktopDxgi.GpuFrame)render.Invoke(capture,new object[]{10,10,frame>=4});
      var packet=encoder.EncodeGpuFrame(lease,(long)Math.Round(frame*1000000.0/fps),t.Elapsed.TotalMilliseconds);
      // A caller's using/finally cannot retire an MF-owned frame early.
      lease.Dispose();
      Check(packet.data.Length>0&&packet.data.Length<=512*1024-9&&packet.timestamp==(long)Math.Round(frame*1000000.0/fps),"GPU encoded packet invalid");
      if(frame==0)Check(packet.key&&packet.codec!=null,"GPU encoder initial SPS/IDR missing");
      if(frame<4)packets.Add(new {key=packet.key,codec=packet.codec,data=Convert.ToBase64String(packet.data)});
      if(frame>=4)timings.Add(t.Elapsed.TotalMilliseconds);
     }
    }
    using(var p=Process.GetCurrentProcess())gpuCpu=p.TotalProcessorTime.TotalMilliseconds-gpuCpu;
    int gpuReadbacks=capture.CpuReadbacks-readbacks;Check(gpuReadbacks==0,"GPU encoder path read full frames back to CPU");
    // All slots must become available after MFT shutdown, even if retirement was
    // asynchronous. Holding all four verifies there are no stranded busy slots.
    leases.Clear();try{for(int i=0;i<4;i++)leases.Add((SodaDesktopDxgi.GpuFrame)render.Invoke(capture,new object[]{0,0,false}));}finally{foreach(var lease in leases)lease.Dispose();}
    if(!String.IsNullOrEmpty(fixture))File.WriteAllText(fixture,new JavaScriptSerializer().Serialize(new {width,height,packets}),new System.Text.UTF8Encoding(false));
    capture.DisableGpuSurfaces();
    var memoryTimings=new List<double>();var memory=new byte[width*height*3/2];var readback=typeof(SodaDesktopDxgi).GetMethod("RenderNv12",Private);
    using(var encoder=new SodaDesktopH264(width,height,fps,2500))for(int frame=0;frame<90;frame++) {
     var t=Stopwatch.StartNew();readback.Invoke(capture,new object[]{memory,10,10,true});double conversion=t.Elapsed.TotalMilliseconds;
     encoder.EncodePreparedNv12(memory,(long)Math.Round(frame*1000000.0/fps),conversion);if(frame>=4)memoryTimings.Add(t.Elapsed.TotalMilliseconds);
    }
    // Memory fallback stays usable after GPU surface input is disabled.
    using(var fallback=SodaDesktopH264.CreateForDesktop(width,height,fps,2500,capture))Check(!fallback.GpuInput,"Disabled surface mode did not fall back");
    timings.Sort();memoryTimings.Sort();double sum=0,memorySum=0;foreach(var value in timings)sum+=value;foreach(var value in memoryTimings)memorySum+=value;
    Console.WriteLine(new JavaScriptSerializer().Serialize(new {source="generated GPU texture to hardware MFT surface vs NV12 memory input; no desktop, capture, network or browser",frames=90,width,height,fps,gpuMeanMs=sum/timings.Count,gpuP95Ms=timings[(int)Math.Ceiling(timings.Count*.95)-1],memoryMeanMs=memorySum/memoryTimings.Count,memoryP95Ms=memoryTimings[(int)Math.Ceiling(memoryTimings.Count*.95)-1],gpuCpuMs=gpuCpu,fullFrameCpuReadbacks=gpuReadbacks}));
   }finally{capture.Dispose();capture.Dispose();}
   Console.WriteLine("desktop_gpu_surface_checks_passed: NV12 planes, D3D11-aware MFT, bounded pool, tracked-sample retirement, delayed/double release, shutdown, generated color fixture");
  }
 }
}
