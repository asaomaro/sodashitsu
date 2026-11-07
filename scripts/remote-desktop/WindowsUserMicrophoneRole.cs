// Runs in the ordinary soda user's session. Never loaded into the SYSTEM worker.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
public static class SodaDesktopUserMicrophoneRole {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Level1 {
        public uint session,state;public int flags;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=33)]public string station;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=21)]public string user;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=18)]public string domain;
        public long logon,connect,disconnect,lastInput,current;public uint incoming,outgoing,inFrames,outFrames,inCompressed,outCompressed;
    }
    [StructLayout(LayoutKind.Sequential)]struct InfoEx {public uint level;public Level1 data;}
    [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool ProcessIdToSessionId(uint processId,out uint sessionId);
    [DllImport("Wtsapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool WTSQuerySessionInformation(IntPtr server,uint session,int kind,out IntPtr data,out uint length);
    [DllImport("Wtsapi32.dll")]static extern void WTSFreeMemory(IntPtr data);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,out int value,int size,out int needed);
    [DllImport("advapi32.dll",EntryPoint="GetTokenInformation",SetLastError=true)]static extern bool GetTokenGroups(IntPtr token,int kind,IntPtr data,int size,out int needed);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    static readonly Stopwatch Clock=Stopwatch.StartNew();static long heartbeat,started;static int stopping;
    static SodaDesktopMicrophone microphone;static SodaDesktopUserMicrophonePolicy policy;
    static Process peer;static long peerStarted;
    [StructLayout(LayoutKind.Sequential)]struct SidAttributes {public IntPtr sid;public uint attributes;}
    [StructLayout(LayoutKind.Sequential)]struct GroupsHeader {public uint count;public SidAttributes first;}
    const int MaxGroupsBytes=1024*1024;
    static InvalidOperationException InvalidLogon(){return new InvalidOperationException("Unambiguous native microphone logon required");}
    internal static string LogonSid(IntPtr token){
        int needed;bool probe=GetTokenGroups(token,2,IntPtr.Zero,0,out needed);
        if(probe||Marshal.GetLastWin32Error()!=122||needed<=0||needed>MaxGroupsBytes)throw InvalidLogon();
        for(int attempt=0;attempt<3;attempt++){
            int capacity=needed;IntPtr buffer=Marshal.AllocHGlobal(capacity);
            try{
                bool ok=GetTokenGroups(token,2,buffer,capacity,out needed);int error=Marshal.GetLastWin32Error();
                if(ok){if(needed<=0||needed>capacity)throw InvalidLogon();return LogonGroups(buffer,needed);}
                if(error!=122||needed<=capacity||needed>MaxGroupsBytes)throw InvalidLogon();
            }finally{Marshal.FreeHGlobal(buffer);}
        }
        throw InvalidLogon();
    }
    // TOKEN_GROUPS owns both its SID_AND_ATTRIBUTES table and all pointed-to SID bytes.
    // WindowsIdentity.Groups filters logon groups on .NET Framework; never use it as this proof.
    internal static string LogonGroups(IntPtr buffer,int length){
        int offset=Marshal.OffsetOf(typeof(GroupsHeader),"first").ToInt32(),stride=Marshal.SizeOf(typeof(SidAttributes));
        if(buffer==IntPtr.Zero||length<offset||length>MaxGroupsBytes)throw InvalidLogon();
        int count=Marshal.ReadInt32(buffer);if(count<1||count>4096||count>(length-offset)/stride)throw InvalidLogon();
        ulong begin=unchecked((ulong)buffer.ToInt64()),end=begin+(uint)length,tableEnd=begin+(uint)(offset+count*stride);
        if(end<begin)throw InvalidLogon();string found=null;
        for(int index=0;index<count;index++){
            IntPtr entry=IntPtr.Add(buffer,offset+index*stride),sid=Marshal.ReadIntPtr(entry);
            uint flags=unchecked((uint)Marshal.ReadInt32(entry,IntPtr.Size));ulong address=unchecked((ulong)sid.ToInt64());
            if((flags&~0xe000007fu)!=0||address<tableEnd||(address&3u)!=0||address>end-8)throw InvalidLogon();
            int sub=Marshal.ReadByte(sid,1),bytes=8+4*sub;
            if(Marshal.ReadByte(sid)!=1||sub>15||address>end-(uint)bytes)throw InvalidLogon();
            string value;try{value=new SecurityIdentifier(sid).Value;}catch{throw InvalidLogon();}
            bool logon=(flags&0xc0000000u)==0xc0000000u,named=Regex.IsMatch(value,@"\AS-1-5-5-[0-9]+-[0-9]+\z");
            if((flags&0xc0000000u)!=0&&!logon||logon!=named)throw InvalidLogon();
            if(logon){if((flags&4u)==0||(flags&~0xc0000007u)!=0||found!=null)throw InvalidLogon();found=value;}
        }
        if(found==null)throw InvalidLogon();return found;
    }
    internal static int CheckedSession(bool success,uint session){
        if(!success||session==0||session>Int32.MaxValue)throw new InvalidOperationException("Ordinary microphone session required");
        return checked((int)session);
    }
    // Read the same PID afresh. The .NET Framework ProcessInfo getter is too costly
    // for this per-frame guard; neither session nor lock/token facts are cached.
    internal static int NativeSessionId(int processId){
        uint session=0;
        bool success=processId>0&&ProcessIdToSessionId((uint)processId,out session);
        return CheckedSession(success,session);
    }
    static SodaDesktopUserMicrophonePolicy.Facts Read(Process process,WindowsIdentity identity){
        var facts=new SodaDesktopUserMicrophonePolicy.Facts{System=identity.IsSystem,Owner=identity.User==null?null:identity.User.Value,Session=NativeSessionId(process.Id),ActiveSession=checked((int)WTSGetActiveConsoleSessionId()),LockState=-1};
        int elevated,needed;if(!GetTokenInformation(identity.Token,20,out elevated,4,out needed)||needed!=4)throw new InvalidOperationException("Ordinary microphone token required");facts.Elevated=elevated!=0;
        facts.Logon=LogonSid(identity.Token);
        IntPtr data;uint size;
        if(facts.Session>0&&facts.Session==facts.ActiveSession&&WTSQuerySessionInformation(IntPtr.Zero,(uint)facts.Session,25,out data,out size)){
            try{if(size>=Marshal.SizeOf(typeof(InfoEx))){var info=(InfoEx)Marshal.PtrToStructure(data,typeof(InfoEx));if(info.level==1&&info.data.session==(uint)facts.Session&&info.data.state==0)facts.LockState=info.data.flags;}}
            finally{WTSFreeMemory(data);}
        }
        return facts;
    }
    static SodaDesktopUserMicrophonePolicy.Facts Self(){using(var process=Process.GetCurrentProcess())using(var identity=WindowsIdentity.GetCurrent())return Read(process,identity);}
    static bool Allowed(){
        try{long now=Clock.ElapsedMilliseconds;return Thread.VolatileRead(ref stopping)==0&&now>=Interlocked.Read(ref heartbeat)&&now-Interlocked.Read(ref heartbeat)<2000&&policy!=null&&policy.Current(Self())&&(peer==null||!peer.HasExited&&peer.StartTime.ToUniversalTime().Ticks==peerStarted);}
        catch{return false;}
    }
    static bool Peer(int pid){
        IntPtr token=IntPtr.Zero;Process candidate=null;
        try{
            if(!Allowed()||peer!=null)return false;candidate=Process.GetProcessById(pid);long stamp=candidate.StartTime.ToUniversalTime().Ticks;
            if(candidate.HasExited||!OpenProcessToken(candidate.Handle,8,out token))return false;
            using(var identity=new WindowsIdentity(token))if(!policy.Peer(Read(candidate,identity)))return false;
            if(!Allowed()||candidate.HasExited||candidate.StartTime.ToUniversalTime().Ticks!=stamp)return false;
            peer=candidate;peerStarted=stamp;candidate=null;return true;
        }catch{return false;}finally{if(token!=IntPtr.Zero)CloseHandle(token);if(candidate!=null)candidate.Dispose();}
    }
    static Dictionary<string,object> Record(){var bytes=new List<byte>();var input=Console.OpenStandardInput();while(true){int value=input.ReadByte();if(value<0||value==0||bytes.Count>=2048)throw new IOException("Microphone control closed");if(value==10)break;bytes.Add((byte)value);}return new JavaScriptSerializer{MaxJsonLength=2048}.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes.ToArray()));}
    static void Output(object value){Console.WriteLine(new JavaScriptSerializer().Serialize(value));Console.Out.Flush();}
    public static int Main(string[] args){
        if(args.Length==1&&args[0]=="--preflight"){Console.WriteLine("soda-user-microphone-preflight-v1");return 0;}if(args.Length!=0)return 2;
        string id=null,nonce=null;bool enabled=false;
        try{
            started=heartbeat=Clock.ElapsedMilliseconds;
            var watch=new Thread(()=>{while(Thread.VolatileRead(ref stopping)==0){Thread.Sleep(50);if((policy!=null&&!Allowed())||microphone==null&&Clock.ElapsedMilliseconds-started>=2500){Interlocked.Exchange(ref stopping,1);var retireDeadline=new Thread(()=>{Thread.Sleep(1500);Environment.Exit(2);});retireDeadline.IsBackground=true;retireDeadline.Start();return;}}});watch.IsBackground=true;watch.Start();
            var hello=Record();Guid parsed;
            if(hello.Count!=4||!hello.ContainsKey("id")||!(hello["id"] is string)||!Guid.TryParseExact((string)hello["id"],"D",out parsed)||!hello.ContainsKey("nonce")||!(hello["nonce"] is string)||!Regex.IsMatch((string)hello["nonce"],@"\A[a-f0-9]{64}\z")||!hello.ContainsKey("endpoint")||!(hello["endpoint"] is string)||String.IsNullOrWhiteSpace((string)hello["endpoint"])||((string)hello["endpoint"]).Length>512||((string)hello["endpoint"]).IndexOf('\0')>=0||!hello.ContainsKey("mode")||!(hello["mode"] is string)||Clock.ElapsedMilliseconds-started>=2500)return 2;
            policy=new SodaDesktopUserMicrophonePolicy(Self(),(string)hello["mode"]);if(!Allowed())return 2;
            id=(string)hello["id"];nonce=(string)hello["nonce"];string endpoint=(string)hello["endpoint"];
            Output(new{type="user_microphone_ready",id,nonce});
            while(Allowed()){
                var command=Record();if(!Allowed())break;
                if(command.Count==1&&Object.Equals(command.ContainsKey("type")?command["type"]:null,"heartbeat")){Interlocked.Exchange(ref heartbeat,Clock.ElapsedMilliseconds);continue;}
                if(command.Count==3&&Object.Equals(command.ContainsKey("type")?command["type"]:null,"native_microphone")&&Object.Equals(command.ContainsKey("id")?command["id"]:null,id)&&Object.Equals(command.ContainsKey("enabled")?command["enabled"]:null,false))break;
                if(!SodaDesktopUserMicrophonePolicy.Start(command,id,enabled,Clock.ElapsedMilliseconds,started,Interlocked.Read(ref heartbeat),Thread.VolatileRead(ref stopping)!=0)||!Allowed())return 2;
                enabled=true;microphone=new SodaDesktopMicrophone((string)command["pipeName"],(int)command["clientPid"],Allowed,endpoint,Peer);
            }
            return 0;
        }catch{return 2;}finally{
            Interlocked.Exchange(ref stopping,1);
            var deadline=new Thread(()=>{Thread.Sleep(1500);Environment.Exit(2);});deadline.IsBackground=true;deadline.Start();
            if(microphone!=null)microphone.Dispose();microphone=null;if(peer!=null)peer.Dispose();peer=null;
            if(id!=null)Output(new{type="user_microphone_closed",id,nonce});
        }
    }
}
