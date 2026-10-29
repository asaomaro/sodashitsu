// Read-only retained process evidence. No launch, service control, termination,
// privilege adjustment, or post-exit lookup by PID. A pin is not a write permit.
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static class SodaDesktopSigninProcessEvidence {
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern SafeProcessHandle OpenProcess(uint access,bool inherit,uint pid);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint GetProcessId(SafeProcessHandle process);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(SafeProcessHandle process,out ulong created,out ulong exited,out ulong kernel,out ulong user);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool QueryFullProcessImageNameW(SafeProcessHandle process,uint flags,StringBuilder text,ref uint length);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(SafeProcessHandle process,uint timeout);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(SafeProcessHandle process,out uint code);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(SafeProcessHandle process,uint access,out IntPtr token);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,out uint value,uint bytes,out uint needed);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    static Exception Failure(){return new InvalidOperationException("Signin process evidence is unavailable");}
    internal sealed class Identity {
        internal readonly uint Pid;internal readonly string Created;
        internal Identity(uint pid,string created){if(pid==0||String.IsNullOrEmpty(created))throw Failure();Pid=pid;Created=created;}
    }
    static string Creation(SafeProcessHandle handle){ulong created,exited,kernel,user;if(!GetProcessTimes(handle,out created,out exited,out kernel,out user)||created==0)throw Failure();return created.ToString(CultureInfo.InvariantCulture);}
    static bool Image(SafeProcessHandle handle,string expected){uint count=32768;var text=new StringBuilder((int)count);return QueryFullProcessImageNameW(handle,0,text,ref count)&&count>0&&count<32768&&String.Equals(text.ToString(),expected,StringComparison.OrdinalIgnoreCase);}
    static bool SystemSessionZero(SafeProcessHandle handle){
        IntPtr token=IntPtr.Zero;try{if(!OpenProcessToken(handle,8,out token))return false;uint session,type,needed;
            if(!GetTokenInformation(token,12,out session,4,out needed)||needed!=4||session!=0||!GetTokenInformation(token,8,out type,4,out needed)||needed!=4||type!=1)return false;
            using(var identity=new WindowsIdentity(token))return identity.IsSystem&&identity.User!=null&&identity.User.Value=="S-1-5-18";
        }finally{if(token!=IntPtr.Zero)CloseHandle(token);}
    }
    internal sealed class Pin:IDisposable {
        readonly object gate=new object();SafeProcessHandle handle;readonly string image;readonly bool system;readonly Func<bool> scope;bool ended,checking;
        internal readonly Identity Process;
        internal Pin(SafeProcessHandle handle,Identity process,string image,bool system,Func<bool> scope){this.handle=handle;Process=process;this.image=image;this.system=system;this.scope=scope;}
        bool Scope(){if(ended||checking||handle==null||handle.IsClosed||handle.IsInvalid){ended=true;return false;}checking=true;try{if(scope==null||!scope()||ended){ended=true;return false;}return true;}catch{ended=true;return false;}finally{checking=false;}}
        internal bool Current(){lock(gate){
            try{if(!Scope())return false;uint state=WaitForSingleObject(handle,0);if(state==0)return false;if(state!=258||GetProcessId(handle)!=Process.Pid||Creation(handle)!=Process.Created||!Image(handle,image)||system&&!SystemSessionZero(handle)||!Scope()){ended=true;return false;}return true;}catch{ended=true;return false;}
        }}
        // This method intentionally does not call Current (which requires a live
        // process), and never opens a new handle using the stored PID.
        internal bool Exited(out uint code){return ExitCore(out code,false);}
        internal bool CleanExit(){uint code;return ExitCore(out code,true);}
        bool ExitCore(out uint code,bool clean){lock(gate){code=0;
            try{if(!Scope()||WaitForSingleObject(handle,0)!=0||!GetExitCodeProcess(handle,out code)||clean&&code!=0||GetProcessId(handle)!=Process.Pid||Creation(handle)!=Process.Created||!Scope())return false;return true;}catch{ended=true;return false;}
        }}
        public void Dispose(){lock(gate){ended=true;if(handle!=null){handle.Dispose();handle=null;}}}
    }
    // Generated tests may pin their own ordinary process using this internal
    // seam. The installed path below always requires primary SYSTEM/session0.
    internal static Pin OpenCore(uint pid,string created,string image,bool system,Func<bool> scope){
        if(pid==0||String.IsNullOrEmpty(created)||String.IsNullOrEmpty(image)||!System.IO.Path.IsPathRooted(image)||scope==null||!scope())throw Failure();
        SafeProcessHandle handle=OpenProcess(0x00101000,false,pid);Pin result=null;
        try{if(handle==null||handle.IsInvalid)throw Failure();result=new Pin(handle,new Identity(pid,created),image,system,scope);if(!result.Current())throw Failure();return result;}
        catch{if(result!=null)result.Dispose();else if(handle!=null)handle.Dispose();throw;}
    }
    internal static Pin Open(string owner,SodaDesktopSigninRunRecord started,Func<bool> scope){
        if(started==null||started.Kind!="started"||started.Owner!=SodaDesktopSigninPackage.OwnerSid(owner))throw Failure();
        return OpenCore(checked((uint)(long)started.Field("pid")),(string)started.Field("createdFiletime"),SodaDesktopSigninServicePolicy.Executable(owner),true,scope);
    }
    internal static Identity Self(){
        if(!SodaDesktopSigninVault.SystemPrimary())throw Failure();using(var process=System.Diagnostics.Process.GetCurrentProcess()){
            // A real query/synchronize handle, never an inherited pseudo-handle.
            using(var handle=OpenProcess(0x00101000,false,checked((uint)process.Id))){if(handle==null||handle.IsInvalid||!SystemSessionZero(handle))throw Failure();return new Identity(GetProcessId(handle),Creation(handle));}
        }
    }
}
