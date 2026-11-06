// One-shot readonly Winlogon facts. No capture, input, desktop switch, credentials,
// package/run changes or network. Run only as SYSTEM in the current console.
using System;using System.IO;using System.Diagnostics;using System.Runtime.InteropServices;
using System.Security.Principal;using System.Collections.Generic;using System.Web.Script.Serialization;
public static class SigninConsoleFacts {
 [DllImport("user32.dll")]static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll")]static extern IntPtr GetThreadDesktop(uint thread);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern IntPtr OpenWindowStationW(string name,bool inherit,uint access);
 [DllImport("user32.dll")]static extern bool SetProcessWindowStation(IntPtr station);
 [DllImport("user32.dll")]static extern bool CloseWindowStation(IntPtr station);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern IntPtr OpenDesktopW(string name,uint flags,bool inherit,uint access);
 [DllImport("user32.dll")]static extern bool SetThreadDesktop(IntPtr desktop);
 [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool LookupPrivilegeValueW(string system,string name,out long luid);
 [StructLayout(LayoutKind.Sequential)]struct Privilege{internal uint Count,Low;internal int High;internal uint Attributes;}
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref Privilege privilege,uint size,IntPtr prior,IntPtr actual);
 static void Need(bool value){if(!value)throw new InvalidOperationException("Readonly console facts unavailable");}
 public static int Main(string[] args){
  var result=new Dictionary<string,object>();IntPtr station=IntPtr.Zero,desktop=IntPtr.Zero,oldStation=IntPtr.Zero,oldDesktop=IntPtr.Zero;
  try{
   Need(args.Length==1&&args[0]=="--readonly-facts");
   Need(Environment.MachineName=="OSK2-024680-2"&&Environment.Is64BitProcess);
   using(var identity=WindowsIdentity.GetCurrent())using(var self=Process.GetCurrentProcess()){
    Need(identity.IsSystem&&identity.ImpersonationLevel==TokenImpersonationLevel.None&&self.SessionId>0);
    var host=new SodaDesktopSigninCandidateNative();Need(host.ConsoleSession()==(uint)self.SessionId);
    long luid;Need(LookupPrivilegeValueW(null,"SeTcbPrivilege",out luid));
    var privilege=new Privilege{Count=1,Low=(uint)luid,High=(int)(luid>>32),Attributes=2};
    IntPtr ownToken=IntPtr.Zero;try{Need(OpenProcessToken(self.Handle,0x28,out ownToken));Need(AdjustTokenPrivileges(ownToken,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0);}finally{if(ownToken!=IntPtr.Zero)CloseHandle(ownToken);}
    oldStation=GetProcessWindowStation();oldDesktop=GetThreadDesktop(GetCurrentThreadId());Need(oldStation!=IntPtr.Zero&&oldDesktop!=IntPtr.Zero);
    station=OpenWindowStationW("WinSta0",false,0x23);Need(station!=IntPtr.Zero&&SetProcessWindowStation(station));
    desktop=OpenDesktopW("Winlogon",0,false,0x4b);Need(desktop!=IntPtr.Zero&&SetThreadDesktop(desktop));
    int state;result["session"]=self.SessionId;result["systemTcb"]=host.SystemWithTcb;result["stateAvailable"]=host.SessionState((uint)self.SessionId,out state);result["state"]=state;result["emptyUser"]=host.EmptyUserName((uint)self.SessionId);
    IntPtr token=IntPtr.Zero;int error;try{result["tokenAvailable"]=host.QueryToken((uint)self.SessionId,out token,out error);result["tokenError"]=error;}finally{if(token!=IntPtr.Zero&&token!=new IntPtr(-1))host.CloseToken(token);}
    string ws,input,thread;result["desktopNamesAvailable"]=host.DesktopNames(out ws,out input,out thread);result["stationIsInteractive"]=ws=="WinSta0";result["inputIsSignin"]=input=="Winlogon";result["threadIsSignin"]=thread=="Winlogon";
    var cost=Stopwatch.StartNew();SodaDesktopSigninCandidate.Candidate candidate;result["candidate"]=SodaDesktopSigninCandidate.Read(host,(uint)self.SessionId,out candidate);result["candidateMs"]=cost.ElapsedMilliseconds;
    cost.Restart();try{SodaDesktopSigninScopeNative.VerifyPrivateMarker();result["observerMarkers"]=true;}catch{result["observerMarkers"]=false;}result["observerMarkersMs"]=cost.ElapsedMilliseconds;
    cost.Restart();try{typeof(SodaDesktopSigninWorker).GetMethod("Target",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic).Invoke(null,null);result["targetReadable"]=true;}catch{result["targetReadable"]=false;}result["targetMs"]=cost.ElapsedMilliseconds;
   }
  }catch(Exception error){result["errorKind"]=error.GetBaseException().GetType().Name;}
  finally{
   bool restored=true;if(oldDesktop!=IntPtr.Zero)restored=SetThreadDesktop(oldDesktop)&&restored;if(oldStation!=IntPtr.Zero)restored=SetProcessWindowStation(oldStation)&&restored;
   if(desktop!=IntPtr.Zero)restored=CloseDesktop(desktop)&&restored;if(station!=IntPtr.Zero)restored=CloseWindowStation(station)&&restored;result["handlesRestored"]=restored;
  }
  File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"facts.json"),new JavaScriptSerializer().Serialize(result));return result.ContainsKey("errorKind")||!(bool)result["handlesRestored"]?1:0;
 }
}
