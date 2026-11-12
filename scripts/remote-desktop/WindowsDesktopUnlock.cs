// Installed, administrator-protected broker. No network listeners or policy changes.
// Compile together with WindowsDesktopHost.cs, targeting the 64-bit .NET Framework.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static partial class SodaDesktopUnlock {
    // Replaced by installer at compile time, never loaded from writable configuration.
    public const string Owner = "__OWNER_SID__";
    public const string Name = "__TASK_NAME__";
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
    static Guid WorkerNonce;
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
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("sas.dll")]static extern void SendSAS(bool asUser);

    [StructLayout(LayoutKind.Sequential)]struct PRIVILEGE {public uint count,low;public int high;public uint attributes;}
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern bool LookupPrivilegeValue(string machine,string name,out long luid);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref PRIVILEGE privileges,uint size,IntPtr previous,IntPtr returned);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetKernelObjectSecurity(IntPtr handle,uint information,byte[] descriptor,uint size,out uint needed);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool SetKernelObjectSecurity(IntPtr handle,uint information,byte[] descriptor);
    static byte[] ProcessDacl(IntPtr handle) {
        uint needed;GetKernelObjectSecurity(handle,4,null,0,out needed);
        Require(needed>0&&needed<65536);
        var bytes=new byte[needed];Require(GetKernelObjectSecurity(handle,4,bytes,needed,out needed));return bytes;
    }
    static byte[] AddProcessQuery(byte[] bytes,string logon) {
        Require(logon!=null&&logon.StartsWith("S-1-5-5-",StringComparison.Ordinal));
        var descriptor=new RawSecurityDescriptor(bytes,0);
        Require((descriptor.ControlFlags&ControlFlags.DiscretionaryAclPresent)!=0&&descriptor.DiscretionaryAcl!=null);
        var acl=descriptor.DiscretionaryAcl;
        Require(new DiscretionaryAcl(false,false,acl).IsCanonical);
        // Preserve every existing ACE, adding only this logon's limited query right.
        // Explicit allows precede inherited ACEs; existing explicit denies retain priority.
        int index=0;while(index<acl.Count&&(acl[index].AceFlags&AceFlags.Inherited)==0)index++;
        acl.InsertAce(index,new CommonAce(AceFlags.None,AceQualifier.AccessAllowed,0x1000,new SecurityIdentifier(logon),false,null));
        var result=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(result,0);return result;
    }
    static void GrantProcessQuery(IntPtr handle,string logon) {
        Require(SetKernelObjectSecurity(handle,4,AddProcessQuery(ProcessDacl(handle),logon)));
    }
    static void EnableSessionPrivilege() {
        IntPtr token;Require(OpenProcessToken(Process.GetCurrentProcess().Handle,0x28,out token));
        try {long luid;Require(LookupPrivilegeValue(null,"SeTcbPrivilege",out luid));var privilege=new PRIVILEGE{count=1,low=(uint)luid,high=(int)(luid>>32),attributes=2};
            Require(AdjustTokenPrivileges(token,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)&&Marshal.GetLastWin32Error()==0);
        }finally{CloseHandle(token);}
    }
    static void Require(bool value) { if(!value)throw new InvalidOperationException("Unlock helper unavailable"); }
    public static string RuntimeTaskName(string sid) {
        using(var sha=System.Security.Cryptography.SHA256.Create())return "SodaDesktopRuntime-"+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(sid))).Replace("-","").Substring(0,16);
    }
    public static string RuntimeExecutable() {return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu",RuntimeTaskName(WindowsIdentity.GetCurrent().User.Value),"DesktopUnlock.exe");}
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
    static string SecureDesktopFailure() {
        using(var current=WindowsIdentity.GetCurrent())if(!current.IsSystem)return "worker_identity";
        int state=LockState();if(state!=0)return state==1?"worker_session_unlocked":"worker_session_unavailable";
        IntPtr desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)return "worker_input_desktop_open";
        try {
            uint needed;var name=new StringBuilder(256);
            if(!GetUserObjectInformation(desktop,2,name,512,out needed))return "worker_input_desktop_query";
            if(name.ToString()=="Winlogon")return null;
            return name.ToString()=="Default"?"worker_input_desktop_default":"worker_input_desktop_other";
        }
        finally { CloseDesktop(desktop); }
    }
    public static bool SecureDesktop() {return SecureDesktopFailure()==null;}
    static bool InputIsDefault() {
        IntPtr desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)return false;
        try{uint needed;var name=new StringBuilder(256);return GetUserObjectInformation(desktop,2,name,512,out needed)&&name.ToString()=="Default";}
        finally{CloseDesktop(desktop);}
    }
    static bool SecureDesktopCandidate() {
        // Access denial is only a routing hint. The SYSTEM worker independently
        // requires the active, locked Winlogon desktop before capture or input.
        IntPtr desktop=OpenInputDesktop(0,false,1);
        if(desktop==IntPtr.Zero)return Marshal.GetLastWin32Error()==5;
        try{uint needed;var name=new StringBuilder(256);return GetUserObjectInformation(desktop,2,name,512,out needed)&&name.ToString()=="Winlogon";}
        finally{CloseDesktop(desktop);}
    }
    static string SelectSource(Func<int> state,Func<bool> inputDefault,Func<bool> secure) {
        int locked=state();
        return locked==1?"normal":locked==0?(inputDefault()?"normal":secure()?"secure":"transition"):"transition";
    }
    public static string SelectSource() {return SelectSource(LockState,InputIsDefault,SecureDesktopCandidate);}
    public static void SourceTransition() {WorkerFailure(Console.Out,"source_transition");}
    static void WorkerFailure(TextWriter writer,string code) {
        // Only fixed stage identifiers, never exception text, paths, images or input.
        writer.WriteLine("{\"type\":\"unlock_failure\",\"code\":\""+code+"\"}");writer.Flush();
    }
    static void RunSecureWorker(TextWriter writer,Func<string> check,Action run) {
        string failure;
        try{failure=check();}catch{WorkerFailure(writer,"worker_guard");return;}
        if(failure!=null){WorkerFailure(writer,failure);return;}
        bool failed=false;
        try{run();}catch{failed=true;}
        // Winlogon can return to the lock cover while capture is running. GDI
        // may throw before the loop observes its guard. Recheck without capture
        // or input, and preserve the verified transition before pipe teardown.
        try{failure=check();}catch{failure="worker_guard";}
        if(failure!=null||failed)WorkerFailure(writer,failure??"worker_initialization");
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
    static NamedPipeClientStream OpenClientPipe(string name) {
        SafePipeHandle handle=null;
        // A synchronous Windows handle serializes read and write, even on
        // different threads. Share/worker both read while awaiting configure,
        // so their concurrent writes must use an overlapped handle and stream.
        for(int n=0;n<50;n++) { handle=CreateFile(name,DataRights,0,IntPtr.Zero,3,0x40100000,IntPtr.Zero);if(!handle.IsInvalid)break;handle.Dispose();Thread.Sleep(100); }
        Require(handle!=null&&!handle.IsInvalid);
        try{return new NamedPipeClientStream(PipeDirection.InOut,true,true,handle);}
        catch{handle.Dispose();throw;}
    }
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool ProcessIdToSessionId(uint pid,out uint session);
    static bool BrokerPeerAllowed(uint actual,uint session,string image,string own,long created,uint exitCode) {
        return actual!=0&&session==0&&created>0&&exitCode==259&&String.Equals(image,own,StringComparison.OrdinalIgnoreCase);
    }
    static void CheckBrokerPipe(NamedPipeClientStream pipe) {
        uint pid;Require(GetNamedPipeServerProcessId(pipe.SafePipeHandle,out pid));
        using(var process=new SafeFileHandle(OpenProcess(0x1000,false,(int)pid),true)) {
            Require(!process.IsInvalid);uint session=0,code=0;long created=0,ended=0,kernel=0,user=0;
            Require(ProcessIdToSessionId(pid,out session)&&GetProcessTimes(process.DangerousGetHandle(),out created,out ended,out kernel,out user)&&GetExitCodeProcess(process,out code));
            var image=new StringBuilder(32768);uint length=(uint)image.Capacity;Require(QueryFullProcessImageName(process.DangerousGetHandle(),0,image,ref length));
            Require(BrokerPeerAllowed(pid,session,image.ToString(),OwnPath,created,code));
        }
    }
    static NamedPipeClientStream ClientPipe(string suffix) {
        var pipe=OpenClientPipe(PipeName+suffix);
        try {CheckBrokerPipe(pipe);return pipe;} catch {pipe.Dispose();throw;}
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
        Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false),4096){AutoFlush=true});
    }
    public static void RunNormal(int monitor,bool input,bool clipboard,bool resize,string source,bool monitors=false,bool virtualDisplay=false,bool unlockAllowed=false) {
        SodaDesktopHost.Run(monitor,input,clipboard,resize,source,LockState,monitors,virtualDisplay,unlockAllowed);
    }
    [StructLayout(LayoutKind.Sequential)]struct STARTUPINFOEX { public STARTUPINFO startup;public IntPtr attributes; }
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll")]static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr copy,uint access,bool inherit,uint options);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")]static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,StringBuilder args,IntPtr psa,IntPtr tsa,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFOEX startup,out PI process);
    [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(SafeFileHandle handle,uint milliseconds);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(SafeFileHandle handle,out uint code);
    sealed class ProxyChild:IDisposable {
        public int Id;public SafeFileHandle Process;public SafeFileHandle Job;
        public int WaitForExit(){uint code;Require(WaitForSingleObject(Process,UInt32.MaxValue)==0);Require(GetExitCodeProcess(Process,out code));return unchecked((int)code);}
        public void Dispose(){if(Job!=null)Job.Dispose();if(Process!=null)Process.Dispose();}
    }
    static ProxyChild StartProxy(string application,string arguments) {
        var job=new SafeFileHandle(CreateJobObject(IntPtr.Zero,null),true);
        IntPtr list=IntPtr.Zero,handles=IntPtr.Zero,jobValue=IntPtr.Zero;bool initialized=false;
        var copies=new List<IntPtr>();PI child=new PI();SafeFileHandle process=null;
        try {
            Require(!job.IsInvalid);
            var limit=new JOB_LIMIT();limit.basic.flags=0x2000;
            Require(SetInformationJobObject(job.DangerousGetHandle(),9,ref limit,(uint)Marshal.SizeOf(typeof(JOB_LIMIT))));
            foreach(int id in new[]{-10,-11,-12}) {
                IntPtr copy;Require(DuplicateHandle(GetCurrentProcess(),GetStdHandle(id),GetCurrentProcess(),out copy,0,true,2));copies.Add(copy);
            }
            IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);Require(size!=IntPtr.Zero);
            list=Marshal.AllocHGlobal(size);Require(InitializeProcThreadAttributeList(list,2,0,ref size));initialized=true;
            handles=Marshal.AllocHGlobal(3*IntPtr.Size);for(int n=0;n<3;n++)Marshal.WriteIntPtr(handles,n*IntPtr.Size,copies[n]);
            jobValue=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobValue,job.DangerousGetHandle());
            // Assign ownership atomically during creation, before any child code
            // runs. Only the three protocol streams are inherited, never the job.
            Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(3*IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobValue,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            var startup=new STARTUPINFOEX {startup=new STARTUPINFO {cb=Marshal.SizeOf(typeof(STARTUPINFOEX)),flags=0x100,input=copies[0],output=copies[1],error=copies[2]},attributes=list};
            Require(CreateProcess(application,new StringBuilder("\""+application+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,true,0x80000|0x08000000,IntPtr.Zero,Path.GetDirectoryName(application),ref startup,out child));
            // Retain the creation handle: .NET Framework cannot reliably read
            // ExitCode from a Process obtained by PID after the child has exited.
            process=new SafeFileHandle(child.process,true);child.process=IntPtr.Zero;
            return new ProxyChild {Id=unchecked((int)child.pid),Process=process,Job=job};
        }catch{job.Dispose();if(process!=null)process.Dispose();throw;}
        finally {
            if(child.thread!=IntPtr.Zero)CloseHandle(child.thread);if(child.process!=IntPtr.Zero)CloseHandle(child.process);
            if(initialized)DeleteProcThreadAttributeList(list);
            foreach(IntPtr value in new[]{list,handles,jobValue})if(value!=IntPtr.Zero)Marshal.FreeHGlobal(value);
            foreach(IntPtr copy in copies)CloseHandle(copy);
        }
    }
    public static void RunInstalled(bool lease,bool virtualAllowed=false,bool unlockAllowed=true,bool elevatedAllowed=false) {
        // Give the installed client the protocol pipes directly. There is no
        // parent stdout-copy loop to hang after EOF. Terminating PowerShell also
        // closes the private job and reaps its lease/share child and descendants.
        using(var child=StartProxy(RuntimeExecutable(),lease?LeaseArgument(virtualAllowed,unlockAllowed,elevatedAllowed):elevatedAllowed?"--elevated":"--share")) {
            int exitCode=child.WaitForExit();
            if(lease)Require(exitCode==0);
            else if(elevatedAllowed){if(exitCode!=0){Console.Out.WriteLine("{\"type\":\"protected_desktop_failure\",\"code\":\"worker_unavailable\"}");Console.Out.Flush();}}
            else FinishShare(exitCode,SelectSource,Console.Out);
        }
    }
    static void FinishShare(int exitCode,Func<string> select,TextWriter output) {
        // The secure worker ends without a marker when the input desktop
        // changes while still locked. Reclassify without reading stdin, capture,
        // or input. A fresh connection must obtain its own configure and control.
        string source=select();
        if(source=="normal")WorkerFailure(output,"source_transition");
        else WorkerFailure(output,exitCode==0?"worker_ended":"worker_start_or_connection");
    }
    static object ComCall(object value,string name,params object[] args) {return value.GetType().InvokeMember(name,System.Reflection.BindingFlags.InvokeMethod|System.Reflection.BindingFlags.OptionalParamBinding,null,value,args);}
    static object ComGet(object value,string name,params object[] args) {return value.GetType().InvokeMember(name,System.Reflection.BindingFlags.GetProperty,null,value,args);}
    static string[] RuntimeLeaseArguments(int pid,long created,int purpose) {
        Require(pid>0&&created>0&&purpose>=1&&purpose<=7);
        return new[]{pid.ToString(System.Globalization.CultureInfo.InvariantCulture),created.ToString(System.Globalization.CultureInfo.InvariantCulture),purpose==1?"unlock":PurposeName(purpose)};
    }
    static void CheckTaskAcl(string sddl) {
        var sd=new RawSecurityDescriptor(sddl);Require(sd.Owner!=null&&(sd.Owner.Value=="S-1-5-18"||sd.Owner.Value=="S-1-5-32-544")&&sd.DiscretionaryAcl!=null);
        bool ownerRead=false;foreach(GenericAce item in sd.DiscretionaryAcl){var ace=item as CommonAce;Require(ace!=null);if(ace.AceQualifier!=AceQualifier.AccessAllowed)continue;
            string sid=ace.SecurityIdentifier.Value;if(sid=="S-1-5-18"||sid=="S-1-5-32-544")continue;
            Require(sid==Owner&&(ace.AccessMask&unchecked((int)0x500D0156))==0);ownerRead=true;
        }Require(ownerRead);
    }
    static void RunPreparedTask(bool virtualAllowed,bool unlockAllowed,bool elevatedAllowed) {
        // The definition is prepared once with administrator consent. Running it
        // never installs, elevates, launches a shell, or changes that definition.
        object scheduler=null,folder=null,task=null;
        try {
            scheduler=Activator.CreateInstance(Type.GetTypeFromProgID("Schedule.Service",true));ComCall(scheduler,"Connect",null,null,null,null);folder=ComCall(scheduler,"GetFolder",@"\");task=ComCall(folder,"GetTask",Name);
            CheckTaskAcl((string)ComCall(task,"GetSecurityDescriptor",7));object definition=ComGet(task,"Definition"),principal=ComGet(definition,"Principal"),settings=ComGet(definition,"Settings"),actions=ComGet(definition,"Actions"),triggers=ComGet(definition,"Triggers");
            string user=(string)ComGet(principal,"UserId");string sid=user.StartsWith("S-1-",StringComparison.Ordinal)?new SecurityIdentifier(user).Value:((SecurityIdentifier)new NTAccount(user).Translate(typeof(SecurityIdentifier))).Value;
            Require(sid=="S-1-5-18"&&Convert.ToInt32(ComGet(principal,"LogonType"))==5&&Convert.ToInt32(ComGet(actions,"Count"))==1&&Convert.ToInt32(ComGet(triggers,"Count"))==0);
            var action=ComGet(actions,"Item",1);Require(Convert.ToInt32(ComGet(action,"Type"))==0&&String.Equals((string)ComGet(action,"Path"),OwnPath,StringComparison.OrdinalIgnoreCase)&&(string)ComGet(action,"Arguments")=="--runtime-broker $(Arg0) $(Arg1) $(Arg2)");
            Require(Convert.ToInt32(ComGet(settings,"MultipleInstances"))==2&&Convert.ToInt32(ComGet(settings,"RestartCount"))==0&&(string)ComGet(settings,"ExecutionTimeLimit")=="PT0S");
            foreach(string name in new[]{"DisallowStartIfOnBatteries","StopIfGoingOnBatteries","RunOnlyIfIdle","RunOnlyIfNetworkAvailable","StartWhenAvailable","WakeToRun"})Require(!Convert.ToBoolean(ComGet(settings,name)));
            Require(Convert.ToBoolean(ComGet(settings,"Enabled"))&&Convert.ToBoolean(ComGet(settings,"AllowDemandStart")));
            int purpose=(virtualAllowed?2:0)|(unlockAllowed?1:0)|(elevatedAllowed?4:0);using(var current=Process.GetCurrentProcess())ComCall(task,"Run",new object[]{RuntimeLeaseArguments(current.Id,current.StartTime.ToUniversalTime().Ticks,purpose)});
        }finally{foreach(object value in new[]{task,folder,scheduler})if(value!=null&&Marshal.IsComObject(value))Marshal.FinalReleaseComObject(value);}
    }
    static void RunBrokerConsole(Action start,Func<bool> finished,Action pause,Action stop) {try{start();while(!finished())pause();}finally{stop();}}
    public static void Lease(bool virtualAllowed=false,bool unlockAllowed=true,bool elevatedAllowed=false) {
        Require(SupportedWindows && WindowsIdentity.GetCurrent().User.Value==Owner && Process.GetCurrentProcess().SessionId==(int)WTSGetActiveConsoleSessionId());
        RunPreparedTask(virtualAllowed,unlockAllowed,elevatedAllowed);
        using(var pipe=ClientPipe(""))using(var writer=Writer(pipe)) {
            writer.WriteLine("lease");string line;
            while((line=Line(Console.In,64))!=null) {Require(line=="heartbeat");writer.WriteLine(line);}
        }
    }
    // Keep the output pipe open until the broker has retired its worker.
    static void StopInput(TextWriter writer,Action close,bool virtualDisplay=false) {
        try{if(virtualDisplay)close();else writer.WriteLine("{\"type\":\"stop\"}");}catch{close();}
    }
    public static void Share(bool virtualDisplay=false) {
        if(virtualDisplay)Require(VirtualShareAllowed(LockState,InputIsDefault));
        using(var pipe=ClientPipe(""))using(var writer=Writer(pipe))using(var reader=Reader(pipe)) {
            writer.WriteLine(virtualDisplay?"virtual":"share");
            var input=new Thread(()=>{try{Copy(Console.In,writer,65536);}catch{}finally{StopInput(writer,()=>pipe.Dispose(),virtualDisplay);}}){IsBackground=true};input.Start();
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
        lock(Gate){End=true;ShutdownToken.Cancel();EndWorker();
            foreach(var pipe in new[]{SharePipe,LeasePipe})try{if(pipe!=null)pipe.Dispose();}catch{} }
    }
    static bool VirtualShareAllowed(Func<int> state,Func<bool> inputDefault){return state()==1&&inputDefault();}
    static int BrokerPurpose;
    static readonly string[] PurposeNames={null,null,"virtual","both","elevated","unlock-elevated","virtual-elevated","all"};
    static string PurposeName(int purpose){Require(purpose>=2&&purpose<=7);return PurposeNames[purpose];}
    static string LeaseArgument(bool virtualAllowed,bool unlockAllowed,bool elevatedAllowed){
        // -UnlockLease alone denotes the unlock-only lease.
        if(!virtualAllowed&&!elevatedAllowed)return "--lease";
        int purpose=(virtualAllowed?2:0)|(unlockAllowed?1:0)|(elevatedAllowed?4:0);Require(purpose>0);
        return purpose==1?"--lease":purpose==2?"--lease-virtual":purpose==3?"--lease-both":"--lease-"+PurposeName(purpose);
    }
    static int ParseBrokerPurpose(string[] args){Require(args.Length==2||args.Length==3);if(args.Length==2)return 1;for(int i=2;i<=7;i++)if(args[2]==PurposeNames[i])return i;throw new InvalidOperationException("Broker purpose rejected");}
    static bool AllowsBrokerRequest(int purpose,string request){return request=="share"?(purpose&1)!=0:request=="virtual"?(purpose&2)!=0:(request=="elevated-default"||request=="elevated-uac")&&(purpose&4)!=0;}
    static Type ProtectedWorkerType(){var type=typeof(SodaDesktopUnlock).Assembly.GetType("SodaDesktopProtectedWorker");Require(type!=null);return type;}
    static bool CurrentProtectedWorker(long generation,Guid nonce){
        if(!Live())return false;lock(Gate){try{return generation==Generation&&nonce==WorkerNonce&&Job!=IntPtr.Zero&&Worker!=null&&!Worker.HasExited&&LockStateOf((uint)Session)==1;}catch{return false;}}
    }
    public static void StartBroker(string[] args) {
        Require(SupportedWindows && WindowsIdentity.GetCurrent().IsSystem);int purpose=ParseBrokerPurpose(args);
        int pid=0;long started=0;Require(Int32.TryParse(args[0],out pid)&&Int64.TryParse(args[1],out started));
        EnableSessionPrivilege();
        OwnerProcess=Process.GetProcessById(pid);Require(OwnerProcess.StartTime.ToUniversalTime().Ticks==started);CheckOwner(OwnerProcess,true);BrokerPurpose=purpose;
        // A normal user's helper must authenticate the SYSTEM broker's image.
        // Its default process DACL can deny even QUERY_LIMITED_INFORMATION.
        // Grant it only to the already verified logon, on this process only.
        using(var current=Process.GetCurrentProcess())GrantProcessQuery(current.Handle,Logon);
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
                using(var client=Peer(SharePipe))
                using(var reader=Reader(SharePipe))using(var writer=Writer(SharePipe)) {
                    Require(client.Handle!=IntPtr.Zero&&!client.HasExited);long clientStarted=client.StartTime.ToUniversalTime().Ticks;
                    CheckOwner(client,false);Require(!client.HasExited&&client.StartTime.ToUniversalTime().Ticks==clientStarted);
                    string request=Line(reader,64);Require(Live()&&AllowsBrokerRequest(BrokerPurpose,request));
                    if(request=="virtual"){
                        var type=typeof(SodaDesktopUnlock).Assembly.GetType("SodaDesktopVirtualBroker");Require(type!=null&&LockStateOf((uint)Session)==1);
                        long started=client.StartTime.ToUniversalTime().Ticks;
                        Func<bool> valid=()=>{try{return Live()&&!client.HasExited&&client.StartTime.ToUniversalTime().Ticks==started&&client.SessionId==Session&&LockStateOf((uint)Session)==1;}catch{return false;}};
                        type.GetMethod("Run").Invoke(null,new object[]{reader,writer,valid});continue;
                    }
                    bool protectedWorker=request=="elevated-default"||request=="elevated-uac";
                    Require(request=="share"||protectedWorker);
                    try {
                        Guid nonce=protectedWorker?Guid.NewGuid():Guid.Empty;
                        long generation=StartWorker(protectedWorker?request:null,nonce);var boundPipe=WorkerPipe;Accept(boundPipe);
                        using(var peer=Peer(boundPipe))using(var identity=Identity(peer))Require(peer.Id==Worker.Id&&identity.IsSystem&&peer.SessionId==Session);
                        using(var workerReader=Reader(boundPipe))using(var workerWriter=Writer(boundPipe)) {
                            if(protectedWorker){
                                var type=ProtectedWorkerType();string prefix;
                                using(var broker=Process.GetCurrentProcess())prefix=(string)type.GetMethod("Create").Invoke(null,new object[]{BrokerPurpose,request,Owner,Logon,Session,generation,nonce,broker.Id,broker.StartTime.ToUniversalTime().Ticks,Worker.Id,Worker.StartTime.ToUniversalTime().Ticks});
                                Func<bool> current=()=>CurrentProtectedWorker(generation,nonce)&&!client.HasExited&&client.StartTime.ToUniversalTime().Ticks==clientStarted;
                                type.GetMethod("Broker").Invoke(null,new object[]{prefix,workerReader,workerWriter,current,(Action)(()=>EndWorker(generation))});
                                Require(current());
                            }
                            var forwarding=new Thread(()=>{try{Copy(reader,workerWriter,65536);}catch{}finally{EndWorker(generation);}}){IsBackground=true};forwarding.Start();
                            bool outputSeen=false;string output;while((output=Line(workerReader,3*1024*1024))!=null) {
                                if(protectedWorker&&(!CurrentProtectedWorker(generation,nonce)||client.HasExited)){
                                    writer.WriteLine("{\"type\":\"protected_desktop_failure\",\"code\":\"source_changed\"}");outputSeen=true;break;
                                }
                                outputSeen=true;
                                if(output=="{\"type\":\"sas_request\"}") {Require(!protectedWorker);SendSecureAttention();continue;}
                                writer.WriteLine(output);
                            }
                            if(!outputSeen&&Live())WorkerFailure(writer,"worker_no_output");
                        }
                    }catch{WorkerFailure(writer,"worker_start_or_connection");throw;}
                    finally{EndWorker();}
                }
            }catch{} finally{EndWorker();try{if(SharePipe!=null)SharePipe.Dispose();}catch{} }
        }
    }
    static void EndWorker(long expected=-1) {
        lock(Gate){
            if(expected>=0&&expected!=Generation)return;
            // Only v2 can release input after EOF with full owner/logon/epoch
            // validation. Secure workers use immediate job cancellation.
            ReapCurrentWorker(
                ()=>{try{if(WorkerPipe!=null)WorkerPipe.Dispose();}finally{WorkerPipe=null;}},
                ()=>{if(Worker!=null&&!Worker.HasExited)Worker.WaitForExit(750);},
                ()=>{if(Job!=IntPtr.Zero){CloseHandle(Job);Job=IntPtr.Zero;}if(Worker!=null&&!Worker.HasExited)Worker.WaitForExit();});
            try{if(Worker!=null)Worker.Dispose();}catch{}finally{Worker=null;WorkerNonce=Guid.Empty;}
        }
    }
    static void ReapCurrentWorker(Action closePipe,Action wait,Action closeJob){
        bool scoped=WorkerNonce!=Guid.Empty;
        if(!scoped)try{closeJob();}catch{}
        try{closePipe();}catch{}
        if(scoped){try{wait();}catch{}finally{try{closeJob();}catch{}}}
    }
    static long StartWorker(string mode=null,Guid nonce=default(Guid)) {
        lock(Gate) {
            Require(mode==null||mode=="elevated-default"||mode=="elevated-uac");
            Require(Live()&&LockStateOf((uint)Session)==(mode==null?0:1));Require(mode==null?nonce==Guid.Empty:nonce!=Guid.Empty);
            Generation++;WorkerNonce=nonce;WorkerPipe=ServerPipe(mode==null?"-worker":"-worker-v2-"+nonce.ToString("N"),true,null);
            Job=CreateJobObject(IntPtr.Zero,null);Require(Job!=IntPtr.Zero);
            var limit=new JOB_LIMIT();limit.basic.flags=0x2000;Require(SetInformationJobObject(Job,9,ref limit,(uint)Marshal.SizeOf(typeof(JOB_LIMIT))));
            IntPtr original,token;Require(OpenProcessToken(Process.GetCurrentProcess().Handle,0x2|0x8,out original));
            try {Require(DuplicateTokenEx(original,0xf01ff,IntPtr.Zero,2,1,out token));
                try {
                    int session=Session;Require(SetTokenInformation(token,12,ref session,4));
                    var si=new STARTUPINFO{cb=Marshal.SizeOf(typeof(STARTUPINFO)),desktop=mode=="elevated-default"?@"WinSta0\Default":@"WinSta0\Winlogon"};PI process;
                    Require(CreateProcessAsUser(token,OwnPath,new StringBuilder("\""+OwnPath+"\" "+(mode==null?"--worker":"--worker-v2 "+mode+" "+nonce.ToString("D"))),IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,Path.GetDirectoryName(OwnPath),ref si,out process));
                    try {Require(AssignProcessToJobObject(Job,process.process));Worker=Process.GetProcessById((int)process.pid);Require(Worker.Handle!=IntPtr.Zero);Require(ResumeThread(process.thread)!=0xffffffff);}
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
    static void ShareElevated(){
        Require(LockState()==1);string mode=InputIsDefault()?"elevated-default":"elevated-uac";
        using(var pipe=ClientPipe(""))using(var writer=Writer(pipe))using(var reader=Reader(pipe)){
            writer.WriteLine(mode);
            var input=new Thread(()=>{try{Copy(Console.In,writer,65536);}catch{}finally{StopInput(writer,()=>pipe.Dispose());}}){IsBackground=true};input.Start();
            Copy(reader,Console.Out,3*1024*1024);
        }
    }
    static void WorkerMainV2(string mode,string nonceText){
        using(var identity=WindowsIdentity.GetCurrent())Require(identity.IsSystem&&(mode=="elevated-default"||mode=="elevated-uac"));
        Guid nonce;Require(Guid.TryParseExact(nonceText,"D",out nonce)&&nonce!=Guid.Empty);
        using(var pipe=ClientPipe("-worker-v2-"+nonce.ToString("N")))using(var reader=Reader(pipe))using(var writer=Writer(pipe)){
            CheckBrokerPipe(pipe);uint pid;Require(GetNamedPipeServerProcessId(pipe.SafePipeHandle,out pid));
            using(var broker=Process.GetProcessById((int)pid)){
                Require(broker.SessionId==0&&!broker.HasExited);
                ProtectedWorkerType().GetMethod("Run").Invoke(null,new object[]{mode,nonce,(int)pid,broker.StartTime.ToUniversalTime().Ticks,reader,writer});
            }
        }
    }
    static void WorkerMain() {
        // Authenticate the private transport before checking the desktop, so a
        // rejected guard can report its stage. No screen/input API runs on rejection.
        using(var pipe=ClientPipe("-worker"))using(var reader=Reader(pipe))using(var writer=Writer(pipe)) {
            Console.SetIn(reader);Console.SetOut(writer);
            RunSecureWorker(writer,SecureDesktopFailure,()=>SodaDesktopHost.RunSecure(LockState,SecureDesktop));
        }
    }
    public static bool Finished {get{return End;}}
    [STAThread]public static int Main(string[] args) {
        try {
            if(args.Length==4&&args[0]=="--runtime-broker") {using(var identity=WindowsIdentity.GetCurrent())Require(identity.IsSystem);var start=args[3]=="unlock"?new[]{args[1],args[2]}:new[]{args[1],args[2],args[3]};RunBrokerConsole(()=>StartBroker(start),()=>Finished,()=>Thread.Sleep(250),Shutdown);return 0;}
            if(args.Length==3&&args[0]=="--worker-v2"){WorkerMainV2(args[1],args[2]);return 0;}
            Require(args.Length==1);
            if(args[0]!="--worker")SetUtf8Console();
            if(args[0]=="--lease")Lease();else if(args[0]=="--lease-virtual")Lease(true,false);else if(args[0]=="--lease-both")Lease(true,true);else if(args[0]=="--lease-elevated")Lease(false,false,true);else if(args[0]=="--lease-unlock-elevated")Lease(false,true,true);else if(args[0]=="--lease-virtual-elevated")Lease(true,false,true);else if(args[0]=="--lease-all")Lease(true,true,true);else if(args[0]=="--elevated")ShareElevated();else if(args[0]=="--share")Share();else if(args[0]=="--virtual")Share(true);else if(args[0]=="--worker")WorkerMain();else throw new InvalidOperationException();return 0;
        }catch {Console.Error.WriteLine("Sodashitsu unlock helper unavailable.");return 1;}
    }

}
