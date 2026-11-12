// Standard registration of the fixed local service. No start or data mutation.
using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
internal sealed class SodaDesktopSigninInstallerScm:IDisposable {
    readonly string owner;readonly Func<bool> current;IntPtr manager,service;
    static void Require(bool value){if(!value)throw new InvalidOperationException("Signin service installation is unavailable");}
    SodaDesktopSigninInstallerScm(string owner,Func<bool> current){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);this.current=current;manager=OpenSCManagerW(null,null,3);Require(manager!=IntPtr.Zero);}
    internal static SodaDesktopSigninInstallerScm Open(string owner,Func<bool> current){Require(SodaDesktopSigninPackageNative.Authority(true)&&current!=null&&current());return new SodaDesktopSigninInstallerScm(owner,current);}
    internal bool Absent(){return Absent(SodaDesktopSigninServicePolicy.Name(owner));}
    internal bool LegacyAbsent(){return Absent(SodaDesktopSigninServicePolicy.LegacyName(owner));}
    bool Absent(string name){Require(current());IntPtr existing=OpenServiceW(manager,name,4);if(existing!=IntPtr.Zero){CloseServiceHandle(existing);return false;}Require(Marshal.GetLastWin32Error()==1060);return true;}
    internal void CreateDisabled(Func<bool> ready){
        Require(current()&&ready()&&Absent()&&service==IntPtr.Zero);
        string name=SodaDesktopSigninServicePolicy.Name(owner),binary="\""+SodaDesktopSigninServicePolicy.Executable(owner)+"\"";
        service=CreateServiceW(manager,name,name,0x000f01ff,0x10,4,1,binary,null,IntPtr.Zero,null,null,null);Require(service!=IntPtr.Zero);Secure(service);SodaDesktopSigninServicePolicy.InspectDisabled(owner);
    }
    internal void Enable(uint startupType,Func<bool> ready){
        Require((startupType==2||startupType==3)&&service!=IntPtr.Zero&&current()&&ready());SodaDesktopSigninServicePolicy.InspectDisabled(owner);
        Require(ChangeServiceConfigW(service,UInt32.MaxValue,startupType,UInt32.MaxValue,null,null,IntPtr.Zero,null,null,null,null));SodaDesktopSigninServicePolicy.Inspect(owner);Require(SodaDesktopSigninServicePolicy.StartupType(owner,false)==startupType);
    }
    public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern IntPtr CreateServiceW(IntPtr manager,string name,string display,uint access,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool ChangeServiceConfigW(IntPtr service,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password,string display);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr value);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",ExactSpelling=true)]static extern uint SetSecurityInfo(IntPtr handle,int type,uint information,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool GetSecurityDescriptorOwner(IntPtr descriptor,out IntPtr owner,out bool defaulted);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool GetSecurityDescriptorDacl(IntPtr descriptor,out bool present,out IntPtr dacl,out bool defaulted);
    static void Secure(IntPtr service){
        var descriptor=new RawSecurityDescriptor("O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)");byte[] bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
        try{IntPtr owner,dacl;bool defaulted,present;IntPtr pointer=pinned.AddrOfPinnedObject();Require(GetSecurityDescriptorOwner(pointer,out owner,out defaulted)&&GetSecurityDescriptorDacl(pointer,out present,out dacl,out defaulted)&&present&&owner!=IntPtr.Zero&&dacl!=IntPtr.Zero&&SetSecurityInfo(service,2,5,owner,IntPtr.Zero,dacl,IntPtr.Zero)==0&&SodaDesktopSigninServicePolicy.Acl(SodaDesktopSigninServicePolicy.Security(service)));}finally{pinned.Free();}
    }
}
