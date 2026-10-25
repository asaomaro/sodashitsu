// Explicit hardware tests. Every encoded pixel is generated here, never captured.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Web.Script.Serialization;
namespace SodaDesktopTests {
 public static class H264Checks {
  static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
  public static void Run(string fixtureFile) {
   var bgr=new byte[12];var nv12=new byte[6];
   SodaDesktopH264.ConvertNv12(bgr,nv12,2,2);Check(nv12[0]==16&&nv12[4]==128&&nv12[5]==128,"Black NV12 conversion");
   for(int i=0;i<4;i++)bgr[i*3+2]=255;
   SodaDesktopH264.ConvertNv12(bgr,nv12,2,2);Check(nv12[0]==63&&nv12[4]==102&&nv12[5]==240,"Red NV12 conversion");
   bool rejected=false;try{SodaDesktopH264.ConvertNv12(bgr,nv12,3,2);}catch(ArgumentException){rejected=true;}Check(rejected,"Odd NV12 dimensions accepted");
   var packets=new List<object>();
   using(var encoder=new SodaDesktopH264(640,360,30,2500))using(var bitmap=new Bitmap(640,360))using(var g=Graphics.FromImage(bitmap)) {
    g.FillRectangle(Brushes.Red,0,0,320,180);g.FillRectangle(Brushes.Lime,320,0,320,180);g.FillRectangle(Brushes.Blue,0,180,320,180);g.FillRectangle(Brushes.Yellow,320,180,320,180);
    using(var gray=new SolidBrush(Color.FromArgb(128,128,128)))g.FillRectangle(gray,256,144,128,72);
    var preparedBgr=new byte[640*360*3];var preparedNv12=new byte[640*360*3/2];
    for(int y=0;y<360;y++)for(int x=0;x<640;x++){var color=bitmap.GetPixel(x,y);int p=(y*640+x)*3;preparedBgr[p]=color.B;preparedBgr[p+1]=color.G;preparedBgr[p+2]=color.R;}
    SodaDesktopH264.ConvertNv12(preparedBgr,preparedNv12,640,360);
    for(int frame=0;frame<4;frame++) {
     var packet=(frame&1)==0?encoder.EncodeBitmap(bitmap,frame*33333L):encoder.EncodePreparedNv12(preparedNv12,frame*33333L,0);
     Check(packet.data.Length>0&&packet.data.Length<=512*1024-9,"Packet limit");Check(packet.timestamp==frame*33333L,"Timestamp");
     if(frame==0)Check(packet.key&&packet.codec!=null,"Initial SPS/IDR missing");
     byte[] bytes=StripFiller(packet.data);
     packets.Add(new {key=packet.key,codec=packet.codec,data=Convert.ToBase64String(bytes)});
    }
   }
   if(!String.IsNullOrEmpty(fixtureFile))File.WriteAllText(fixtureFile,new JavaScriptSerializer().Serialize(new {width=640,height=360,packets}),new System.Text.UTF8Encoding(false));
   Check(SodaDesktopVideoDelay.FrameDelay(10,10+1000.0/60,true)==10&&SodaDesktopVideoDelay.FrameDelay(26,26+2.0/3,true)==1,"Fractional 60fps deadline truncated");
   using(var fast=new SodaDesktopH264(640,360,60,2500)) {
    var bytes=new byte[640*360*3/2];for(int i=0;i<640*360;i++)bytes[i]=16;for(int i=640*360;i<bytes.Length;i++)bytes[i]=128;
    for(int frame=0;frame<4;frame++){var packet=fast.Encode(bytes,(long)Math.Round(frame*1000000.0/60));Check(packet!=null&&packet.timestamp==(long)Math.Round(frame*1000000.0/60),"60fps hardware timestamp");if(frame==0)Check(packet.key&&packet.codec!=null,"60fps initial SPS/IDR missing");}
   }
   Console.WriteLine("desktop_h264_checks_passed: hardware-only MFT, bitmap/prepared NV12, four generated frames, initial SPS/IDR, timestamps, packet limits");
  }
  // Only test fixtures remove Annex-B filler NALs (CBR padding), preserving SPS/PPS/IDR/deltas.
  static byte[] StripFiller(byte[] bytes) {
   var starts=new List<int>();
   for(int i=0;i+3<bytes.Length;i++)if(bytes[i]==0&&bytes[i+1]==0&&(bytes[i+2]==1||(bytes[i+2]==0&&bytes[i+3]==1))){starts.Add(i);i+=bytes[i+2]==1?2:3;}
   starts.Add(bytes.Length);
   using(var output=new MemoryStream()) {
    for(int i=0;i<starts.Count-1;i++){int p=starts[i],header=p+(bytes[p+2]==1?3:4);if((bytes[header]&31)!=12)output.Write(bytes,p,starts[i+1]-p);}
    return output.ToArray();
   }
  }
 }
}
