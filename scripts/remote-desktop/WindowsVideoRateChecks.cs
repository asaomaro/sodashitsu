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
   var profile=new SodaDesktopVideoProfile(2,1,960,600,1280,800,17,1800,rate,1000);
   bool blocked=false;try{profile.Resume(2,0);}catch(InvalidOperationException){blocked=true;}if(!blocked)throw new InvalidOperationException("Resume before actual SPS/IDR");
   var packet=new SodaDesktopH264.Packet{key=true,codec="avc1.420420",data=new byte[]{0,0,0,1,0x65},timestamp=1000};profile.Hold(packet,7);
   blocked=false;try{profile.Resume(2,6);}catch(InvalidOperationException){blocked=true;}if(!blocked)throw new InvalidOperationException("Wrong base resumed profile");
   profile.Resume(2,7);if(!Object.ReferenceEquals(packet,profile.Take())||!profile.Expired(4000)||profile.Expired(3999))throw new InvalidOperationException("Profile packet/deadline");
   blocked=false;try{profile.Take();}catch(InvalidOperationException){blocked=true;}if(!blocked)throw new InvalidOperationException("Held IDR sent twice");
   var capture=(SodaDesktopDxgi)Activator.CreateInstance(typeof(SodaDesktopDxgi),System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance,null,new object[]{1279,800},null);
   try{SodaDesktopH264 encoder;bool cpuOnly;if(SodaDesktopHost.TryCreateNativeVideo(1279,800,30,2500,capture,out encoder,out cpuOnly)||encoder!=null)throw new InvalidOperationException("Odd output must remain video-only failure");}finally{capture.Dispose();}
   Console.WriteLine("desktop_video_rate_checks_passed: private cadence/bitrate ceilings, recovery to original maximum, no OS calls");
  }
 }
}
