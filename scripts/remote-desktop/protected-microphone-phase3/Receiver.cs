// Standalone, fixed virtual capture only. No default endpoint, loopback or audio file writer.
using System;
using System.IO;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using System.Collections.Generic;
public static class Phase3Native {
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
 [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool GetUserObjectInformation(IntPtr handle,int index,System.Text.StringBuilder text,int size,out int needed);
 // Same limited-query image boundary used by WindowsSigninProcessEvidence.cs. No debug privilege or elevation.
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool QueryFullProcessImageNameW(IntPtr process,uint flags,System.Text.StringBuilder text,ref uint length);
 public static string Executable(int pid){IntPtr handle=OpenProcess(0x1000,false,pid);if(handle==IntPtr.Zero)throw new InvalidOperationException("image-query-unavailable");try{uint length=32768;var text=new System.Text.StringBuilder((int)length);if(!QueryFullProcessImageNameW(handle,0,text,ref length)||length<1||length>=32768)throw new InvalidOperationException("image-query-failed");return text.ToString();}finally{CloseHandle(handle);}}
 public static SodaDesktopUserMicrophonePolicy.Facts Facts(int pid){
  using(var process=Process.GetProcessById(pid)){IntPtr handle=OpenProcess(0x1000,false,pid),token;try{if(handle==IntPtr.Zero||!OpenProcessToken(handle,8,out token))throw new InvalidOperationException("token-unavailable");}finally{if(handle!=IntPtr.Zero)CloseHandle(handle);}
   try{using(var identity=new WindowsIdentity(token))return (SodaDesktopUserMicrophonePolicy.Facts)typeof(SodaDesktopUserMicrophoneRole).GetMethod("Read",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{process,identity});}finally{CloseHandle(token);}
  }
 }
 public static bool DefaultDesktop(){IntPtr desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)return false;try{var text=new System.Text.StringBuilder(64);int needed;return GetUserObjectInformation(desktop,2,text,128,out needed)&&text.ToString()=="Default";}finally{CloseDesktop(desktop);}}
 public static string Hash(string file){using(var stream=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
 public static bool Same(SodaDesktopUserMicrophonePolicy.Facts a,SodaDesktopUserMicrophonePolicy.Facts b){return a!=null&&b!=null&&!a.System&&!b.System&&a.Owner==b.Owner&&a.Logon==b.Logon&&a.Session>0&&a.Session==b.Session&&a.ActiveSession==a.Session&&b.ActiveSession==b.Session&&a.LockState==1&&b.LockState==1;}
}
public sealed class Phase3Metrics {
 public double rms,magnitude,peak;public int clips;
 public static Phase3Metrics Read(short[] pcm,int channel){var m=new Phase3Metrics();double sin=0,cos=0,square=0;for(int n=0;n<960;n++){double v=pcm[n*2+channel],angle=2*Math.PI*997*n/48000;square+=v*v;sin+=v*Math.Sin(angle);cos+=v*Math.Cos(angle);m.peak=Math.Max(m.peak,Math.Abs(v));if(Math.Abs(v)>=32767)m.clips++;}m.rms=Math.Sqrt(square/960);m.magnitude=2*Math.Sqrt(sin*sin+cos*cos)/960;return m;}
}
public sealed class Phase3Detector {
 public int baselineFrames,toneFrames,streak,discontinuities,clips;public bool baselineBad,continuous;public double maxLeftRms,maxRightRms,maxLeftTone,maxRightTone,maxGap;
 int maxStreakFrames,nonToneResetCount,brokenResetCount,gapResetCount,baselineBrokenWindows,baselineGapWindows,toneBrokenWindows,toneGapWindows,toneNonToneWindows;
 readonly List<object> resetObservations=new List<object>();int resetObservationsOmitted,baselineSilentPackets,toneSilentPackets;
 bool captureFlagsObserved;int baselineDataFlags,baselineTimestampFlags,toneDataFlags,toneTimestampFlags;double maxStreakWallMs,firstReset=-1,lastReset=-1,firstBaselineFlag=-1,lastBaselineFlag=-1,firstTonePhaseFlag=-1,lastTonePhaseFlag=-1;
 double previous=-1,firstTone=-1,lastTone,streakStart;
 // Metadata only: called for actual capture packets, without changing flags/reset semantics.
 public void ObserveCaptureFlags(uint flags,double wall,bool baseline){captureFlagsObserved=true;if((flags&2)!=0){if(baseline)baselineSilentPackets++;else toneSilentPackets++;}if((flags&5)==0)return;if(baseline){if((flags&1)!=0)baselineDataFlags++;if((flags&4)!=0)baselineTimestampFlags++;if(firstBaselineFlag<0)firstBaselineFlag=wall;lastBaselineFlag=wall;}else{if((flags&1)!=0)toneDataFlags++;if((flags&4)!=0)toneTimestampFlags++;if(firstTonePhaseFlag<0)firstTonePhaseFlag=wall;lastTonePhaseFlag=wall;}}

 public void Accept(short[] pcm,double wall,bool baseline,bool discontinuity){
  if(pcm.Length!=1920||wall<0||Double.IsNaN(wall)||Double.IsInfinity(wall)||previous>wall)throw new InvalidDataException("capture-window");
  var left=Phase3Metrics.Read(pcm,0);var right=Phase3Metrics.Read(pcm,1);double gap=previous<0?0:wall-previous;previous=wall;maxGap=Math.Max(maxGap,gap);if(discontinuity)discontinuities++;
  if(baseline){if(discontinuity)baselineBrokenWindows++;if(gap>60)baselineGapWindows++;baselineFrames++;if(Math.Max(left.rms,right.rms)>10||Math.Max(left.magnitude,right.magnitude)>10)baselineBad=true;streak=0;return;}
  maxLeftRms=Math.Max(maxLeftRms,left.rms);maxRightRms=Math.Max(maxRightRms,right.rms);maxLeftTone=Math.Max(maxLeftTone,left.magnitude);maxRightTone=Math.Max(maxRightTone,right.magnitude);clips+=left.clips+right.clips;
  bool tone=left.rms>=4000&&left.rms<=7000&&left.magnitude>=6500&&left.magnitude<=9500&&left.clips==0;
  if(!tone)toneNonToneWindows++;if(discontinuity)toneBrokenWindows++;if(gap>60)toneGapWindows++;
  if(streak>0&&(!tone||discontinuity||gap>60)){if(resetObservations.Count<8)resetObservations.Add(new{wallMs=wall,precedingStreakFrames=streak,precedingStreakWallMs=lastTone-streakStart,leftRms=left.rms,rightRms=right.rms,left997Magnitude=left.magnitude,right997Magnitude=right.magnitude,leftClips=left.clips,rightClips=right.clips,failureMask=(left.rms<4000?1:0)|(left.rms>7000?2:0)|(left.magnitude<6500?4:0)|(left.magnitude>9500?8:0)|(left.clips!=0?16:0)|(discontinuity?32:0)|(gap>60?64:0)});else resetObservationsOmitted++;if(!tone)nonToneResetCount++;if(discontinuity)brokenResetCount++;if(gap>60)gapResetCount++;if(firstReset<0)firstReset=wall;lastReset=wall;}
  if(!tone||discontinuity||gap>60){streak=0;if(!tone)return;}
  toneFrames++;if(firstTone<0)firstTone=wall;lastTone=wall;if(streak++==0)streakStart=wall;if(streak>=280&&wall-streakStart>=5500)continuous=true;
  if(streak>maxStreakFrames||streak==maxStreakFrames&&wall-streakStart>maxStreakWallMs){maxStreakFrames=streak;maxStreakWallMs=wall-streakStart;}
 }
 public object Result(bool clean,bool scope){double span=firstTone<0?0:lastTone-firstTone;return new{ok=clean&&scope&&baselineFrames>=90&&!baselineBad&&toneFrames>=290&&span>=5700&&continuous&&clips==0,baselineFrames,baselineBad,toneFrames,toneWallSpanMs=span,continuousThresholdMet=continuous,maximumReadGapMs=maxGap,captureDiscontinuities=discontinuities,maxLeftRms,maxRightRms,maxLeft997Magnitude=maxLeftTone,maxRight997Magnitude=maxRightTone,clipCount=clips,continuity=new{maxStreakFrames,maxStreakWallMs,nonToneResetCount,brokenResetCount,gapResetCount,baselineBrokenWindows,baselineGapWindows,toneBrokenWindows,toneGapWindows,toneNonToneWindows,firstToneAtMs=firstTone<0?(double?)null:firstTone,lastToneAtMs=firstTone<0?(double?)null:lastTone,firstResetAtMs=firstReset<0?(double?)null:firstReset,lastResetAtMs=lastReset<0?(double?)null:lastReset,captureFlagsObserved,baselineSilentPackets=captureFlagsObserved?(int?)baselineSilentPackets:null,toneSilentPackets=captureFlagsObserved?(int?)toneSilentPackets:null,resetObservations=resetObservations.ToArray(),resetObservationsOmitted,baselineDataFlags=captureFlagsObserved?(int?)baselineDataFlags:null,baselineTimestampFlags=captureFlagsObserved?(int?)baselineTimestampFlags:null,toneDataFlags=captureFlagsObserved?(int?)toneDataFlags:null,toneTimestampFlags=captureFlagsObserved?(int?)toneTimestampFlags:null,firstBaselineFlagAtMs=firstBaselineFlag<0?(double?)null:firstBaselineFlag,lastBaselineFlagAtMs=lastBaselineFlag<0?(double?)null:lastBaselineFlag,firstTonePhaseFlagAtMs=firstTonePhaseFlag<0?(double?)null:firstTonePhaseFlag,lastTonePhaseFlagAtMs=lastTonePhaseFlag<0?(double?)null:lastTonePhaseFlag},rawAudioStored=false,scopeConfirmed=scope,physicalClosed=clean};}
}
public sealed class Phase3Capture : IDisposable {
 [StructLayout(LayoutKind.Sequential,Pack=2)]struct Format{public ushort tag,channels;public uint rate,average;public ushort alignment,bits,extra;}
 [DllImport("ole32.dll")]static extern int CoInitializeEx(IntPtr reserved,uint flags);
 [DllImport("ole32.dll")]static extern void CoUninitialize();
 [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetDevice(IntPtr self,[MarshalAs(UnmanagedType.LPWStr)]string id,out IntPtr device);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Activate(IntPtr self,ref Guid iid,uint context,IntPtr args,out IntPtr result);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Initialize(IntPtr self,int mode,uint flags,long duration,long period,ref Format format,IntPtr session);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Service(IntPtr self,ref Guid iid,out IntPtr result);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Action(IntPtr self);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Packet(IntPtr self,out uint frames);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetBuffer(IntPtr self,out IntPtr data,out uint frames,out uint flags,out ulong device,out ulong qpc);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int ReleaseBuffer(IntPtr self,uint frames);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Flow(IntPtr self,out int flow);
 public static T Method<T>(IntPtr target,int slot)where T:class{return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(target),slot*IntPtr.Size),typeof(T))as T;}
 public static void Check(int hr){if(hr<0)Marshal.ThrowExceptionForHR(hr);}
 public static void Release(ref IntPtr p){if(p!=IntPtr.Zero){Marshal.Release(p);p=IntPtr.Zero;}}
 internal System.Action<uint> ObservePacketFlags;
 IntPtr client,capture;bool initialized,started,disposed;int used;readonly short[] window=new short[1920];readonly byte[] raw=new byte[192000];bool discontinuity;
 public Phase3Capture(string endpoint){
  if(IntPtr.Size!=8||String.IsNullOrWhiteSpace(endpoint)||endpoint.Length>512)throw new InvalidOperationException("fixed-capture-required");IntPtr en=IntPtr.Zero,device=IntPtr.Zero,flow=IntPtr.Zero;
  try{Check(CoInitializeEx(IntPtr.Zero,0));initialized=true;Guid clsid=new Guid("bcde0395-e52f-467c-8e3d-c4579291692e"),iid=new Guid("a95664d2-9614-4f35-a746-de8db63617e6");Check(CoCreateInstance(ref clsid,IntPtr.Zero,23,ref iid,out en));Check(Method<GetDevice>(en,5)(en,endpoint,out device));
   iid=new Guid("1be09788-6894-4089-8586-9a2a6c265ac5");Check(Marshal.QueryInterface(device,ref iid,out flow));int direction;Check(Method<Flow>(flow,3)(flow,out direction));if(direction!=1)throw new InvalidOperationException("capture-flow-required");
   iid=new Guid("1cb9ad4c-dbfa-4c32-b178-c2f568a703b2");Check(Method<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out client));var format=new Format{tag=1,channels=2,rate=48000,average=192000,alignment=4,bits=16};
   // Shared capture, PCM conversion allowed, never loopback (0x20000 is absent).
   Check(Method<Initialize>(client,3)(client,0,0x88000000u,1000000,0,ref format,IntPtr.Zero));iid=new Guid("c8adbd64-e71e-48a0-a4de-185c395cd317");Check(Method<Service>(client,14)(client,ref iid,out capture));Check(Method<Action>(client,10)(client));started=true;
  }catch{Dispose();throw;}finally{Release(ref flow);Release(ref device);Release(ref en);}
 }
 public void Drain(System.Action<short[],bool> receive){
  uint available;int packets=0;while(true){if(++packets>64)throw new InvalidDataException("capture-packet-budget");Check(Method<Packet>(capture,5)(capture,out available));if(available==0)return;IntPtr data;uint frames,flags;ulong position,qpc;Check(Method<GetBuffer>(capture,3)(capture,out data,out frames,out flags,out position,out qpc));
   try{if(frames<1||frames>48000)throw new InvalidDataException("capture-size");int length=checked((int)frames*4);if(ObservePacketFlags!=null)ObservePacketFlags(flags);if((flags&5)!=0){used=0;discontinuity=true;}if((flags&2)!=0)Array.Clear(raw,0,length);else{if(data==IntPtr.Zero)throw new InvalidDataException("capture-pointer");Marshal.Copy(data,raw,0,length);}
    for(int offset=0;offset<length;offset+=4){window[used++]=(short)(raw[offset]|raw[offset+1]<<8);window[used++]=(short)(raw[offset+2]|raw[offset+3]<<8);if(used==1920){receive(window,discontinuity);Array.Clear(window,0,window.Length);used=0;discontinuity=false;}}
   }finally{Check(Method<ReleaseBuffer>(capture,4)(capture,frames));Array.Clear(raw,0,raw.Length);}
  }
 }
 public void Dispose(){if(disposed)return;disposed=true;try{if(started)Check(Method<Action>(client,11)(client));}finally{Release(ref capture);Release(ref client);Array.Clear(raw,0,raw.Length);Array.Clear(window,0,window.Length);if(initialized)CoUninitialize();}}
}
public static class Phase3Receiver {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=32768};
 static void Receipt(string path,object value){using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){var bytes=System.Text.Encoding.UTF8.GetBytes(Json.Serialize(value));file.Write(bytes,0,bytes.Length);file.Flush(true);}}
 [MTAThread]public static int Main(string[] args){
  // A manifest/owned stop file is the only entry. No endpoint/PIN/auth on commandline.
  if(args.Length!=1)return 2;Phase3Capture capture=null;var detector=new Phase3Detector();bool clean=false,scope=false;string result=null;
  try{
   var manifest=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));string root=Path.GetDirectoryName(Path.GetFullPath(args[0]));result=Path.Combine(root,"receiver-result.json");
   if(!Object.Equals(manifest["scenario"],"A")||!Object.Equals(manifest["approved"],true))throw new InvalidDataException("not-approved");
   int parent=Convert.ToInt32(manifest["controllerPid"]);long ticks=Int64.Parse((string)manifest["controllerStartedTicks"]);string expected=(string)manifest["controllerExeSha256"];DateTime expires=DateTime.Parse((string)manifest["expiresAt"],null,System.Globalization.DateTimeStyles.RoundtripKind).ToUniversalTime();
   using(var process=Process.GetProcessById(parent)){
    if(Phase3Native.Hash(Phase3Native.Executable(process.Id))!=expected||(expires-DateTime.UtcNow).TotalSeconds>240)throw new InvalidDataException("owner-binary-or-ttl");
    Func<bool> current=delegate{try{process.Refresh();var me=Phase3Native.Facts(Process.GetCurrentProcess().Id);var owner=Phase3Native.Facts(parent);return DateTime.UtcNow<expires&&!process.HasExited&&process.StartTime.ToUniversalTime().Ticks==ticks&&Phase3Native.Same(me,owner)&&me.Elevated&&!owner.Elevated&&Phase3Native.DefaultDesktop();}catch{return false;}};
    if(!current()||Phase3Native.Hash(Phase3Native.Executable(Process.GetCurrentProcess().Id))!=(string)manifest["receiverExeSha256"])throw new InvalidOperationException("scope-denied");
    var initialCapture=Phase3Endpoint.Read((string)manifest["captureEndpoint"],1);var initialRender=Phase3Endpoint.Read((string)manifest["renderEndpoint"],0);if(!Phase3Endpoint.Available(initialCapture)||!Phase3Endpoint.Available(initialRender))throw new InvalidOperationException("endpoint-in-use-before-arming");
    Receipt(Path.Combine(root,"receiver-armed.json"),new{pid=Process.GetCurrentProcess().Id,startedTicks=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString(),exeSha256=Phase3Native.Hash(Phase3Native.Executable(Process.GetCurrentProcess().Id)),elevated=true,sameScope=true,rawAudioStored=false});
    var clock=Stopwatch.StartNew();while(!File.Exists(Path.Combine(root,"receiver-go"))){if(clock.ElapsedMilliseconds>180000||!current()||File.Exists(Path.Combine(root,"stop")))throw new InvalidOperationException("receiver-armed-retired");Thread.Sleep(20);}
    var go=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"receiver-go")));var actor=Process.GetProcessById(Convert.ToInt32(go["actorPid"]));long actorTicks=Int64.Parse((string)go["actorStartedTicks"]);string actorHash=(string)go["actorExeSha256"];
    var activeRender=Phase3Endpoint.Read((string)manifest["renderEndpoint"],0);if(!current()||!Phase3Endpoint.Available(Phase3Endpoint.Read((string)manifest["captureEndpoint"],1))||!activeRender.active||!activeRender.notDefault||!activeRender.unmuted||!activeRender.virtualCable||activeRender.volume!=initialRender.volume||activeRender.activeSessions!=1||actor.StartTime.ToUniversalTime().Ticks!=actorTicks||Phase3Native.Hash(Phase3Native.Executable(actor.Id))!=actorHash||!Phase3Native.Same(Phase3Native.Facts(actor.Id),Phase3Native.Facts(parent))||Phase3Native.Facts(actor.Id).Elevated)throw new InvalidOperationException("scope-or-owned-actor-retired");capture=new Phase3Capture((string)manifest["captureEndpoint"]);clock.Restart();bool baseline=false;capture.ObservePacketFlags=delegate(uint flags){detector.ObserveCaptureFlags(flags,clock.Elapsed.TotalMilliseconds,!baseline);};
    while(clock.ElapsedMilliseconds<10500&&!File.Exists(Path.Combine(root,"stop"))){
     actor.Refresh();if(!current()||actor.HasExited||actor.StartTime.ToUniversalTime().Ticks!=actorTicks)throw new InvalidOperationException("scope-retired");double wall=clock.Elapsed.TotalMilliseconds;
     if(!baseline&&wall>=2000){if(detector.baselineBad||detector.baselineFrames<90)throw new InvalidOperationException("baseline-not-silent");Receipt(Path.Combine(root,"baseline-ready.json"),new{ok=true,baselineFrames=detector.baselineFrames});baseline=true;}
     capture.Drain(delegate(short[] pcm,bool broken){detector.Accept(pcm,clock.Elapsed.TotalMilliseconds,!baseline,broken);});Thread.Sleep(1);
    }
    scope=current()&&Phase3Native.Hash(Phase3Native.Executable(process.Id))==expected&&Phase3Native.Hash(Phase3Native.Executable(actor.Id))==actorHash;actor.Dispose();capture.Dispose();capture=null;clean=true;Receipt(result,detector.Result(clean,scope));return clean&&scope&&Convert.ToBoolean(Json.Deserialize<Dictionary<string,object>>(Json.Serialize(detector.Result(clean,scope)))["ok"])?0:2;
   }
  }catch{if(result!=null&&!File.Exists(result))try{Receipt(result,new{ok=false,reason="receiver-failed-closed",rawAudioStored=false,physicalClosed=false});}catch{}return 2;}
  finally{if(capture!=null)try{capture.Dispose();}catch{}}
 }
}
