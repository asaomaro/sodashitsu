// Installed, administrator-protected broker. No network listeners or policy changes.
// Compile together with WindowsDesktopHost.cs, targeting the 64-bit .NET Framework.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class SodaDesktopUnlock {
    // Replaced by installer at compile time, never loaded from writable configuration.
    public const string Owner = "__OWNER_SID__";
    public const string Name = "__SERVICE_NAME__";
    static readonly object Gate = new object();
    static volatile bool End;
    static readonly CancellationTokenSource ShutdownToken=new CancellationTokenSource();
    static long Beat;
    static Process OwnerProcess;
    static string Logon;
    static int Session;
    static NamedPipeServerStream LeasePipe, SharePipe, WorkerPipe;
    static IntPtr Job;
    static Process Worker;
    static long Generation;
    const uint DataRights = 0x12019b; // Deliberately excludes FILE_CREATE_PIPE_INSTANCE (4).
    const uint QueryToken = 8;

    [StructLayout(LayoutKind.Sequential)] struct SA { public int length; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO {
        public int cb; public string reserved,desktop,title; public uint x,y,w,h,cx,cy,fill,flags; public short show,cbReserved; public IntPtr lpReserved,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public uint pid,tid; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long perProcess,perJob;public uint flags;public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct JOB_LIMIT { public BASIC_LIMIT basic;public IO io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
    [StructLayout(LayoutKind.Sequential)] struct SERVICE_STATUS { public uint type,state,accepted,exitCode,specificExit,checkpoint,waitHint,pid,flags; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct LEVEL1 {
        public uint session,state;public int flags;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=33)]public string station;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=21)]public string user;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=18)]public string domain;
        public long logon,connect,disconnect,lastInput,current; public uint incoming,outgoing,inFrames,outFrames,inCompressed,outCompressed;
    }
    [StructLayout(LayoutKind.Sequential)] struct INFOEX { public uint level; public LEVEL1 data; }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafePipeHandle CreateNamedPipe(string name,uint open,uint mode,uint max,uint output,uint input,uint timeout,ref SA attributes);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool ConnectNamedPipe(SafePipeHandle pipe,IntPtr overlapped);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafePipeHandle CreateFile(string name,uint access,uint share,IntPtr sa,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe,out uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder text,ref uint length);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool DuplicateTokenEx(IntPtr token,uint access,IntPtr sa,int level,int type,out IntPtr duplicate);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool SetTokenInformation(IntPtr token,int kind,ref int value,int size);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcessAsUser(IntPtr token,string app,StringBuilder args,IntPtr psa,IntPtr tsa,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO startup,out PI process);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text,uint revision,out IntPtr descriptor,out uint size);
    [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool WTSQuerySessionInformation(IntPtr server,uint session,int kind,out IntPtr buffer,out uint size);
    [DllImport("wtsapi32.dll")]static extern void WTSFreeMemory(IntPtr buffer);
    [DllImport("user32.dll",SetLastError=true)]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool GetUserObjectInformation(IntPtr handle,int kind,StringBuilder name,uint size,out uint needed);
    [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr handle);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateJobObject(IntPtr sa,string name);
    [DllImport("kernel32.dll")]static extern bool SetInformationJobObject(IntPtr job,int kind,ref JOB_LIMIT limits,uint length);
    [DllImport("kernel32.dll")]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")]static extern uint ResumeThread(IntPtr thread);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern IntPtr OpenSCManager(string machine,string db,uint access);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern IntPtr OpenService(IntPtr manager,string name,uint access);
    [DllImport("advapi32.dll")]static extern bool QueryServiceStatusEx(IntPtr service,int kind,out SERVICE_STATUS status,int size,out int needed);
    [DllImport("advapi32.dll")]static extern bool CloseServiceHandle(IntPtr service);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("sas.dll")]static extern void SendSAS(bool asUser);

    [StructLayout(LayoutKind.Sequential)]struct PRIVILEGE {public uint count,low;public int high;public uint attributes;}
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern bool LookupPrivilegeValue(string machine,string name,out long luid);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref PRIVILEGE privileges,uint size,IntPtr previous,IntPtr returned);
    static void EnableSessionPrivilege() {
        IntPtr token;Require(OpenProcessToken(Process.GetCurrentProcess().Handle,0x28,out token));
        try {long luid;Require(LookupPrivilegeValue(null,"SeTcbPrivilege",out luid));var privilege=new PRIVILEGE{count=1,low=(uint)luid,high=(int)(luid>>32),attributes=2};
            Require(AdjustTokenPrivileges(token,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0);
        }finally{CloseHandle(token);}
    }
    static void Require(bool value) { if(!value)throw new InvalidOperationException("Unlock helper unavailable"); }
    public static string ServiceName(string sid) {
        using(var sha=System.Security.Cryptography.SHA256.Create())return "SodaDesktopUnlock-"+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(sid))).Replace("-","").Substring(0,16);
    }
    public static string InstalledExecutable() {
        string sid=WindowsIdentity.GetCurrent().User.Value;
        string root=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        return Path.Combine(root,"Sodashitsu",ServiceName(sid),"DesktopUnlock.exe");
    }
    static string OwnPath { get { return Process.GetCurrentProcess().MainModule.FileName; } }
    static string PipeName { get { return @"\\.\pipe\"+Name; } }
    static string Image(Process process) {
        IntPtr handle=OpenProcess(0x1000,false,process.Id);Require(handle!=IntPtr.Zero);
        try {var result=new StringBuilder(32768);uint length=(uint)result.Capacity;
        Require(QueryFullProcessImageName(handle,0,result,ref length));return result.ToString();}
        finally{CloseHandle(handle);}
    }
    static WindowsIdentity Identity(Process process) {
        IntPtr handle=OpenProcess(0x1000,false,process.Id);Require(handle!=IntPtr.Zero);
        try {IntPtr token;Require(OpenProcessToken(handle,QueryToken,out token));
            try { return new WindowsIdentity(token); } finally { CloseHandle(token); }
        }finally{CloseHandle(handle);}
    }
    [StructLayout(LayoutKind.Sequential)]struct GROUP_ENTRY {public IntPtr sid;public uint flags;}
    [StructLayout(LayoutKind.Sequential)]struct GROUPS {public uint count;public GROUP_ENTRY first;}
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
    static string LogonSid(WindowsIdentity identity) {
        // WindowsIdentity.Groups intentionally filters out SE_GROUP_LOGON_ID.
        uint needed;GetTokenInformation(identity.Token,2,IntPtr.Zero,0,out needed);Require(needed>0&&needed<65536);
        IntPtr buffer=Marshal.AllocHGlobal((int)needed);
        try {
            Require(GetTokenInformation(identity.Token,2,buffer,needed,out needed));
            int count=Marshal.ReadInt32(buffer),offset=Marshal.OffsetOf(typeof(GROUPS),"first").ToInt32(),size=Marshal.SizeOf(typeof(GROUP_ENTRY));
            Require(count>0&&count<1024&&offset+(long)count*size<=needed);string value=null;
            for(int n=0;n<count;n++) {
                var group=(GROUP_ENTRY)Marshal.PtrToStructure(IntPtr.Add(buffer,offset+n*size),typeof(GROUP_ENTRY));
                if((group.flags&0xc0000000u)==0xc0000000u){Require(value==null);value=new SecurityIdentifier(group.sid).Value;}
            }
            Require(value!=null&&value.StartsWith("S-1-5-5-",StringComparison.Ordinal));return value;
        }finally{Marshal.FreeHGlobal(buffer);}
    }
    static void CheckOwner(Process process,bool bootstrap) {
        using(var identity=Identity(process)) {
            Require(identity.User.Value==Owner && process.SessionId==(int)WTSGetActiveConsoleSessionId() &&
                String.Equals(Image(process),OwnPath,StringComparison.OrdinalIgnoreCase));
            if(bootstrap) { Logon=LogonSid(identity);Session=process.SessionId; }
            else Require(process.SessionId==Session && LogonSid(identity)==Logon);
        }
    }
    static readonly bool SupportedWindows=Windows10OrLater();
    static bool Windows10OrLater() {
        try {using(var key=Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion")) {
            return Environment.Is64BitProcess && key!=null && Convert.ToInt32(key.GetValue("CurrentMajorVersionNumber",0))>=10;
        }}catch{return false;}
    }
    // Windows 7 reverses WTS lock flags; never enable secure mode on that platform.
    // Unknown, disconnected or non-console state is never treated as unlocked/locked.
    public static int LockState() {
        uint session=WTSGetActiveConsoleSessionId();
        if(Process.GetCurrentProcess().SessionId!=(int)session)return -1;
        return LockStateOf(session);
    }
    static int LockStateOf(uint session) {
        if(!SupportedWindows || session==0xffffffff || session!=WTSGetActiveConsoleSessionId())return -1;
        IntPtr buffer;uint length;
        if(!WTSQuerySessionInformation(IntPtr.Zero,session,25,out buffer,out length))return -1;
        try {
            if(length<Marshal.SizeOf(typeof(INFOEX)))return -1;
            var info=(INFOEX)Marshal.PtrToStructure(buffer,typeof(INFOEX));
            if(info.level!=1 || info.data.session!=session || info.data.state!=0)return -1;
            return info.data.flags==0?0:info.data.flags==1?1:-1;
        } finally { WTSFreeMemory(buffer); }
    }
    public static bool SecureDesktop() {
        using(var current=WindowsIdentity.GetCurrent())if(!current.IsSystem)return false;
        if(LockState()!=0)return false;
        IntPtr desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)return false;
        try { uint needed;var name=new StringBuilder(256);return GetUserObjectInformation(desktop,2,name,512,out needed)&&name.ToString()=="Winlogon"; }
        finally { CloseDesktop(desktop); }
    }
    static NamedPipeServerStream ServerPipe(string suffix,bool first,string logon,string serverSid="SY") {
        string acl="D:P(A;;GA;;;"+serverSid+")"+(logon==null?"":"(A;;0x12019b;;;"+logon+")");
        IntPtr descriptor;uint size;Require(ConvertStringSecurityDescriptorToSecurityDescriptor(acl,1,out descriptor,out size));
        try {
            var attributes=new SA {length=Marshal.SizeOf(typeof(SA)),descriptor=descriptor};
            var handle=CreateNamedPipe(PipeName+suffix,3u|0x40000000u|(first?0x80000u:0u),8,2,65536,65536,0,ref attributes);
            Require(!handle.IsInvalid);return new NamedPipeServerStream(PipeDirection.InOut,true,false,handle);
        } finally { LocalFree(descriptor); }
    }
    static void Accept(NamedPipeServerStream pipe,int timeout=6000) {
        using(var deadline=CancellationTokenSource.CreateLinkedTokenSource(ShutdownToken.Token)) {
            deadline.CancelAfter(timeout);
            pipe.WaitForConnectionAsync(deadline.Token).GetAwaiter().GetResult();
        }
    }
    static uint ServicePid() {
        IntPtr scm=OpenSCManager(null,null,1);Require(scm!=IntPtr.Zero);
        try { IntPtr service=OpenService(scm,Name,5);Require(service!=IntPtr.Zero);
            try {SERVICE_STATUS status;int needed;Require(QueryServiceStatusEx(service,0,out status,Marshal.SizeOf(typeof(SERVICE_STATUS)),out needed));Require(status.state==4&&status.pid!=0);CheckServiceConfig(service);return status.pid;}
            finally {CloseServiceHandle(service);}
        } finally {CloseServiceHandle(scm);}
    }
    [StructLayout(LayoutKind.Sequential)]struct SERVICE_CONFIG {
        public uint type,start,error;public IntPtr binary,group;public uint tag;public IntPtr dependencies,account,display;
    }
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryServiceConfig(IntPtr service,IntPtr buffer,uint size,out uint needed);
    static void CheckServiceConfig(IntPtr service) {
        uint needed;QueryServiceConfig(service,IntPtr.Zero,0,out needed);Require(needed>0&&needed<65536);
        IntPtr buffer=Marshal.AllocHGlobal((int)needed);
        try {Require(QueryServiceConfig(service,buffer,needed,out needed));var config=(SERVICE_CONFIG)Marshal.PtrToStructure(buffer,typeof(SERVICE_CONFIG));
            Require(config.type==0x10 && config.start==3 && Marshal.PtrToStringUni(config.account)=="LocalSystem" &&
                String.Equals(Marshal.PtrToStringUni(config.binary),"\""+OwnPath+"\"",StringComparison.OrdinalIgnoreCase));
        }finally{Marshal.FreeHGlobal(buffer);}
    }
    static NamedPipeClientStream ClientPipe(string suffix) {
        SafePipeHandle handle=null;
        for(int n=0;n<50;n++) { handle=CreateFile(PipeName+suffix,DataRights,0,IntPtr.Zero,3,0x100000,IntPtr.Zero);if(!handle.IsInvalid)break;handle.Dispose();Thread.Sleep(100); }
        Require(handle!=null&&!handle.IsInvalid);
        var pipe=new NamedPipeClientStream(PipeDirection.InOut,false,true,handle);
        try {
            uint pid;Require(GetNamedPipeServerProcessId(handle,out pid)&&pid==ServicePid());
            using(var process=Process.GetProcessById((int)pid))
                Require(process.SessionId==0 && String.Equals(Image(process),OwnPath,StringComparison.OrdinalIgnoreCase));
            return pipe;
        } catch {pipe.Dispose();throw;}
    }
    static Process Peer(NamedPipeServerStream pipe) {
        uint pid;Require(GetNamedPipeClientProcessId(pipe.SafePipeHandle,out pid));return Process.GetProcessById((int)pid);
    }
    static string Line(TextReader reader,int max) {
        var result=new StringBuilder();while(true) {int c=reader.Read();if(c<0)return null;if(c==10)return result.ToString().TrimEnd('\r');Require(result.Length<max);result.Append((char)c);}
    }
    static StreamWriter Writer(Stream pipe) {return new StreamWriter(pipe,new UTF8Encoding(false),4096,true){AutoFlush=true};}
    static StreamReader Reader(Stream pipe) {return new StreamReader(pipe,new UTF8Encoding(false,true),false,4096,true);}
    static void Copy(TextReader input,TextWriter output,int max) {string line;while((line=Line(input,max))!=null){output.WriteLine(line);output.Flush();}}
    public static void SetUtf8Console() {
        // Code-page setters fail without a console. All helper processes use redirected streams.
        Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),false,4096));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),4096){AutoFlush=true});
    }
    public static void RunNormal(int monitor,bool input,bool clipboard,bool resize,string source) {
        SodaDesktopHost.Run(monitor,input,clipboard,resize,source,LockState);
    }
    public static void RunInstalled(bool lease) {
        var start=new ProcessStartInfo(InstalledExecutable(),lease?"--lease":"--share") {
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
        };
        using(var process=Process.Start(start)) {
            process.ErrorDataReceived+=(s,e)=>{};process.BeginErrorReadLine();
            var childInput=new StreamWriter(process.StandardInput.BaseStream,new UTF8Encoding(false),4096){AutoFlush=true};
            var childOutput=new StreamReader(process.StandardOutput.BaseStream,new UTF8Encoding(false,true),false,4096);
            var input=new Thread(()=>{try{Copy(Console.In,childInput,65536);}catch{}finally{try{childInput.Close();}catch{}}}){IsBackground=true};input.Start();
            try{Copy(childOutput,Console.Out,3*1024*1024);process.WaitForExit();}
            finally{try{if(!process.HasExited)process.Kill();}catch{}}
            Require(process.ExitCode==0);
        }
    }
    public static void Lease() {
        Require(SupportedWindows && WindowsIdentity.GetCurrent().User.Value==Owner && Process.GetCurrentProcess().SessionId==(int)WTSGetActiveConsoleSessionId());
        using(var controller=new ServiceController(Name)) {
            // DemandStart only. No installation or elevation performed by this process.
            controller.Refresh();
            if(controller.Status!=ServiceControllerStatus.Stopped)
                controller.WaitForStatus(ServiceControllerStatus.Stopped,TimeSpan.FromSeconds(8));
            controller.Start(new[]{Process.GetCurrentProcess().Id.ToString(),Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString()});
            controller.WaitForStatus(ServiceControllerStatus.Running,TimeSpan.FromSeconds(8));
        }
        using(var pipe=ClientPipe(""))using(var writer=Writer(pipe)) {
            writer.WriteLine("lease");string line;
            while((line=Line(Console.In,64))!=null) {Require(line=="heartbeat");writer.WriteLine(line);}
        }
    }
    public static void Share() {
        using(var pipe=ClientPipe(""))using(var writer=Writer(pipe))using(var reader=Reader(pipe)) {
            writer.WriteLine("share");
            var input=new Thread(()=>{try{Copy(Console.In,writer,65536);}catch{}finally{pipe.Dispose();}}){IsBackground=true};input.Start();
            Copy(reader,Console.Out,3*1024*1024);
        }
    }
    static bool Live() {
        try {return !End && OwnerProcess!=null&&!OwnerProcess.HasExited && OwnerProcess.SessionId==Session &&
            WTSGetActiveConsoleSessionId()==(uint)Session && Now-Interlocked.Read(ref Beat)<6000;}
        catch{return false;}
    }
    // Framework 4.x has no Environment.TickCount64; monotonic Stopwatch is used below.
    static readonly Stopwatch Clock=Stopwatch.StartNew();
    static long Now {get{return Clock.ElapsedMilliseconds;}}
    static void Shutdown() {
        lock(Gate){End=true;ShutdownToken.Cancel();try{if(Job!=IntPtr.Zero){CloseHandle(Job);Job=IntPtr.Zero;}}catch{}
            foreach(var pipe in new[]{WorkerPipe,SharePipe,LeasePipe})try{if(pipe!=null)pipe.Dispose();}catch{} }
    }
    public static void StartService(string[] args) {
        Require(SupportedWindows && args.Length==2 && WindowsIdentity.GetCurrent().IsSystem);
        int pid=0;long started=0;Require(Int32.TryParse(args[0],out pid)&&Int64.TryParse(args[1],out started));
        EnableSessionPrivilege();
        OwnerProcess=Process.GetProcessById(pid);Require(OwnerProcess.StartTime.ToUniversalTime().Ticks==started);CheckOwner(OwnerProcess,true);
        Beat=Now;
        LeasePipe=ServerPipe("",true,Logon);
        var watch=new Thread(()=>{while(Live())Thread.Sleep(250);Shutdown(); }){IsBackground=true};watch.Start();
        var run=new Thread(()=>{
            try {
                Accept(LeasePipe);using(var peer=Peer(LeasePipe)){CheckOwner(peer,false);Require(peer.Id==OwnerProcess.Id);}
                using(var reader=Reader(LeasePipe)) {Require(Line(reader,64)=="lease");
                    var share=new Thread(ShareLoop){IsBackground=true};share.Start();
                    while(Live()){Require(Line(reader,64)=="heartbeat");Interlocked.Exchange(ref Beat,Now);}
                }
            } catch{} finally{Shutdown();}
        }){IsBackground=true};run.Start();
    }
    static void ShareLoop() {
        while(Live()) {
            try {
                SharePipe=ServerPipe("",false,Logon);Accept(SharePipe);
                using(var peer=Peer(SharePipe))CheckOwner(peer,false);
                using(var reader=Reader(SharePipe))using(var writer=Writer(SharePipe)) {
                    Require(Line(reader,64)=="share"&&Live());
                    long generation=StartWorker();Accept(WorkerPipe);
                    using(var peer=Peer(WorkerPipe))using(var identity=Identity(peer))Require(peer.Id==Worker.Id&&identity.IsSystem&&peer.SessionId==Session);
                    using(var workerReader=Reader(WorkerPipe))using(var workerWriter=Writer(WorkerPipe)) {
                        var forwarding=new Thread(()=>{try{Copy(reader,workerWriter,65536);}catch{}finally{EndWorker(generation);}}){IsBackground=true};forwarding.Start();
                        string output;while((output=Line(workerReader,3*1024*1024))!=null) {
                            if(output=="{\"type\":\"sas_request\"}") {SendSecureAttention();continue;}
                            writer.WriteLine(output);
                        }
                    }
                }
            }catch{} finally{EndWorker();try{if(SharePipe!=null)SharePipe.Dispose();}catch{} }
        }
    }
    static void EndWorker(long expected=-1) {lock(Gate){if(expected>=0&&expected!=Generation)return;if(Job!=IntPtr.Zero){CloseHandle(Job);Job=IntPtr.Zero;}try{if(WorkerPipe!=null)WorkerPipe.Dispose();}catch{}}}
    static long StartWorker() {
        lock(Gate) {
            Require(Live()&&LockStateOf((uint)Session)==0);Generation++;WorkerPipe=ServerPipe("-worker",true,null);
            Job=CreateJobObject(IntPtr.Zero,null);Require(Job!=IntPtr.Zero);
            var limit=new JOB_LIMIT();limit.basic.flags=0x2000;Require(SetInformationJobObject(Job,9,ref limit,(uint)Marshal.SizeOf(typeof(JOB_LIMIT))));
            IntPtr original,token;Require(OpenProcessToken(Process.GetCurrentProcess().Handle,0x2|0x8,out original));
            try {Require(DuplicateTokenEx(original,0xf01ff,IntPtr.Zero,2,1,out token));
                try {
                    int session=Session;Require(SetTokenInformation(token,12,ref session,4));
                    var si=new STARTUPINFO{cb=Marshal.SizeOf(typeof(STARTUPINFO)),desktop=@"WinSta0\Winlogon"};PI process;
                    Require(CreateProcessAsUser(token,OwnPath,new StringBuilder("\""+OwnPath+"\" --worker"),IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,Path.GetDirectoryName(OwnPath),ref si,out process));
                    try {Require(AssignProcessToJobObject(Job,process.process));Worker=Process.GetProcessById((int)process.pid);Require(ResumeThread(process.thread)!=0xffffffff);}
                    catch {using(var failed=Process.GetProcessById((int)process.pid))failed.Kill();throw;}
                    finally {CloseHandle(process.thread);CloseHandle(process.process);}
                }finally{CloseHandle(token);}
            }finally{CloseHandle(original);}
            return Generation;
        }
    }
    static void SendSecureAttention() {
        Require(Live()&&LockStateOf((uint)Session)==0);
        IntPtr token;Require(OpenProcessToken(OwnerProcess.Handle,QueryToken|2,out token));
        try {using(var impersonation=WindowsIdentity.Impersonate(token)){Require(Live()&&LockStateOf((uint)Session)==0);SendSAS(false);}}
        finally{CloseHandle(token);}
    }
    // Non-desktop self-test: real Windows overlapped named-pipe cancellation, no SCM/input/capture.
    public static void CheckPipeCancellation() {
        var clock=Stopwatch.StartNew();bool cancelled=false;
        using(var identity=WindowsIdentity.GetCurrent())
        using(var pipe=ServerPipe("-check-"+Guid.NewGuid().ToString("N"),true,LogonSid(identity),identity.User.Value))
            try{Accept(pipe,150);}catch(OperationCanceledException){cancelled=true;}
        Require(cancelled&&clock.ElapsedMilliseconds<3000);
        Console.WriteLine("desktop_unlock_pipe_cancelled");
    }
    public static void CheckPipeText() {
        string suffix="-check-"+Guid.NewGuid().ToString("N");
        using(var identity=WindowsIdentity.GetCurrent())
        using(var pipe=ServerPipe(suffix,true,LogonSid(identity),identity.User.Value)) {
            var accepted=System.Threading.Tasks.Task.Run(()=>Accept(pipe));
            var handle=CreateFile(PipeName+suffix,DataRights,0,IntPtr.Zero,3,0x100000,IntPtr.Zero);
            Require(!handle.IsInvalid);
            using(var client=new NamedPipeClientStream(PipeDirection.InOut,false,true,handle)) {
                accepted.GetAwaiter().GetResult();uint pid;
                Require(GetNamedPipeClientProcessId(pipe.SafePipeHandle,out pid)&&pid==Process.GetCurrentProcess().Id);
                using(var writer=Writer(client))using(var reader=Reader(pipe)) {
                    writer.WriteLine("日本語\U0001f600");Require(Line(reader,64)=="日本語\U0001f600");
                }
            }
        }
        Console.WriteLine("desktop_unlock_utf8_pipe_passed");
    }
    static void WorkerMain() {
        Require(SecureDesktop());
        using(var pipe=ClientPipe("-worker"))using(var reader=Reader(pipe))using(var writer=Writer(pipe)) {
            Console.SetIn(reader);Console.SetOut(writer);
            SodaDesktopHost.RunSecure(LockState,SecureDesktop);
        }
    }
    public static bool Finished {get{return End;}}
    public static void StopService(){Shutdown();}
    [STAThread]public static int Main(string[] args) {
        try {
            if(args.Length==0) {ServiceBase.Run(new UnlockService());return 0;}
            Require(args.Length==1);
            if(args[0]!="--worker")SetUtf8Console();
            if(args[0]=="--lease")Lease();else if(args[0]=="--share")Share();else if(args[0]=="--worker")WorkerMain();else throw new InvalidOperationException();return 0;
        }catch {Console.Error.WriteLine("Sodashitsu unlock helper unavailable.");return 1;}
    }
    sealed class UnlockService:ServiceBase {
        System.Threading.Timer watch;
        public UnlockService(){ServiceName=Name;CanStop=true;AutoLog=false;}
        protected override void OnStart(string[] args){StartService(args);watch=new System.Threading.Timer(o=>{if(Finished)Stop();},null,500,500);}
        protected override void OnStop(){if(watch!=null)watch.Dispose();Shutdown();}
    }
}
