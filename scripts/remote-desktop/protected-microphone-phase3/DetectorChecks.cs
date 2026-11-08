// Generated PCM only. Does not instantiate Phase3Capture, native probes or COM objects.
using System;
public static class Phase3GeneratedChecks {
 static void Require(bool value,string label){if(!value)throw new InvalidOperationException(label);}
 static short[] Tone(int frame){var pcm=new short[1920];for(int n=0;n<960;n++){short value=(short)Math.Round(8000*Math.Sin(2*Math.PI*997*(frame*960+n)/48000));pcm[n*2]=value;pcm[n*2+1]=value;}return pcm;}
 static Phase3Detector Baseline(){var result=new Phase3Detector();for(int n=0;n<100;n++)result.Accept(new short[1920],n*20,true,false);return result;}
 static bool Ok(Phase3Detector d){var json=new System.Web.Script.Serialization.JavaScriptSerializer();return (bool)json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(json.Serialize(d.Result(true,true)))["ok"];}
 public static int Main(){try{
  var valid=Baseline();for(int n=0;n<300;n++){var pcm=Tone(n);var m=Phase3Metrics.Read(pcm,0);Require(m.rms>5600&&m.rms<5700&&m.magnitude>7900&&m.magnitude<8100&&m.clips==0,"generated-spectrum");valid.Accept(pcm,2000+n*20,false,false);Array.Clear(pcm,0,pcm.Length);}Require(Ok(valid),"generated-valid");
  foreach(string scenario in new[]{"fast","gap","discontinuity","baseline","silence"}){var d=Baseline();if(scenario=="baseline")d.baselineBad=true;for(int n=0;n<300;n++){var pcm=scenario=="silence"?new short[1920]:Tone(n);d.Accept(pcm,2000+n*(scenario=="fast"?1:20)+(scenario=="gap"&&n>=150?100:0),false,scenario=="discontinuity"&&n==150);}Require(!Ok(d),"generated-reject-"+scenario);}
  var split=Baseline();for(int n=0;n<280;n++)split.Accept(Tone(n),2000+n*10,false,false);split.Accept(new short[1920],5000,false,false);for(int n=0;n<100;n++)split.Accept(Tone(n),6000+n*59,false,false);Require(!Ok(split)&&!split.continuous,"same-streak-required");
  Console.WriteLine("{\"ok\":true,\"generatedOnly\":true,\"endpointOpened\":false,\"nativeProbe\":false,\"rawAudioStored\":false}");return 0;
 }catch{Console.WriteLine("{\"ok\":false,\"generatedOnly\":true}");return 2;}}
}
