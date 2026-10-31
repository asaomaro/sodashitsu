using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

// Ordinary soda user's loopback role. Never loaded into a protected SYSTEM worker.
public static class SodaDesktopUserAudioRole {
    static readonly Stopwatch Clock=Stopwatch.StartNew();
    internal static Func<long> Now=()=>Clock.ElapsedMilliseconds;
    static long heartbeat,started;static int stopping;static SodaDesktopAudio audio;
    static readonly object gate=new object();
    public static long Timestamp(){long ticks=Stopwatch.GetTimestamp(),frequency=Stopwatch.Frequency;if(!Stopwatch.IsHighResolution||ticks<0||frequency<=0)throw new InvalidOperationException("Audio clock");return checked(ticks/frequency*1000000+(ticks%frequency)*1000000/frequency);}
    static bool Allowed(){long now=Now();return Thread.VolatileRead(ref stopping)==0&&now>=Interlocked.Read(ref heartbeat)&&now-Interlocked.Read(ref heartbeat)<2000;}
    static bool StartAllowed(Dictionary<string,object> command,string id,bool enabled){return !enabled&&command.Count==5&&command.ContainsKey("type")&&command["type"] is string&&(string)command["type"]=="native_audio"&&command.ContainsKey("id")&&command["id"] is string&&(string)command["id"]==id&&command.ContainsKey("enabled")&&command["enabled"] is bool&&(bool)command["enabled"]&&command.ContainsKey("pipeName")&&command["pipeName"] is string&&Regex.IsMatch((string)command["pipeName"],"\\ASodaDesktopAudio-[a-f0-9]{32}\\z")&&command.ContainsKey("clientPid")&&command["clientPid"] is int&&(int)command["clientPid"]>0&&Allowed()&&Now()>=started&&Now()-started<2500;}
    public static void GeneratedChecks(){
        long now=100;Now=()=>now;started=heartbeat=now;stopping=0;string id=Guid.NewGuid().ToString("D");var command=new Dictionary<string,object>{{"type","native_audio"},{"id",id},{"enabled",true},{"pipeName","SodaDesktopAudio-"+Guid.NewGuid().ToString("N")},{"clientPid",1}};
        if(!StartAllowed(command,id,false))throw new Exception("Stable user audio start rejected");
        if(StartAllowed(command,Guid.NewGuid().ToString("D"),false)||StartAllowed(command,id,true))throw new Exception("Audio stream proof missing");
        command["clientPid"]=0;if(StartAllowed(command,id,false))throw new Exception("Audio client PID proof missing");command["clientPid"]=1;
        now=2600;heartbeat=now;if(StartAllowed(command,id,false))throw new Exception("Original audio startup deadline extended");
        now=100;heartbeat=100;started=100;stopping=1;if(StartAllowed(command,id,false))throw new Exception("Audio source survived revocation");stopping=0;
        now=2100;if(StartAllowed(command,id,false))throw new Exception("Audio source survived heartbeat expiry");
        now=99;if(StartAllowed(command,id,false))throw new Exception("Audio source survived clock rollback");
        Now=()=>Clock.ElapsedMilliseconds;stopping=1;long first=Timestamp(),second=Timestamp();if(first<0||second<first||second>9007199254740991L||Math.Abs(second-(long)(Stopwatch.GetTimestamp()*1000000.0/Stopwatch.Frequency))>100000)throw new Exception("Audio QPC clock");
        Console.WriteLine("user_audio_generated_checks_passed: stream/PID, original startup, heartbeat, revocation and shared QPC; no device capture");
    }
    static Dictionary<string,object> Record(){var bytes=new List<byte>();var input=Console.OpenStandardInput();while(true){int value=input.ReadByte();if(value<0||value==0||bytes.Count>=1024)throw new IOException("Audio control closed");if(value==10)break;bytes.Add((byte)value);}return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes.ToArray()));}
    static void Output(object value){Console.WriteLine(new JavaScriptSerializer().Serialize(value));Console.Out.Flush();}
    public static int Main(string[] args){
        if(args.Length==1&&args[0]=="--preflight"){Console.WriteLine("soda-user-audio-preflight-v1");return 0;}if(args.Length!=0)return 2;
        using(var identity=WindowsIdentity.GetCurrent()){if(identity.IsSystem||identity.User==null)return 2;}
        started=Now();heartbeat=started;
        var watch=new Thread(()=>{while(Thread.VolatileRead(ref stopping)==0){Thread.Sleep(50);if(!Allowed()||(audio==null&&Now()-started>=2500)){Interlocked.Exchange(ref stopping,1);try{Console.OpenStandardInput().Dispose();}catch{};Environment.Exit(2);}}});watch.IsBackground=true;watch.Start();
        string id=null,nonce=null;bool enabled=false;
        try{
            var hello=Record();Guid parsed;if(hello.Count!=2||!hello.ContainsKey("id")||!hello.ContainsKey("nonce")||!(hello["id"] is string)||!Guid.TryParseExact((string)hello["id"],"D",out parsed)||!(hello["nonce"] is string)||!Regex.IsMatch((string)hello["nonce"],"\\A[a-f0-9]{64}\\z")||!Allowed()||Now()-started>=2500)return 2;
            id=(string)hello["id"];nonce=(string)hello["nonce"];Output(new{type="user_audio_ready",id,nonce,clock="windows-qpc-v1"});
            while(Allowed()){
                var command=Record();if(!Allowed())break;
                if(command.Count==1&&command.ContainsKey("type")&&(string)command["type"]=="heartbeat"){Interlocked.Exchange(ref heartbeat,Now());continue;}
                if(!command.ContainsKey("type")||!command.ContainsKey("id")||(string)command["type"]!="native_audio"||(string)command["id"]!=id||!command.ContainsKey("enabled")||!(command["enabled"] is bool))return 2;
                if(!(bool)command["enabled"]){if(command.Count!=3)return 2;break;}
                if(!StartAllowed(command,id,enabled))return 2;
                enabled=true;lock(gate){if(!Allowed())break;audio=new SodaDesktopAudio((string)command["pipeName"],(int)command["clientPid"],Allowed,(Func<long>)Timestamp);}
            }
            return 0;
        }catch{return 2;}finally{
            Interlocked.Exchange(ref stopping,1);
            // A receipt is sent only after the actual pipe/device thread has retired.
            var deadline=new Thread(()=>{Thread.Sleep(1500);Environment.Exit(2);});deadline.IsBackground=true;deadline.Start();
            lock(gate){if(audio!=null)audio.Dispose();audio=null;}
            if(id!=null)Output(new{type="user_audio_closed",id,nonce});
        }
    }
}
