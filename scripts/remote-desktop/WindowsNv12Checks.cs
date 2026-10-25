// Generated pixels only. No screen capture, OS input, or encoder sessions.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Windows.Forms;
using System.Web.Script.Serialization;
namespace SodaDesktopTests {
 public static class Nv12Checks {
  static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
  // Frozen scalar reference: BT.709 limited range, rounded 2x2 chroma average.
  static void Reference(byte[] bgr,byte[] nv12,int width,int height) {
   for(int y=0;y<height;y+=2)for(int x=0;x<width;x+=2) {
    int r=0,g=0,b=0;
    for(int yy=0;yy<2;yy++)for(int xx=0;xx<2;xx++) {
     int p=(y+yy)*width+x+xx,i=p*3;int blue=bgr[i],green=bgr[i+1],red=bgr[i+2];
     nv12[p]=(byte)(((47*red+157*green+16*blue+128)>>8)+16);r+=red;g+=green;b+=blue;
    }
    r=(r+2)/4;g=(g+2)/4;b=(b+2)/4;int uv=width*height+(y/2)*width+x;
    nv12[uv]=(byte)(((-26*r-86*g+112*b+128)>>8)+128);nv12[uv+1]=(byte)(((112*r-102*g-10*b+128)>>8)+128);
   }
  }
  public static void Run() {
   var random=new Random(17);
   foreach(int width in new[]{2,6,18,1278,1920})foreach(int height in new[]{2,4,14}) {
    var input=new byte[width*height*3];var actual=new byte[width*height*3/2];var expected=new byte[actual.Length];
    for(int trial=0;trial<5;trial++) {
     if(trial==0)Array.Clear(input,0,input.Length);
     else if(trial==1)for(int i=0;i<input.Length;i++)input[i]=255;
     else random.NextBytes(input);
     var before=(byte[])input.Clone();Reference(input,expected,width,height);SodaDesktopH264.ConvertNv12(input,actual,width,height);
     for(int i=0;i<actual.Length;i++)Check(actual[i]==expected[i],"NV12 mismatch at "+width+"x"+height+" byte "+i);
     for(int i=0;i<input.Length;i++)Check(input[i]==before[i],"Conversion changed source pixels");
    }
   }
   foreach(var size in new[]{new[]{1,2},new[]{2,1},new[]{3,2},new[]{2,3},new[]{4096,2400}}) {
    bool rejected=false;try{SodaDesktopH264.ConvertNv12(new byte[12],new byte[6],size[0],size[1]);}catch(ArgumentException){rejected=true;}Check(rejected,"Invalid dimensions accepted");
   }
   var failed=(SodaDesktopDxgi)Activator.CreateInstance(typeof(SodaDesktopDxgi),BindingFlags.Instance|BindingFlags.NonPublic,null,new object[]{2,2},null);
   try {
    double ignored;Check(!failed.TryCaptureNv12(new byte[1],0,0,false,out ignored),"Malformed GPU destination accepted");
    // The second call must return before any desktop/GPU API: this object has
    // no native device or duplication. It exercises the actual failure latch.
    Check(!failed.TryCaptureNv12(new byte[6],0,0,false,out ignored),"Failed GPU path retried");
   }finally{failed.Dispose();}
   Console.WriteLine("desktop_nv12_checks_passed: byte-exact BT.709 reference, black/white/random, chroma rounding, row edges, source preserved, invalid dimensions, GPU failure latch");
  }
  static double Mean(List<double> values){double sum=0;foreach(double value in values)sum+=value;return sum/values.Count;}
  static double P95(List<double> values){values.Sort();return values[(int)Math.Ceiling(values.Count*.95)-1];}
  public static void Benchmark() {
   foreach(int width in new[]{1280,1920}) {
    int height=width==1280?800:1200;var input=new byte[width*height*3];var output=new byte[width*height*3/2];new Random(17).NextBytes(input);
    for(int i=0;i<8;i++){Reference(input,output,width,height);SodaDesktopH264.ConvertNv12(input,output,width,height);}
    var scalar=new List<double>();var current=new List<double>();var copy=new List<double>();
    using(var bitmap=new Bitmap(width,height,PixelFormat.Format24bppRgb))using(var g=Graphics.FromImage(bitmap)) {
     g.Clear(Color.Gray);
     for(int i=0;i<40;i++) {
      // Reverse the order on alternate trials to limit systematic warmup bias.
      for(int pass=0;pass<2;pass++) {
       bool baseline=(pass+i)%2==0;var t=Stopwatch.StartNew();
       if(baseline)Reference(input,output,width,height);else SodaDesktopH264.ConvertNv12(input,output,width,height);
       (baseline?scalar:current).Add(t.Elapsed.TotalMilliseconds);
      }
      var timer=Stopwatch.StartNew();var bits=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
      try{for(int row=0;row<height;row++)Marshal.Copy(IntPtr.Add(bits.Scan0,row*bits.Stride),input,row*width*3,width*3);}finally{bitmap.UnlockBits(bits);}
      copy.Add(timer.Elapsed.TotalMilliseconds);
     }
    }
    Console.WriteLine(new JavaScriptSerializer().Serialize(new {source="generated pixels only; no capture, encoder, network or browser",width,height,trials=40,referenceMeanMs=Mean(scalar),currentMeanMs=Mean(current),referenceP95Ms=P95(scalar),currentP95Ms=P95(current),bitmapCopyMeanMs=Mean(copy),bitmapCopyP95Ms=P95(copy)}));
   }
  }
  [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
  [DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr adapter,uint driver,IntPtr software,uint flags,IntPtr levels,uint count,uint sdk,out IntPtr device,out uint level,out IntPtr context);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Upload(IntPtr self,IntPtr resource,uint subresource,IntPtr box,IntPtr data,uint pitch,uint depth);
  const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
  static void Set(SodaDesktopDxgi capture,string name,object value){typeof(SodaDesktopDxgi).GetField(name,Private).SetValue(capture,value);}
  static IntPtr Field(SodaDesktopDxgi capture,string name){return (IntPtr)typeof(SodaDesktopDxgi).GetField(name,Private).GetValue(capture);}
  public static void Gpu(bool benchmark) {
   foreach(int width in benchmark?new[]{1280,1920}:new[]{2,6,128,640}) {
    int height=benchmark?(width==1280?800:1200):Math.Min(width,360);
    var capture=(SodaDesktopDxgi)Activator.CreateInstance(typeof(SodaDesktopDxgi),Private,null,new object[]{width,height},null);
    try {
     IntPtr device,context;uint level;Marshal.ThrowExceptionForHR(D3D11CreateDevice(IntPtr.Zero,1,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out device,out level,out context));
     Set(capture,"device",device);Set(capture,"context",context);
     int sourceWidth=width*3/2+1,sourceHeight=height*2+1;
     typeof(SodaDesktopDxgi).GetMethod("InitializeResources",Private).Invoke(capture,new object[]{sourceWidth,sourceHeight});
     byte[] pixels=new byte[sourceWidth*sourceHeight*4];
     for(int y=0;y<sourceHeight;y++)for(int x=0;x<sourceWidth;x++){int i=(y*sourceWidth+x)*4;pixels[i]=(byte)((x*17+y*3)%256);pixels[i+1]=(byte)((y*19+x*7)%256);pixels[i+2]=(byte)((x*11+y*13)%256);pixels[i+3]=255;}
     var pin=GCHandle.Alloc(pixels,GCHandleType.Pinned);
     try{var upload=(Upload)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(context),48*IntPtr.Size),typeof(Upload));upload(context,Field(capture,"source"),0,IntPtr.Zero,pin.AddrOfPinnedObject(),(uint)(sourceWidth*4),0);}finally{pin.Free();}
     var gpu=typeof(SodaDesktopDxgi).GetMethod("RenderNv12",Private);var render=typeof(SodaDesktopDxgi).GetMethod("Render",Private);
     var actual=new byte[width*height*3/2];var expected=new byte[actual.Length];var bgr=new byte[width*height*3];
     using(var bitmap=new Bitmap(width,height,PixelFormat.Format24bppRgb))using(var g=Graphics.FromImage(bitmap)) {
      render.Invoke(capture,new object[]{g});Color retained=bitmap.GetPixel(width-1,height-1);
      foreach(var cursor in new[]{new[]{0,0,0},new[]{0,0,1},new[]{width-2,height-2,1},new[]{-5,-5,1}}) {
       render.Invoke(capture,new object[]{g});if(cursor[2]==1)Cursors.Default.Draw(g,new Rectangle(cursor[0],cursor[1],16,24));
       var bits=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
       try{for(int y=0;y<height;y++)Marshal.Copy(IntPtr.Add(bits.Scan0,y*bits.Stride),bgr,y*width*3,width*3);}finally{bitmap.UnlockBits(bits);}
       Reference(bgr,expected,width,height);gpu.Invoke(capture,new object[]{actual,cursor[0],cursor[1],cursor[2]==1});
       for(int i=0;i<actual.Length;i++)Check(Math.Abs(actual[i]-expected[i])<=1,"GPU NV12/color/cursor mismatch "+width+"x"+height+" byte "+i+" actual "+actual[i]+" expected "+expected[i]);
      }
      // Cursor composition must never contaminate the retained desktop source.
      gpu.Invoke(capture,new object[]{actual,0,0,false});render.Invoke(capture,new object[]{g});Check(bitmap.GetPixel(width-1,height-1).ToArgb()==retained.ToArgb(),"GPU cursor changed retained desktop");
      bool rejected=false;try{gpu.Invoke(capture,new object[]{new byte[1],0,0,false});}catch(TargetInvocationException e){rejected=e.InnerException is ArgumentException;}Check(rejected,"Invalid GPU NV12 buffer accepted");
      double ignored;Check(!capture.TryCaptureNv12(new byte[1],0,0,false,out ignored),"Invalid destination did not disable GPU conversion");
      Check(!capture.TryCaptureNv12(actual,0,0,false,out ignored),"Disabled GPU conversion did not fall back");
      render.Invoke(capture,new object[]{g});Check(bitmap.GetPixel(width-1,height-1).ToArgb()==retained.ToArgb(),"Fallback lost ordinary GPU capture");
      if(benchmark) {
       var timings=new List<double>();var cpu=new List<double>();
       for(int i=0;i<40;i++) {
        var t=Stopwatch.StartNew();gpu.Invoke(capture,new object[]{actual,10,10,true});timings.Add(t.Elapsed.TotalMilliseconds);
        t.Restart();render.Invoke(capture,new object[]{g});Cursors.Default.Draw(g,new Rectangle(10,10,16,24));
        var bits=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
        try{for(int y=0;y<height;y++)Marshal.Copy(IntPtr.Add(bits.Scan0,y*bits.Stride),bgr,y*width*3,width*3);}finally{bitmap.UnlockBits(bits);}
        Reference(bgr,expected,width,height);cpu.Add(t.Elapsed.TotalMilliseconds);
       }
       Console.WriteLine(new JavaScriptSerializer().Serialize(new {source="GPU generated texture; scale/cursor/convert/readback; no capture, encoder or network",width,height,trials=40,gpuMeanMs=Mean(timings),gpuP95Ms=P95(timings),bitmapCpuMeanMs=Mean(cpu),bitmapCpuP95Ms=P95(cpu)}));
      }
     }
    }finally{capture.Dispose();capture.Dispose();}
   }
   Console.WriteLine("desktop_nv12_gpu_checks_passed: generated texture, GPU scaling/BT.709/chroma, padded rows, cursor edges and inversion, retained source, disposal");
  }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static void Live() {
   SetProcessDPIAware();Check(SodaDesktopUnlock.SelectSource()=="normal","Normal desktop required");
   var screen=Screen.PrimaryScreen;var bounds=screen.Bounds;int width=Math.Min(1280,bounds.Width)&~1,height=((int)Math.Round(bounds.Height*(double)width/bounds.Width))&~1;
   using(var form=new Form()) {
    form.FormBorderStyle=FormBorderStyle.None;form.TopMost=true;form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;
    form.Bounds=new Rectangle(bounds.Left+64,bounds.Top+64,Math.Min(512,bounds.Width-128),Math.Min(256,bounds.Height-128));
    form.Paint+=(sender,e)=>{int w=form.ClientSize.Width/2,h=form.ClientSize.Height/2;e.Graphics.FillRectangle(Brushes.Red,0,0,w,h);e.Graphics.FillRectangle(Brushes.Lime,w,0,w,h);e.Graphics.FillRectangle(Brushes.Blue,0,h,w,h);e.Graphics.FillRectangle(Brushes.Yellow,w,h,w,h);};
    form.Show();form.Refresh();Application.DoEvents();System.Threading.Thread.Sleep(300);
    using(var capture=SodaDesktopDxgi.TryCreate(screen.DeviceName,bounds,width,height)) {
     Check(capture!=null,"DXGI unavailable");var bytes=new byte[width*height*3/2];for(int i=0;i<bytes.Length;i++)bytes[i]=205;
     double conversion;bool initial=capture.TryCaptureNv12(bytes,0,0,false,out conversion);
     if(!initial)for(int i=0;i<bytes.Length;i++)Check(bytes[i]==205,"Unconfirmed initial frame changed output");
     bool captured=initial;
     for(int attempt=0;attempt<10&&!captured;attempt++){form.Refresh();Application.DoEvents();System.Threading.Thread.Sleep(100);captured=capture.TryCaptureNv12(bytes,0,0,false,out conversion);}
     Check(captured,"Native GPU capture fell back");
     Color[] colors={Color.Red,Color.Lime,Color.Blue,Color.Yellow};
     for(int i=0;i<4;i++) {
      int x=(form.Left+form.Width*((i%2)*2+1)/4-bounds.Left)*width/bounds.Width,y=(form.Top+form.Height*((i/2)*2+1)/4-bounds.Top)*height/bounds.Height;
      var bgr=new byte[12];for(int p=0;p<4;p++){bgr[p*3]=colors[i].B;bgr[p*3+1]=colors[i].G;bgr[p*3+2]=colors[i].R;}
      var expected=new byte[6];Reference(bgr,expected,2,2);int uv=width*height+(y/2)*width+(x&~1);
      Check(Math.Abs(bytes[y*width+x]-expected[0])<=2&&Math.Abs(bytes[uv]-expected[4])<=2&&Math.Abs(bytes[uv+1]-expected[5])<=2,"Live GPU NV12 color/coordinate mismatch "+i);
     }
     // A malformed destination fails once and latches to the existing image path.
     Check(!capture.TryCaptureNv12(new byte[1],0,0,false,out conversion),"Malformed destination accepted");
     Check(!capture.TryCaptureNv12(bytes,0,0,false,out conversion),"GPU failure was not latched");
     using(var bitmap=new Bitmap(width,height))using(var g=Graphics.FromImage(bitmap))Check(capture.Capture(g),"GPU conversion failure disabled ordinary capture");
    }
    form.Close();
   }
   Console.WriteLine("desktop_nv12_live_checks_passed: generated window via production native capture, initial-frame guard, colors, exception fail latch, ordinary capture fallback; no input or saved images");
  }
 }
}
