// Explicit fixed-service registration. No start/delete/credential/command API.
using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
internal sealed class SodaDesktopSigninInstallerScm:IDisposable {
    internal interface Calls:IDisposable {bool Absent();void CreateDisabled();void InspectDisabled();void EnableManual();void InspectManual();}
    readonly object gate=new object();Calls calls;readonly Func<bool> scope;bool ended,checking,busy,created;
    static Exception Failure(){return new InvalidOperationException("Signin service installation is unavailable");}
    internal SodaDesktopSigninInstallerScm(Calls calls,Func<bool> scope){if(calls==null||scope==null)throw Failure();this.calls=calls;this.scope=scope;}
    void Current(){if(ended||checking||calls==null){ended=true;throw Failure();}checking=true;try{if(!scope()||ended)throw Failure();}catch{ended=true;throw;}finally{checking=false;}}
    internal bool Absent(){lock(gate){Current();if(busy){ended=true;throw Failure();}busy=true;try{bool absent=calls.Absent();Current();return absent;}catch{ended=true;throw;}finally{busy=false;}}}
    internal void CreateDisabled(Func<bool> ready){lock(gate){Current();if(busy||created||ready==null){ended=true;throw Failure();}busy=true;try{
        if(!calls.Absent()||!ready())throw Failure();Current();if(!ready())throw Failure();Current();calls.CreateDisabled();created=true;Current();calls.InspectDisabled();Current();
    }catch{ended=true;throw;}finally{busy=false;}}}
    internal void EnableManual(Func<bool> committed){lock(gate){Current();if(busy||!created||committed==null){ended=true;throw Failure();}busy=true;try{
        calls.InspectDisabled();if(!committed())throw Failure();Current();if(!committed())throw Failure();Current();calls.EnableManual();Current();calls.InspectManual();Current();
    }catch{ended=true;throw;}finally{busy=false;}}}
    public void Dispose(){lock(gate){ended=true;var owned=calls;calls=null;if(owned!=null)owned.Dispose();}}
    internal static SodaDesktopSigninInstallerScm Open(string owner,Func<bool> scope){if(!SodaDesktopSigninPackageNative.Authority(true)||scope==null||!scope())throw Failure();return new SodaDesktopSigninInstallerScm(new Native(owner),()=>SodaDesktopSigninPackageNative.Authority(true)&&scope());}
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
        try{IntPtr owner,dacl;bool defaulted,present;IntPtr pointer=pinned.AddrOfPinnedObject();if(!GetSecurityDescriptorOwner(pointer,out owner,out defaulted)||!GetSecurityDescriptorDacl(pointer,out present,out dacl,out defaulted)||!present||owner==IntPtr.Zero||dacl==IntPtr.Zero||SetSecurityInfo(service,5,5,owner,IntPtr.Zero,dacl,IntPtr.Zero)!=0)throw Failure();}finally{pinned.Free();}
    }
    sealed class Native:Calls {
        readonly string owner;IntPtr manager,service;
        internal Native(string owner){this.owner=SodaDesktopSigninPackage.OwnerSid(owner);manager=OpenSCManagerW(null,null,3);if(manager==IntPtr.Zero)throw Failure();}
        public bool Absent(){IntPtr existing=OpenServiceW(manager,SodaDesktopSigninServicePolicy.Name(owner),4);if(existing!=IntPtr.Zero){CloseServiceHandle(existing);return false;}if(Marshal.GetLastWin32Error()!=1060)throw Failure();return true;}
        public void CreateDisabled(){
            if(service!=IntPtr.Zero)throw Failure();string binary="\""+SodaDesktopSigninServicePolicy.Executable(owner)+"\"";
            service=CreateServiceW(manager,SodaDesktopSigninServicePolicy.Name(owner),SodaDesktopSigninServicePolicy.Name(owner),0x000f01ff,0x10,4,1,binary,null,IntPtr.Zero,null,null,null);if(service==IntPtr.Zero)throw Failure();Secure(service);
        }
        public void InspectDisabled(){SodaDesktopSigninServicePolicy.InspectDisabled(owner);}
        public void EnableManual(){if(service==IntPtr.Zero||!ChangeServiceConfigW(service,UInt32.MaxValue,3,UInt32.MaxValue,null,null,IntPtr.Zero,null,null,null,null))throw Failure();}
        public void InspectManual(){SodaDesktopSigninServicePolicy.Inspect(owner);}
        public void Dispose(){if(service!=IntPtr.Zero){CloseServiceHandle(service);service=IntPtr.Zero;}if(manager!=IntPtr.Zero){CloseServiceHandle(manager);manager=IntPtr.Zero;}}
    }
}
