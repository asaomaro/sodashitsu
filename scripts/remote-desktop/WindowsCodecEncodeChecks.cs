// Generated color frames through hardware-only MFTs. Never captures a desktop.
using System;
using System.Drawing;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;
namespace SodaDesktopTests {
 public static class CodecEncodeChecks {
  public static void Run(string folder){
   if(!String.IsNullOrEmpty(folder))Directory.CreateDirectory(folder);
   var results=new List<object>();
   foreach(string codec in new[]{"h264","h264-444","hevc","av1"}){
    if(folder!=null){string old=Path.Combine(folder,codec+"-generated.json");if(File.Exists(old))File.Delete(old);}
    bool forced=false;string actual=null;int count=0;
    try{
     using(var encoder=new SodaDesktopH264(640,360,30,2500,IntPtr.Zero,codec))using(var bitmap=new Bitmap(640,360))using(var graphics=Graphics.FromImage(bitmap)){
      graphics.FillRectangle(Brushes.Red,0,0,320,180);graphics.FillRectangle(Brushes.Lime,320,0,320,180);graphics.FillRectangle(Brushes.Blue,0,180,320,180);graphics.FillRectangle(Brushes.Yellow,320,180,320,180);
      var packets=new List<object>();
      for(int frame=0;frame<4;frame++){
       if(frame==2)encoder.ForceKeyFrame();var packet=encoder.EncodeBitmap(bitmap,frame*33333L);if(packet==null||packet.data.Length==0||packet.data.Length>512*1024-9)throw new InvalidOperationException("Generated codec packet limit");
       if(frame==0&&(!packet.key||packet.codec==null))throw new InvalidOperationException("Generated random-access header missing");if(frame==0)actual=packet.codec;if(frame==2)forced=packet.key;
       packets.Add(new {key=packet.key,codec=packet.codec,data=Convert.ToBase64String(packet.data)});count++;
      }
      if(folder!=null)File.WriteAllText(Path.Combine(folder,codec+"-generated.json"),new JavaScriptSerializer().Serialize(new {family=codec,width=640,height=360,packets}),new System.Text.UTF8Encoding(false));
     }
     results.Add(new {codec,available=true,actual,frames=count,forcedRandomAccess=forced});
    }catch(Exception error){if(codec=="h264")throw;string reason=error.Message;for(var nested=error.InnerException;nested!=null;nested=nested.InnerException)reason+=" -> "+nested.Message;results.Add(new {codec,available=false,reason});}
   }
   Console.WriteLine(new JavaScriptSerializer().Serialize(new {source="generated bitmap to hardware-only MFT; no desktop/input/clipboard",results}));
  }
 }
}
