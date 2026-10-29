// Existing fixed service only. No service start/stop/register/delete operations.
using System;
using System.Runtime.InteropServices;
internal sealed class SodaDesktopSigninUpgradeScm:IDisposable {
 internal interface Calls:IDisposable{void InspectManual();void InspectDisabled();bool Stopped();void Disable();void Manual();}
 readonly Calls calls;readonly Func<bool> scope;bool disabled,ended,busy;
 static Exception Failure(){return new InvalidOperationException("Signin upgrade requires verified stopped service policy");}
 internal SodaDesktopSigninUpgradeScm(Calls calls,Func<bool> scope){this.calls=calls;this.scope=scope;}
 void Current(){if(ended||!scope()||ended){ended=true;throw Failure();}}
 internal void Inspect(bool off){Current();if(busy){ended=true;throw Failure();}busy=true;try{if(off)calls.InspectDisabled();else calls.InspectManual();if(!calls.Stopped())throw Failure();Current();}catch{ended=true;throw;}finally{busy=false;}}
 internal void Disable(Func<bool> evidence){Inspect(false);Current();if(busy||disabled)throw Failure();busy=true;try{if(!evidence())throw Failure();Current();calls.Disable();disabled=true;Current();}catch{ended=true;throw;}finally{busy=false;}Inspect(true);}
 internal void Manual(Func<bool> evidence){Inspect(true);Current();if(busy||!disabled)throw Failure();busy=true;try{if(!evidence())throw Failure();Current();calls.Manual();Current();}catch{ended=true;throw;}finally{busy=false;}Inspect(false);}
 internal void RestoreManual(Func<bool> evidence){Inspect(true);if(evidence==null||!evidence())throw Failure();disabled=true;Manual(evidence);}
 public void Dispose(){ended=true;calls.Dispose();}
 internal static SodaDesktopSigninUpgradeScm Open(string owner,Func<bool> scope){if(!SodaDesktopSigninPackageNative.Authority(true))throw Failure();return new SodaDesktopSigninUpgradeScm(new Native(owner),scope);}
 [StructLayout(LayoutKind.Sequential)]struct Status{internal uint Type,State,Accepted,Exit,Specific,Checkpoint,Hint,Pid,Flags;}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr service);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceStatusEx(IntPtr service,uint level,out Status status,uint bytes,out uint needed);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool ChangeServiceConfigW(IntPtr service,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password,string display);
 sealed class Native:Calls {
  readonly string owner;IntPtr manager,service;
  internal Native(string owner){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);try{manager=OpenSCManagerW(null,null,1);if(manager==IntPtr.Zero)throw Failure();service=OpenServiceW(manager,SodaDesktopSigninServicePolicy.Name(owner),0x20007);if(service==IntPtr.Zero)throw Failure();}catch{Dispose();throw;}}
  public void InspectManual(){SodaDesktopSigninServicePolicy.Inspect(owner);}public void InspectDisabled(){SodaDesktopSigninServicePolicy.InspectDisabled(owner);}
  public bool Stopped(){Status status;uint needed;if(!QueryServiceStatusEx(service,0,out status,36,out needed)||needed>36)return false;return status.Type==0x10&&status.State==1&&(status.Exit==0||status.Exit==1077)&&status.Specific==0&&status.Flags==0;}
  void Set(uint start){if(!ChangeServiceConfigW(service,UInt32.MaxValue,start,UInt32.MaxValue,null,null,IntPtr.Zero,null,null,null,null))throw Failure();}
  public void Disable(){Set(4);}public void Manual(){Set(3);}
  public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
 }
}
