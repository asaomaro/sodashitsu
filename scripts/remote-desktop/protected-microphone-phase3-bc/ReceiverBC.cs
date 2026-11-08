// Standalone NORMAL-user capture witness only. Never used as the product audio actor.
using System;using System.IO;using System.Diagnostics;using System.Reflection;using System.Runtime.InteropServices;using System.Threading;using System.Collections.Generic;using System.Web.Script.Serialization;
public static class Phase3BC {
 public static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=65536};
 public static bool SameToken(SodaDesktopUserMicrophonePolicy.Facts a,SodaDesktopUserMicrophonePolicy.Facts b,string scenario){return (scenario=="B"||scenario=="C")&&a!=null&&b!=null&&!a.System&&!b.System&&!a.Elevated&&!b.Elevated&&a.Owner!=null&&a.Logon!=null&&a.Owner==b.Owner&&a.Logon==b.Logon&&a.Session>0&&a.Session==b.Session&&a.ActiveSession==a.Session&&b.ActiveSession==b.Session&&(scenario=="B"?(a.LockState==0||a.LockState==1)&&(b.LockState==0||b.LockState==1):a.LockState==1&&b.LockState==1);}
 public static double UnixMs(){return (DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;}
 public static void Receipt(string path,object value){using(var stream=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){byte[] bytes=System.Text.Encoding.UTF8.GetBytes(Json.Serialize(value));stream.Write(bytes,0,bytes.Length);stream.Flush(true);}}
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int BufferFrames(IntPtr client,out uint frames);
 public static uint CaptureBuffer(Phase3Capture capture){IntPtr client=(IntPtr)typeof(Phase3Capture).GetField("client",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(capture);uint frames;Phase3Capture.Check(Phase3Capture.Method<BufferFrames>(client,4)(client,out frames));if(frames<1||frames>48000)throw new InvalidOperationException("capture-buffer-size");return frames;}
}
public sealed class Phase3Quiet {
 public int frames,maxStreak,postQuietToneFrames;public double started=-1,last,previous=-1;public bool met;
 public void Accept(bool tone,bool broken,double wall){double gap=previous<0?0:wall-previous;previous=wall;if(tone){if(met)postQuietToneFrames++;frames=0;started=-1;return;}if(broken||gap>60){frames=0;started=-1;}if(started<0)started=wall;last=wall;frames++;maxStreak=Math.Max(maxStreak,frames);if(frames>=100&&wall-started>=1980)met=true;}
 public double Wall{get{return started<0?0:last-started;}}
}
public static class Phase3BCReceiver {
 [MTAThread]public static int Main(string[] args){if(args.Length!=1)return 2;Phase3Capture capture=null;string result=null;bool physical=false;int exit=2;
  try{string root=Path.GetDirectoryName(Path.GetFullPath(args[0]));var m=Phase3BC.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));string scenario=(string)m["scenario"];if(!Object.Equals(m["approved"],true)||(scenario!="B"&&scenario!="C"))throw new InvalidOperationException("not-approved");result=Path.Combine(root,"receiver-result.json");
   int parent=Convert.ToInt32(m["controllerPid"]);long birth=Int64.Parse((string)m["controllerStartedTicks"]);DateTime expires=DateTime.Parse((string)m["expiresAt"],null,System.Globalization.DateTimeStyles.RoundtripKind).ToUniversalTime();if((expires-DateTime.UtcNow).TotalSeconds>240)throw new InvalidOperationException("receiver-ttl");
   using(var owner=Process.GetProcessById(parent)){
    Func<bool> current=delegate{try{owner.Refresh();return DateTime.UtcNow<expires&&!owner.HasExited&&owner.StartTime.ToUniversalTime().Ticks==birth&&Phase3BC.SameToken(Phase3Native.Facts(Process.GetCurrentProcess().Id),Phase3Native.Facts(parent),scenario);}catch{return false;}};
    if(!current()||Phase3Native.Hash(Phase3Native.Executable(parent))!=(string)m["controllerExeSha256"]||Phase3Native.Hash(Phase3Native.Executable(Process.GetCurrentProcess().Id))!=(string)m["receiverExeSha256"])throw new InvalidOperationException("receiver-identity");
    var initialCapture=Phase3Endpoint.Read((string)m["captureEndpoint"],1);var initialRender=Phase3Endpoint.Read((string)m["renderEndpoint"],0);if(!Phase3Endpoint.Available(initialCapture)||!Phase3Endpoint.Available(initialRender)||!Phase3Native.DefaultDesktop())throw new InvalidOperationException("unused-default-pair");
    Phase3BC.Receipt(Path.Combine(root,"receiver-armed.json"),new{pid=Process.GetCurrentProcess().Id,startedTicks=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString(),exeSha256=Phase3Native.Hash(Phase3Native.Executable(Process.GetCurrentProcess().Id)),normal=true,sameScope=true,captureVolume=initialCapture.volume,renderVolume=initialRender.volume});
    var clock=Stopwatch.StartNew();while(!File.Exists(Path.Combine(root,"receiver-go"))){if(clock.ElapsedMilliseconds>180000||!current()||File.Exists(Path.Combine(root,"stop")))throw new InvalidOperationException("receiver-armed-retired");Thread.Sleep(10);}
    var go=Phase3BC.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"receiver-go")));string expectedMode=scenario=="C"?"elevated-uac":"elevated-default";if(!Object.Equals(go["mode"],expectedMode)||!Object.Equals(go["backend"],"windows-gdi")||!Object.Equals(go["protectedMicrophone"],true)||!Object.Equals(go["secureDesktop"],true))throw new InvalidOperationException("native-source-mode");
    int actorPid=Convert.ToInt32(go["actorPid"]);using(var actor=Process.GetProcessById(actorPid)){
     if(actor.StartTime.ToUniversalTime().Ticks!=Int64.Parse((string)go["actorStartedTicks"])||Phase3Native.Hash(Phase3Native.Executable(actorPid))!=(string)go["actorExeSha256"]||!Phase3BC.SameToken(Phase3Native.Facts(actorPid),Phase3Native.Facts(parent),scenario))throw new InvalidOperationException("actual-actor");
     var render=Phase3Endpoint.Read((string)m["renderEndpoint"],0);if(!current()||!Phase3Endpoint.Available(Phase3Endpoint.Read((string)m["captureEndpoint"],1))||!render.active||!render.notDefault||!render.unmuted||!render.virtualCable||render.volume!=initialRender.volume||render.activeSessions!=1)throw new InvalidOperationException("owned-render-only");
     capture=new Phase3Capture((string)m["captureEndpoint"]);uint buffer=Phase3BC.CaptureBuffer(capture);clock.Restart();double startUtc=Phase3BC.UnixMs(),lockWall=-1,quietStart=-1;bool baseline=false,stable=false;int preLockTone=0,preLockStreak=0;double preLockFirst=-1,preLockLast=-1;var detector=new Phase3Detector();var quiet=new Phase3Quiet();var restoredQuiet=new Phase3Quiet();bool restoreSeen=false;
     while(clock.ElapsedMilliseconds<90000&&!File.Exists(Path.Combine(root,"stop"))){
      if(!current()||Math.Abs((Phase3BC.UnixMs()-startUtc)-clock.Elapsed.TotalMilliseconds)>100)throw new InvalidOperationException("receiver-scope-clock");
      var self=Phase3Native.Facts(Process.GetCurrentProcess().Id);var peer=Phase3Native.Facts(parent);if(scenario=="B"&&self.LockState==0&&peer.LockState==0&&lockWall<0){lockWall=clock.Elapsed.TotalMilliseconds;Phase3BC.Receipt(Path.Combine(root,"native-lock.json"),new{nativeLockAtMs=startUtc+lockWall,lockState=0});}
      if(scenario=="B"&&lockWall>=0&&self.LockState==1&&peer.LockState==1&&Phase3Native.DefaultDesktop()&&!restoreSeen){restoreSeen=true;Phase3BC.Receipt(Path.Combine(root,"native-restored.json"),new{unlocked=true,defaultDesktop=true,atMs=startUtc+clock.Elapsed.TotalMilliseconds});}
      if(!baseline&&clock.ElapsedMilliseconds>=2000){if(detector.baselineBad||detector.baselineFrames<90)throw new InvalidOperationException("baseline-not-silent");baseline=true;Phase3BC.Receipt(Path.Combine(root,"baseline-ready.json"),new{ok=true});}
      capture.Drain(delegate(short[] pcm,bool broken){double wall=clock.Elapsed.TotalMilliseconds;var metric=Phase3Metrics.Read(pcm,0);var right=Phase3Metrics.Read(pcm,1);bool loud=Math.Max(metric.rms,right.rms)>10||Math.Max(metric.magnitude,right.magnitude)>10;bool tone=metric.rms>=4000&&metric.rms<=7000&&metric.magnitude>=6500&&metric.magnitude<=9500&&metric.clips==0;
       detector.Accept(pcm,wall,!baseline,broken);
       if(baseline&&lockWall<0){if(tone&&!broken){if(preLockLast>=0&&wall-preLockLast>60){preLockStreak=0;preLockFirst=-1;}preLockTone++;if(preLockStreak++==0)preLockFirst=wall;preLockLast=wall;}else{preLockStreak=0;preLockFirst=-1;}if(preLockStreak>=40&&preLockLast-preLockFirst>=780&&!stable){stable=true;Phase3BC.Receipt(Path.Combine(root,"stable-tone.json"),new{ok=true,preLockToneStreak=preLockStreak,preLockToneWallMs=preLockLast-preLockFirst});}}
       if(scenario=="B"&&lockWall>=0){quiet.Accept(loud,broken,wall);if(quiet.met&&quietStart<0){quietStart=quiet.started;Phase3BC.Receipt(Path.Combine(root,"quiet-after-lock.json"),new{quietStartAtMs=startUtc+quiet.started,quietFrames=quiet.frames,quietWallMs=quiet.Wall,captureBufferFrames=buffer});}if(restoreSeen)restoredQuiet.Accept(loud,broken,wall);}
      });
      bool done=scenario=="C"?clock.ElapsedMilliseconds>=10500:File.Exists(Path.Combine(root,"finish"));if(done)break;Thread.Sleep(1);
     }
     if(!current())throw new InvalidOperationException("receiver-retired");capture.Dispose();capture=null;physical=true;if(!current())throw new InvalidOperationException("scope-after-physical-close");
     if(scenario=="C"){var observed=detector.Result(true,true);Phase3BC.Receipt(result,new{scenario,physicalClosed=true,receiver=observed,normal=true,scopeStable=true,captureBufferFrames=buffer,rawAudioStored=false});exit=0;}
     else{Phase3BC.Receipt(result,new{scenario,physicalClosed=true,normal=true,scopeStable=true,baselineOk=baseline&&!detector.baselineBad,nativeLockAtMs=lockWall<0?(double?)null:startUtc+lockWall,preLockToneStreak=preLockStreak,preLockToneWallMs=preLockFirst<0?0:preLockLast-preLockFirst,quietStartAtMs=quietStart<0?(double?)null:startUtc+quietStart,quietFrames=quiet.frames,quietWallMs=quiet.Wall,postQuietToneFrames=quiet.postQuietToneFrames,afterRestoreQuietFrames=restoredQuiet.frames,afterRestoreQuietWallMs=restoredQuiet.Wall,captureBufferFrames=buffer,rawAudioStored=false});exit=0;}
    }
   }
  }catch{if(result!=null&&!File.Exists(result))try{Phase3BC.Receipt(result,new{ok=false,physicalClosed=physical,reason="bc-receiver-failed-closed",rawAudioStored=false});}catch{}}
  finally{if(capture!=null)try{capture.Dispose();}catch{}}
  return exit;
 }
}
