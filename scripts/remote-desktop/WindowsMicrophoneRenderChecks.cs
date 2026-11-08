// Pure render-plan/staging checks. No Wasapi/COM/pipe/token/endpoint instance.
using System;using System.Reflection;using System.IO;
public static class SodaMicrophoneRenderChecks {
 static void Require(bool ok){if(!ok)throw new InvalidOperationException("generated-render-check");}
 static MethodInfo Method(string name){var method=typeof(SodaDesktopMicrophone).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Static);Require(method!=null);return method;}
 static uint Frames(uint padding,uint capacity){return (uint)Method("RenderFrameCount").Invoke(null,new object[]{padding,capacity});}
 static int Stage(byte[] pcm,byte[] scratch,uint frames){return (int)Method("StageRender").Invoke(null,new object[]{pcm,scratch,frames});}
 public static int Main(){try{
  Require(Frames(0,2880)==1920&&Frames(0,1920)==1920&&Frames(0,1440)==1440&&Frames(0,960)==960&&Frames(1,2880)==960&&Frames(960,2880)==960);
  foreach(uint capacity in new uint[]{960,1000,1440,1920,2880,48000})for(uint padding=0;padding<=960;padding++){if(capacity-padding<960)continue;uint frames=Frames(padding,capacity);Require(frames>=960&&frames<=1920&&padding+frames<=1920&&padding+frames<=capacity);}
  foreach(uint[] invalid in new[]{new uint[]{0,959},new uint[]{0,48001},new uint[]{961,2880},new uint[]{481,1440}}){bool rejected=false;try{Frames(invalid[0],invalid[1]);}catch(TargetInvocationException e){rejected=e.InnerException is InvalidDataException;}Require(rejected);}
  var pcm=new byte[1920];for(int n=0;n<pcm.Length;n++)pcm[n]=(byte)(n%251+1);var scratch=new byte[3840];for(int n=0;n<scratch.Length;n++)scratch[n]=255;
  Require(Stage(pcm,scratch,1920)==3840);for(int n=0;n<1920;n++)Require(scratch[n]==0&&scratch[n+1920]==pcm[n]);
  Require(Stage(pcm,scratch,960)==1920);for(int n=0;n<1920;n++)Require(scratch[n]==pcm[n]&&scratch[n+1920]==0);
  bool bad=false;try{Stage(new byte[1],scratch,1920);}catch(TargetInvocationException e){bad=e.InnerException is InvalidDataException;}Require(bad);foreach(byte b in scratch)Require(b==0);Array.Clear(pcm,0,pcm.Length);Array.Clear(scratch,0,scratch.Length);
  Console.WriteLine("{\"ok\":true,\"generatedOnly\":true,\"endpointOpened\":false,\"nativeProbe\":false,\"rawAudioStored\":false}");return 0;
 }catch{Console.WriteLine("{\"ok\":false,\"generatedOnly\":true}");return 2;}}
}
