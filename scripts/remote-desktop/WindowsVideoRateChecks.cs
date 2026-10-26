using System;
namespace SodaDesktopTests {
 public static class VideoRateChecks {
  public static void Run(){
   var rate=new SodaDesktopVideoRate(60,2500);rate.Validate(17,128);rate.Validate(60,2500);
   foreach(var value in new[]{new[]{61,2500},new[]{0,2500},new[]{60,2501},new[]{60,127}}){bool rejected=false;try{rate.Validate(value[0],value[1]);}catch(ArgumentException){rejected=true;}if(!rejected)throw new InvalidOperationException("Native rate ceiling bypassed");}
   new SodaDesktopVideoRate(1,128).Validate(1,128);
   rate.Apply(17,2500,kbps=>{throw new InvalidOperationException("FPS-only called bitrate API");});if(rate.Fps!=17)throw new InvalidOperationException("FPS-only update not applied");
   rate.Apply(60,2500,kbps=>{throw new InvalidOperationException("FPS recovery called bitrate API");});
   int calls=0;rate.Apply(30,1800,kbps=>{calls++;});rate.Apply(25,1800,kbps=>{calls++;});if(calls!=1||rate.Fps!=25)throw new InvalidOperationException("Redundant bitrate setter");
   bool failed=false;try{rate.Apply(20,1600,kbps=>{throw new InvalidOperationException("Encoder rate update failed");});}catch(InvalidOperationException){failed=true;}if(!failed||rate.Fps!=25)throw new InvalidOperationException("Partial rate update committed");
   Console.WriteLine("desktop_video_rate_checks_passed: private cadence/bitrate ceilings, recovery to original maximum, no OS calls");
  }
 }
}
