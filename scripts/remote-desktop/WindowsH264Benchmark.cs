// Generated pixels only. Exercises the production encoder and frame-delay policy.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Threading;
using System.Web.Script.Serialization;
namespace SodaDesktopTests {
 public static class H264Benchmark {
  static double Mean(List<double> values){double sum=0;foreach(double value in values)sum+=value;return sum/values.Count;}
  static double P95(List<double> values){values.Sort();return values[(int)Math.Ceiling(values.Count*.95)-1];}
  public static void Run(bool validateTimer) {
   var policy=typeof(SodaDesktopH264).Assembly.GetType("SodaDesktopVideoDelay");
   var frameDelay=policy==null?null:policy.GetMethod("FrameDelay");
   var pause=typeof(SodaDesktopH264).GetMethod("Pause");
   if(policy!=null)using(var delay=(IDisposable)Activator.CreateInstance(policy,new object[]{true})) {
    bool highResolution=(bool)policy.GetProperty("HighResolution").GetValue(delay,null);
    var timer=Stopwatch.StartNew();for(int i=0;i<40;i++)policy.GetMethod("Pause").Invoke(delay,new object[]{1});
    double mean=timer.Elapsed.TotalMilliseconds/40;
    Console.WriteLine(new JavaScriptSerializer().Serialize(new {highResolution,timerRequestedMs=1,timerActualMeanMs=mean}));
    if(validateTimer&&highResolution&&mean>=10)throw new InvalidOperationException("High-resolution 1ms timer averaged >=10ms");
   }
   var conversion=new List<double>();var encoding=new List<double>();
   using(var encoder=new SodaDesktopH264(1920,1200,30,2500))using(var bitmap=new Bitmap(1920,1200,System.Drawing.Imaging.PixelFormat.Format24bppRgb))using(var g=Graphics.FromImage(bitmap)) {
    g.FillRectangle(Brushes.Red,0,0,960,600);g.FillRectangle(Brushes.Lime,960,0,960,600);g.FillRectangle(Brushes.Blue,0,600,960,600);g.FillRectangle(Brushes.Yellow,960,600,960,600);
    for(int i=0;i<4;i++)encoder.EncodeBitmap(bitmap,i*33333L);
    var clock=Stopwatch.StartNew();long next=0;int frames=0;double cpuStart;using(var process=Process.GetCurrentProcess())cpuStart=process.TotalProcessorTime.TotalMilliseconds;
    while(frames<90) {
     long now=clock.ElapsedMilliseconds;
     if(now>=next) {
      g.FillRectangle(Brushes.Gray,(frames*17)%1800,550,80,80);
      // No screen capture, network or browser: generated bitmap -> hardware encoder.
      encoder.EncodeBitmap(bitmap,(frames+4)*33333L);frames++;next=now+1000/30;
      conversion.Add(encoder.ConversionMs);encoding.Add(encoder.EncodingMs);
     }
     int wait=frameDelay==null?2:(int)frameDelay.Invoke(null,new object[]{clock.ElapsedMilliseconds,next,true});
     if(wait>0){if(pause==null)Thread.Sleep(wait);else pause.Invoke(encoder,new object[]{wait});}
    }
    double elapsed=clock.Elapsed.TotalMilliseconds,cpu;using(var process=Process.GetCurrentProcess())cpu=process.TotalProcessorTime.TotalMilliseconds-cpuStart;
    Console.WriteLine(new JavaScriptSerializer().Serialize(new {source="generated pixels only; no capture, network, ACK, browser",frames,width=1920,height=1200,fps=frames*1000/elapsed,conversionMeanMs=Mean(conversion),conversionP95Ms=P95(conversion),encoderMeanMs=Mean(encoding),encoderP95Ms=P95(encoding),helperCpuOneCorePercent=cpu/elapsed*100,deadlinePacing=frameDelay!=null}));
   }
  }
 }
}
