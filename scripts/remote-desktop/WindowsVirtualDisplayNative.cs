// Windows 11 x64 broker backend. Begin is privileged and changes topology;
// validation only compiles this class. Never invoked by automated checks.
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class SodaDesktopVirtualDisplayNative : SodaDesktopVirtualDisplay.IBackend {
    const string Enumerator="SodaVirtualDisplay", Hardware="Sodashitsu\\VirtualDisplayV1";
    [UnmanagedFunctionPointer(CallingConvention.Winapi,CharSet=CharSet.Unicode)]
    delegate void Created(IntPtr handle,int result,IntPtr context,[MarshalAs(UnmanagedType.LPWStr)]string instance);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct CreateInfo {
        public uint Size;[MarshalAs(UnmanagedType.LPWStr)]public string Instance;
        public IntPtr Hardware,Compatible,Container;public uint Flags;
        [MarshalAs(UnmanagedType.LPWStr)]public string Description;
        public IntPtr Location,Security;
    }
    [StructLayout(LayoutKind.Sequential)]struct PropertyKey {public Guid Format;public uint Id;public PropertyKey(string format,uint id){Format=new Guid(format);Id=id;}}
    static PropertyKey InstanceKey=new PropertyKey("78c34fc8-104a-4aca-9ea4-524d52996e57",256);
    static PropertyKey ContainerKey=new PropertyKey("8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c",2);
    [DllImport("cfgmgr32.dll",CharSet=CharSet.Unicode)]static extern int SwDeviceCreate(string enumerator,string parent,ref CreateInfo info,uint propertyCount,IntPtr properties,Created callback,IntPtr context,out IntPtr handle);
    [DllImport("cfgmgr32.dll")]static extern void SwDeviceClose(IntPtr handle);
    [DllImport("cfgmgr32.dll",CharSet=CharSet.Unicode)]static extern uint CM_Locate_DevNodeW(out uint node,string instance,uint flags);
    [DllImport("cfgmgr32.dll")]static extern uint CM_Get_DevNode_Status(out uint status,out uint problem,uint node,uint flags);
    [DllImport("cfgmgr32.dll",CharSet=CharSet.Unicode)]static extern uint CM_Get_Device_Interface_PropertyW(string path,ref PropertyKey key,out uint type,byte[] buffer,ref uint size,uint flags);
    [DllImport("cfgmgr32.dll",CharSet=CharSet.Unicode)]static extern uint CM_Get_DevNode_PropertyW(uint node,ref PropertyKey key,out uint type,byte[] buffer,ref uint size,uint flags);
    [DllImport("user32.dll")]static extern int GetDisplayConfigBufferSizes(uint flags,out uint paths,out uint modes);
    [DllImport("user32.dll")]static extern int QueryDisplayConfig(uint flags,ref uint paths,IntPtr pathArray,ref uint modes,IntPtr modeArray,IntPtr topology);
    [DllImport("user32.dll")]static extern int DisplayConfigGetDeviceInfo(IntPtr request);

    sealed class DeviceHandle:SafeHandleZeroOrMinusOneIsInvalid {
        readonly Created callbackRoot;
        public DeviceHandle(Created callback):base(true){callbackRoot=callback;}
        public void Assign(IntPtr value){SetHandle(value);}
        protected override bool ReleaseHandle(){SwDeviceClose(handle);GC.KeepAlive(callbackRoot);return true;}
    }
    sealed class Device:SodaDesktopVirtualDisplay.IDevice {
        public readonly DeviceHandle Handle;
        public string InstanceId {get;set;}
        public Device(Created callback){Handle=new DeviceHandle(callback);}
        public bool Started {get{uint node,status,problem;if(Handle.IsClosed||Handle.IsInvalid||CM_Locate_DevNodeW(out node,InstanceId,0)!=0)return false;return StartedState(CM_Get_DevNode_Status(out status,out problem,node,0),status,problem);}}
        public SodaDesktopVirtualDisplay.Target ActiveTarget(Guid container){return FindTarget(InstanceId,container);}
        public void Dispose(){Handle.Dispose();}
    }
    sealed class Operation:IDisposable {
        readonly object gate=new object();
        readonly Action<SodaDesktopVirtualDisplay.IDevice> complete;
        readonly Action<Exception> failed;
        Device owned;
        bool returned,callbackReady,dispatched,cancelled;
        int result;
        string instance;
        readonly Created callback;
        public Operation(Guid container,Action<SodaDesktopVirtualDisplay.IDevice> complete,Action<Exception> failed){
            this.complete=complete;this.failed=failed;callback=Callback;owned=new Device(callback);
            IntPtr hardware=Marshal.StringToHGlobalUni(Hardware+"\0\0"),guid=Marshal.AllocHGlobal(16),handle=IntPtr.Zero;
            try {
                Marshal.StructureToPtr(container,guid,false);
                var info=new CreateInfo{Size=(uint)Marshal.SizeOf(typeof(CreateInfo)),Instance=container.ToString("D"),Hardware=hardware,Container=guid,Flags=9,Description="Sodashitsu temporary virtual display"};
                int hr=SwDeviceCreate(Enumerator,"HTREE\\ROOT\\0",ref info,0,IntPtr.Zero,callback,IntPtr.Zero,out handle);
                lock(gate){owned.Handle.Assign(handle);returned=true;if(hr<0){result=hr;callbackReady=true;}}
                Dispatch();
            }catch{Dispose();throw;}finally{Marshal.FreeHGlobal(hardware);Marshal.FreeHGlobal(guid);GC.KeepAlive(callback);}
        }
        void Callback(IntPtr handle,int hr,IntPtr context,string id){
            try{lock(gate){if(callbackReady)return;result=hr;instance=id;callbackReady=true;}Dispatch();}
            catch(Exception error){try{failed(error);}catch{}}
        }
        void Dispatch(){
            Device transfer;int hr;string id;
            lock(gate){if(!returned||!callbackReady||dispatched||cancelled)return;dispatched=true;transfer=owned;owned=null;hr=result;id=instance;}
            if(hr<0||String.IsNullOrEmpty(id)||id.Length>512||transfer.Handle.IsInvalid){transfer.Dispose();failed(new SodaDesktopVirtualFailure(hr==unchecked((int)0x80070005)?"permission_denied":"driver_unavailable"));return;}
            transfer.InstanceId=id;
            try{complete(transfer);}catch{transfer.Dispose();throw;}
        }
        public void Dispose(){Device close;lock(gate){if(cancelled)return;cancelled=true;close=owned;owned=null;}if(close!=null)close.Dispose();}
    }
    public IDisposable Begin(Guid container,Action<SodaDesktopVirtualDisplay.IDevice> complete,Action<Exception> failed){
        if(container==Guid.Empty||complete==null||failed==null||IntPtr.Size!=8)throw new ArgumentException();
        // Only the installed SYSTEM broker calls Begin. The nonprivileged helper has no elevation path.
        if(!System.Security.Principal.WindowsIdentity.GetCurrent().IsSystem)throw new InvalidOperationException("Virtual display requires the installed broker");
        using(var version=Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion")){int build;if(version==null||!Int32.TryParse(Convert.ToString(version.GetValue("CurrentBuildNumber","0")),out build)||build<22000)throw new SodaDesktopVirtualFailure("unsupported");}
        string store=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32","DriverStore","FileRepository");
        if(!System.IO.Directory.Exists(store)||System.IO.Directory.GetDirectories(store,"sodavirtualdisplay.inf_amd64_*").Length==0)throw new SodaDesktopVirtualFailure("driver_missing");
        return new Operation(container,complete,failed);
    }
    static string InterfaceInstance(string path){uint type,size=2048;var bytes=new byte[size];if(CM_Get_Device_Interface_PropertyW(path,ref InstanceKey,out type,bytes,ref size,0)!=0||type!=18||size<2||size>bytes.Length||size%2!=0)return null;return System.Text.Encoding.Unicode.GetString(bytes,0,(int)size).TrimEnd('\0');}
    static Guid? NodeContainer(string instance){uint node;if(CM_Locate_DevNodeW(out node,instance,0)!=0)return null;uint type,size=16;var bytes=new byte[16];if(CM_Get_DevNode_PropertyW(node,ref ContainerKey,out type,bytes,ref size,0)!=0||type!=13||size!=16)return null;return new Guid(bytes);}
    static string DisplayName(uint type,int size,byte[] luid,uint id,int offset,int chars){
        IntPtr request=Marshal.AllocHGlobal(size);
        try{var bytes=new byte[size];BitConverter.GetBytes(type).CopyTo(bytes,0);BitConverter.GetBytes(size).CopyTo(bytes,4);luid.CopyTo(bytes,8);BitConverter.GetBytes(id).CopyTo(bytes,16);Marshal.Copy(bytes,0,request,size);if(DisplayConfigGetDeviceInfo(request)!=0)return null;Marshal.Copy(request,bytes,0,size);string text=System.Text.Encoding.Unicode.GetString(bytes,offset,chars*2);int end=text.IndexOf('\0');return end<0?null:text.Substring(0,end);}finally{Marshal.FreeHGlobal(request);}
    }
    static SodaDesktopVirtualDisplay.Target FindTarget(string expected,Guid container){
        // Query only active paths. Read-only metadata; no SetDisplayConfig or physical mode changes.
        for(int attempt=0;attempt<3;attempt++){
            uint count,modes;if(GetDisplayConfigBufferSizes(2,out count,out modes)!=0||count>64||modes>256)return null;
            IntPtr paths=Marshal.AllocHGlobal(Math.Max(1,(int)count)*72),modeData=Marshal.AllocHGlobal(Math.Max(1,(int)modes)*64);
            try{int result=QueryDisplayConfig(2,ref count,paths,ref modes,modeData,IntPtr.Zero);if(result==122)continue;if(result!=0)return null;
                SodaDesktopVirtualDisplay.Target selected=null;
                for(int index=0;index<count;index++){
                    var bytes=new byte[72];Marshal.Copy(IntPtr.Add(paths,index*72),bytes,0,72);var sourceLuid=new byte[8];var targetLuid=new byte[8];Array.Copy(bytes,0,sourceLuid,0,8);Array.Copy(bytes,20,targetLuid,0,8);
                    uint source=BitConverter.ToUInt32(bytes,8),target=BitConverter.ToUInt32(bytes,28);
                    string adapter=DisplayName(4,276,sourceLuid,0,20,128);if(adapter==null)continue;
                    string adapterInstance=InterfaceInstance(adapter);if(!String.Equals(adapterInstance,expected,StringComparison.OrdinalIgnoreCase))continue;
                    string monitor=DisplayName(2,420,targetLuid,target,164,128),device=DisplayName(1,84,sourceLuid,source,20,32);if(monitor==null||device==null)continue;
                    string monitorInstance=InterfaceInstance(monitor);if(monitorInstance==null||NodeContainer(monitorInstance)!=container||NodeContainer(adapterInstance)!=container)continue;
                    // An instance with multiple targets violates the one-monitor package contract.
                    if(selected!=null)throw new InvalidOperationException("Ambiguous virtual monitor target");
                    selected=new SodaDesktopVirtualDisplay.Target(expected,adapterInstance,device,monitor,container);
                }
                return selected;
            }finally{Marshal.FreeHGlobal(paths);Marshal.FreeHGlobal(modeData);}
        }
        return null;
    }
    public static bool MatchesTarget(string instance,Guid container,string device,string monitor){var target=FindTarget(instance,container);return target!=null&&String.Equals(target.DeviceName,device,StringComparison.OrdinalIgnoreCase)&&String.Equals(target.MonitorPath,monitor,StringComparison.OrdinalIgnoreCase);}
    static bool StartedState(uint result,uint status,uint problem){if(result!=0)return false;if(problem!=0)throw new SodaDesktopVirtualFailure("driver_unavailable");return (status&8)!=0;}
    public static void VerifyLayouts(){if(!StartedState(0,8,0)||StartedState(1,8,0)||StartedState(0,0,0))throw new InvalidOperationException("Virtual driver status flags");bool rejected=false;try{StartedState(0,0,22);}catch(SodaDesktopVirtualFailure e){rejected=e.Code=="driver_unavailable";}if(!rejected)throw new InvalidOperationException("Disabled virtual driver accepted");if(IntPtr.Size!=8||Marshal.SizeOf(typeof(CreateInfo))!=72||Marshal.SizeOf(typeof(PropertyKey))!=20)throw new InvalidOperationException("Virtual display native ABI");}
}
