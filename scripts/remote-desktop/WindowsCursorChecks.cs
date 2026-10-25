// Generated cursor handles and memory bitmaps only; no desktop capture/input.
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
namespace SodaDesktopTests {
 public static class CursorChecks {
  [StructLayout(LayoutKind.Sequential)]struct INFO{public int icon;public uint x,y;public IntPtr mask,color;}
  [StructLayout(LayoutKind.Sequential)]struct HEADER{public uint size;public int width,height;public ushort planes,bits;public uint compression,image;public int x,y;public uint colors,important;}
  [DllImport("gdi32.dll")]static extern IntPtr CreateDIBSection(IntPtr dc,ref HEADER header,uint usage,out IntPtr bits,IntPtr section,uint offset);
  [DllImport("gdi32.dll")]static extern IntPtr CreateBitmap(int w,int h,uint planes,uint bits,byte[] bytes);
  [DllImport("gdi32.dll")]static extern IntPtr CreateCompatibleDC(IntPtr previous);
  [DllImport("gdi32.dll")]static extern IntPtr SelectObject(IntPtr dc,IntPtr bitmap);
  [DllImport("gdi32.dll")]static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr bitmap);
  [DllImport("user32.dll")]static extern IntPtr CreateIconIndirect(ref INFO info);
  [DllImport("user32.dll")]static extern bool DestroyIcon(IntPtr icon);
  [DllImport("user32.dll")]static extern bool DrawIconEx(IntPtr dc,int x,int y,IntPtr icon,int w,int h,uint step,IntPtr background,uint flags);
  static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
  static int Compose(SodaDesktopCursor.Shape shape,int x,int y,int channel,int background){
   int p=y*shape.Pitch+x*4,c=shape.Data[p+2-channel],a=shape.Data[p+3];
   if(shape.Kind==4)return (background&(a==255?255:0))^c;
   return a==0?background:shape.Premultiplied?Math.Min(255,c+(int)Math.Round(background*(255-a)/255.0)):(int)Math.Round((c*a+background*(255-a))/255.0);
  }
  static void Compare(IntPtr icon) {
   var shape=SodaDesktopCursor.FromIcon(icon);shape.Validate();Check(shape.Width==4&&shape.Height==2&&shape.HotspotX==1&&shape.HotspotY==1,"Cursor dimensions/hotspot");
   foreach(var background in new[]{Color.FromArgb(17,83,201),Color.FromArgb(240,150,60)}){
    IntPtr dc=CreateCompatibleDC(IntPtr.Zero),bitmap=IntPtr.Zero,previous=IntPtr.Zero,bits;
    try {
     var header=new HEADER{size=40,width=4,height=-2,planes=1,bits=32};bitmap=CreateDIBSection(dc,ref header,0,out bits,IntPtr.Zero,0);Check(bitmap!=IntPtr.Zero&&dc!=IntPtr.Zero,"Reference cursor DIB");previous=SelectObject(dc,bitmap);
     byte[] pixels=new byte[32];for(int p=0;p<pixels.Length;p+=4){pixels[p]=background.B;pixels[p+1]=background.G;pixels[p+2]=background.R;pixels[p+3]=255;}Marshal.Copy(pixels,0,bits,pixels.Length);
     Check(DrawIconEx(dc,0,0,icon,4,2,0,IntPtr.Zero,3),"DrawIconEx failed");Marshal.Copy(bits,pixels,0,pixels.Length);
     for(int y=0;y<2;y++)for(int x=0;x<4;x++){int[] bg={background.R,background.G,background.B};for(int c=0;c<3;c++){int actual=pixels[(y*4+x)*4+2-c];Check(Math.Abs(actual-Compose(shape,x,y,c,bg[c]))<=1,"Cursor composite mismatch "+shape.Kind+" at "+x+","+y+" channel "+c+": "+actual+" expected "+Compose(shape,x,y,c,bg[c]));}}
    }finally{if(previous!=IntPtr.Zero)SelectObject(dc,previous);if(bitmap!=IntPtr.Zero)DeleteObject(bitmap);if(dc!=IntPtr.Zero)DeleteDC(dc);}
   }
  }
  static void CheckStop() {
   object gate=new object();int allowedCalls=0;
   SodaDesktopCursor pump=null;
   System.Threading.Monitor.Enter(gate);
   try {
    pump=new SodaDesktopCursor(()=>null,new Rectangle(0,0,4,2),true,()=>{allowedCalls++;return true;},gate,_=>{});
    var thread=(System.Threading.Thread)typeof(SodaDesktopCursor).GetField("thread",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(pump);
    Check(System.Threading.SpinWait.SpinUntil(()=>(thread.ThreadState&System.Threading.ThreadState.WaitSleepJoin)!=0,1000),"Worker did not reach blocked output gate");
    var timer=System.Diagnostics.Stopwatch.StartNew();Check(!pump.Stop(20),"Blocked worker must report unsuccessful stop");Check(timer.ElapsedMilliseconds<500,"Stop must have a finite deadline");Check(allowedCalls==0,"Blocked worker must not query desktop");
   } finally {System.Threading.Monitor.Exit(gate);}
   Check(pump.Stop(1000),"Worker must stop after gate release");Check(allowedCalls==0,"Stopped worker must never query desktop");pump.Dispose();
  }
  public static void Run() {
   CheckStop();
   foreach(int mode in new[]{0,1,2}) {bool alpha=mode==1;
    IntPtr bits,color=IntPtr.Zero,mask=IntPtr.Zero,icon=IntPtr.Zero;
    try {
     var header=new HEADER{size=40,width=4,height=-2,planes=1,bits=mode==2?(ushort)24:(ushort)32};color=CreateDIBSection(IntPtr.Zero,ref header,0,out bits,IntPtr.Zero,0);Check(color!=IntPtr.Zero,"Cursor DIB");
     byte[] bytes=alpha?new byte[]{0,0,64,128,0,255,0,255,0,0,0,0,255,0,0,255,0,0,64,128,0,255,0,255,0,0,0,0,255,0,0,255}:new byte[]{0,0,0,0,255,255,255,0,0,0,0,0,255,255,255,0,0,0,0,0,255,255,255,0,0,0,0,0,255,255,255,0};
     if(mode==2){byte[] rgb=new byte[24];for(int i=0;i<8;i++)for(int c=0;c<3;c++)rgb[i*3+c]=bytes[i*4+c];bytes=rgb;}
     Marshal.Copy(bytes,0,bits,bytes.Length);mask=CreateBitmap(4,2,1,1,new byte[]{0x30,0,0x30,0});var info=new INFO{x=1,y=1,color=color,mask=mask};icon=CreateIconIndirect(ref info);Check(icon!=IntPtr.Zero,"Cursor icon");Compare(icon);
    }finally{if(icon!=IntPtr.Zero)DestroyIcon(icon);if(mask!=IntPtr.Zero)DeleteObject(mask);if(color!=IntPtr.Zero)DeleteObject(color);}
   }
   IntPtr mono=IntPtr.Zero,monoIcon=IntPtr.Zero;
   try{mono=CreateBitmap(4,4,1,1,new byte[]{0x30,0,0x30,0,0x50,0,0x50,0});var info=new INFO{x=1,y=1,mask=mono};monoIcon=CreateIconIndirect(ref info);Check(monoIcon!=IntPtr.Zero,"Mono cursor");Compare(monoIcon);}finally{if(monoIcon!=IntPtr.Zero)DestroyIcon(monoIcon);if(mono!=IntPtr.Zero)DeleteObject(mono);}
   Console.WriteLine("desktop_cursor_checks_passed: generated alpha/color/monochrome icons, hotspot, transparent/black/white/inversion vs DrawIconEx; no capture/input");
  }
 }
}
