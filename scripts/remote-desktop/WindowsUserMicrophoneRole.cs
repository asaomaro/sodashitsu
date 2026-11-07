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
    [DllImport("Wtsapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool WTSQuerySessionInformation(IntPtr server,uint session,int kind,out IntPtr data,out uint length);
    [DllImport("Wtsapi32.dll")]static extern void WTSFreeMemory(IntPtr data);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,out int value,int size,out int needed);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    static readonly Stopwatch Clock=Stopwatch.StartNew();static long heartbeat,started;static int stopping;
    static SodaDesktopMicrophone microphone;static SodaDesktopUserMicrophonePolicy policy;
    static Process peer;static long peerStarted;
    static SodaDesktopUserMicrophonePolicy.Facts Read(Process process,WindowsIdentity identity){
        var facts=new SodaDesktopUserMicrophonePolicy.Facts{System=identity.IsSystem,Owner=identity.User==null?null:identity.User.Value,Session=process.SessionId,ActiveSession=checked((int)WTSGetActiveConsoleSessionId()),LockState=-1};
        int elevated,needed;if(!GetTokenInformation(identity.Token,20,out elevated,4,out needed)||needed!=4)throw new InvalidOperationException("Ordinary microphone token required");facts.Elevated=elevated!=0;
        foreach(IdentityReference group in identity.Groups){string sid=group.Value;if(sid.StartsWith("S-1-5-5-",StringComparison.Ordinal)){if(facts.Logon!=null)throw new InvalidOperationException("Ambiguous microphone logon");facts.Logon=sid;}}
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
            var watch=new Thread(()=>{while(Thread.VolatileRead(ref stopping)==0){Thread.Sleep(50);if((policy!=null&&!Allowed())||microphone==null&&Clock.ElapsedMilliseconds-started>=2500){Interlocked.Exchange(ref stopping,1);try{Console.OpenStandardInput().Dispose();}catch{};Environment.Exit(2);}}});watch.IsBackground=true;watch.Start();
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
