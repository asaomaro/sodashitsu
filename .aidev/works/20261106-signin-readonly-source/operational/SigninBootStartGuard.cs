using System;using System.Diagnostics;using System.Globalization;using System.IO;using System.Runtime.InteropServices;using Microsoft.Win32.SafeHandles;
public sealed class SodaSigninBootStartGuard:IDisposable {
 const string Prior="1272:134384635154411000";
 readonly Stopwatch clock=Stopwatch.StartNew();SafeProcessHandle handle;SodaDesktopSigninProcessEvidence.Pin pin;readonly string identity;
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern SafeProcessHandle OpenProcess(uint access,bool inherit,uint pid);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool IsProcessCritical(SafeProcessHandle process,out bool critical);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(SafeProcessHandle process,out ulong created,out ulong exited,out ulong kernel,out ulong user);
 static void Need(bool value){if(!value)throw new InvalidOperationException("Verified new critical SCM required");}
 bool Actor(){return clock.ElapsedMilliseconds<180000&&SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0&&Environment.Is64BitProcess&&Environment.MachineName=="OSK2-024680-2";}
 public SodaSigninBootStartGuard(){try{
  Need(Actor());var processes=Process.GetProcessesByName("services");try{Need(processes.Length==1);uint pid=checked((uint)processes[0].Id);handle=OpenProcess(0x00101000,false,pid);Need(handle!=null&&!handle.IsInvalid);ulong created,exited,kernel,user;Need(GetProcessTimes(handle,out created,out exited,out kernel,out user)&&created>0);
   pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created.ToString(CultureInfo.InvariantCulture),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"services.exe"),true,Actor);
   identity=pid.ToString(CultureInfo.InvariantCulture)+":"+created.ToString(CultureInfo.InvariantCulture);Need(identity!=Prior&&Current());
  }finally{foreach(var p in processes)p.Dispose();}
 }catch{Dispose();throw;}}
 public bool Current(){bool critical;return Actor()&&pin!=null&&pin.Current()&&IsProcessCritical(handle,out critical)&&critical&&pin.Current();}
 public string Instance{get{Need(Current());return identity;}}
 public void Dispose(){if(pin!=null){pin.Dispose();pin=null;}if(handle!=null){handle.Dispose();handle=null;}}
}
