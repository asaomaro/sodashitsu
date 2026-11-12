// Standard stopped-service configuration and explicit old-name deletion only.
using System;
using System.Runtime.InteropServices;
internal sealed class SodaDesktopSigninUpgradeScm:IDisposable {
    readonly string owner;readonly bool legacy;readonly Func<bool> current;IntPtr manager,service;
    static void Require(bool value){if(!value)throw new InvalidOperationException("Signin update requires a stopped verified service");}
    SodaDesktopSigninUpgradeScm(string owner,Func<bool> current,bool legacy){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);this.current=current;this.legacy=legacy;try{manager=OpenSCManagerW(null,null,1);Require(manager!=IntPtr.Zero);service=OpenServiceW(manager,legacy?SodaDesktopSigninServicePolicy.LegacyName(owner):SodaDesktopSigninServicePolicy.Name(owner),0x30007);Require(service!=IntPtr.Zero);}catch{Dispose();throw;}}
    internal static SodaDesktopSigninUpgradeScm Open(string owner,Func<bool> current,bool legacy=false){Require(SodaDesktopSigninPackageNative.Authority(true)&&current!=null&&current());return new SodaDesktopSigninUpgradeScm(owner,current,legacy);}
    internal uint StartupType{get{return SodaDesktopSigninServicePolicy.StartupType(owner,legacy);}}
    internal void Inspect(bool disabled){Require(current());if(legacy)SodaDesktopSigninServicePolicy.InspectLegacy(owner,disabled);else if(disabled)SodaDesktopSigninServicePolicy.InspectDisabled(owner);else SodaDesktopSigninServicePolicy.Inspect(owner);Status status;uint needed;Require(QueryServiceStatusEx(service,0,out status,36,out needed)&&needed<=36&&status.Type==0x10&&status.State==1&&status.Flags==0);}
    void Set(uint start){Require(current()&&ChangeServiceConfigW(service,UInt32.MaxValue,start,UInt32.MaxValue,null,null,IntPtr.Zero,null,null,null,null));}
    internal void Disable(Func<bool> ready){Inspect(false);Require(ready());Set(4);Inspect(true);}
    internal void Enable(uint startupType,Func<bool> ready){Require(startupType==2||startupType==3);Inspect(true);Require(ready());Set(startupType);Inspect(false);Require(StartupType==startupType);}
    internal void DeleteLegacy(){Require(legacy);Inspect(true);Require(DeleteService(service));}
    public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
    internal static bool LegacyExists(string owner){IntPtr manager=IntPtr.Zero,service=IntPtr.Zero;try{manager=OpenSCManagerW(null,null,1);Require(manager!=IntPtr.Zero);service=OpenServiceW(manager,SodaDesktopSigninServicePolicy.LegacyName(owner),4);if(service!=IntPtr.Zero)return true;Require(Marshal.GetLastWin32Error()==1060);return false;}finally{if(service!=IntPtr.Zero)CloseServiceHandle(service);if(manager!=IntPtr.Zero)CloseServiceHandle(manager);}}
    [StructLayout(LayoutKind.Sequential)]struct Status{internal uint Type,State,Accepted,Exit,Specific,Checkpoint,Hint,Pid,Flags;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr service);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceStatusEx(IntPtr service,uint level,out Status status,uint bytes,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool ChangeServiceConfigW(IntPtr service,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password,string display);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool DeleteService(IntPtr service);
}
