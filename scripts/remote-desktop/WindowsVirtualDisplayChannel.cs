// Installed broker/client channel. The regular helper never creates a privileged device.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

public static class SodaDesktopVirtualBroker {
    static string Line(TextReader input,int limit){var text=new System.Text.StringBuilder();for(;;){int c=input.Read();if(c<0)return null;if(c==10)return text.ToString().TrimEnd('\r');if(text.Length>=limit)throw new InvalidOperationException("Virtual display message limit");text.Append((char)c);}}
    public static void Run(TextReader input,TextWriter output,Func<bool> authenticatedClientLive){
        var clock=Stopwatch.StartNew();long beat=clock.ElapsedMilliseconds;int ended=0;
        var reader=new Thread(()=>{try{while(Line(input,64)=="heartbeat")Interlocked.Exchange(ref beat,clock.ElapsedMilliseconds);}catch{}finally{Interlocked.Exchange(ref ended,1);}}){IsBackground=true};
        reader.Start();
        Func<bool> live=()=>Interlocked.CompareExchange(ref ended,0,0)==0&&clock.ElapsedMilliseconds-Interlocked.Read(ref beat)<6000&&authenticatedClientLive();
        try {
            using(var lease=new SodaDesktopVirtualDisplay(new SodaDesktopVirtualDisplayNative(),live,()=>clock.ElapsedMilliseconds)){
                bool announced=false;
                while(live()){
                    var target=lease.Poll();
                    if(target!=null&&!announced){output.WriteLine(new JavaScriptSerializer().Serialize(new {type="virtual_ready",device=target.DeviceName,container=lease.ContainerId.ToString("D"),instance=target.InstanceId,monitor=target.MonitorPath}));output.Flush();announced=true;}
                    Thread.Sleep(100);
                }
            }
        }catch(Exception error){output.WriteLine(new JavaScriptSerializer().Serialize(new {type="virtual_error",code=SodaDesktopVirtualFailure.Of(error)}));output.Flush();}finally{Interlocked.Exchange(ref ended,1);}
    }
}

public sealed class SodaDesktopVirtualClient : IDisposable {
    readonly Process child;
    readonly object gate=new object();
    System.Threading.Timer heartbeat;
    volatile bool live=true;
    string instance,monitor;Guid container;
    public string DeviceName {get;private set;}
    public string FailureCode {get;private set;}
    public bool Alive {get{try{return live&&!child.HasExited&&SodaDesktopVirtualDisplayNative.MatchesTarget(instance,container,DeviceName,monitor);}catch{return false;}}}
    SodaDesktopVirtualClient(string installedExecutable){
        var start=new ProcessStartInfo(installedExecutable,"--virtual"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=Path.GetDirectoryName(installedExecutable),StandardOutputEncoding=new System.Text.UTF8Encoding(false,true),StandardErrorEncoding=new System.Text.UTF8Encoding(false,true)};
        child=Process.Start(start);
        if(child==null)throw new InvalidOperationException("Virtual display client unavailable");
        try {
            // Bounded discard: installed clients emit only fixed errors. Never retain local exception details.
            new Thread(()=>{try{int count=0;while(count++<4096&&child.StandardError.Read()>=0){}}catch{}}){IsBackground=true}.Start();
            heartbeat=new System.Threading.Timer(_=>{try{lock(gate){if(live){child.StandardInput.WriteLine("heartbeat");child.StandardInput.Flush();}}}catch{live=false;}},null,0,1000);
            var ready=Task.Factory.StartNew(()=>ReadLine(child.StandardOutput,2048));
            if(!ready.Wait(12000))throw new System.TimeoutException("Virtual display creation timed out");
            var target=ParseReady(ready.Result);DeviceName=target.Device;instance=target.Instance;monitor=target.Monitor;container=target.Container;
            new Thread(()=>{try{ParseReady(ReadLine(child.StandardOutput,2048));FailureCode="failed";}catch(Exception error){FailureCode=SodaDesktopVirtualFailure.Of(error);}finally{live=false;}}){IsBackground=true}.Start();
        }catch{Dispose();throw;}
    }
    sealed class Ready{public string Device,Instance,Monitor;public Guid Container;}
    static Ready ParseReady(string line){
        if(line==null)throw new SodaDesktopVirtualFailure("broker_unavailable");
        if(line.Length>2048)throw new InvalidOperationException("Virtual display response limit");
        Guid parsedContainer;
            var message=new JavaScriptSerializer{MaxJsonLength=2048}.Deserialize<Dictionary<string,object>>(line);
            if(message!=null&&message.Count==2&&Object.Equals(message.ContainsKey("type")?message["type"]:null,"virtual_error")&&message.ContainsKey("code")){
                string code=message["code"] as string;if(Array.IndexOf(new[]{"driver_missing","driver_unavailable","broker_missing","broker_unavailable","permission_denied","unsupported","timeout","target_changed","lease_lost","failed"},code)<0)throw new InvalidOperationException("Invalid virtual error");throw new SodaDesktopVirtualFailure(code);
            }
            if(message==null||message.Count!=5||!message.ContainsKey("type")||!message.ContainsKey("device")||!message.ContainsKey("container")||!message.ContainsKey("instance")||!message.ContainsKey("monitor")||
               !Object.Equals(message["type"],"virtual_ready")||!(message["device"] is string)||!(message["container"] is string)||!(message["instance"] is string)||!(message["monitor"] is string)||((string)message["instance"]).Length>512||((string)message["monitor"]).Length>512||String.IsNullOrEmpty((string)message["instance"])||String.IsNullOrEmpty((string)message["monitor"])||
               !Guid.TryParseExact((string)message["container"],"D",out parsedContainer)||parsedContainer==Guid.Empty||
               !System.Text.RegularExpressions.Regex.IsMatch((string)message["device"],@"^\\\\\.\\DISPLAY[0-9]{1,3}\z"))throw new InvalidOperationException("Invalid virtual display target");
        return new Ready{Device=(string)message["device"],Instance=(string)message["instance"],Monitor=(string)message["monitor"],Container=parsedContainer};
    }
    public static void VerifyReadyMessages(){
        var json=new JavaScriptSerializer();Guid id=Guid.NewGuid();
        var good=new Dictionary<string,object>{{"type","virtual_ready"},{"device",@"\\.\DISPLAY2"},{"instance",@"SWD\SodaVirtualDisplay\generated"},{"monitor",@"\\?\DISPLAY#generated"},{"container",id.ToString("D")}};
        var ready=ParseReady(json.Serialize(good));if(ready.Container!=id||ready.Device!=(string)good["device"])throw new InvalidOperationException("Virtual ready decode");
        foreach(var pair in new[]{new KeyValuePair<string,object>("type","ready"),new KeyValuePair<string,object>("device",@"\\.\DISPLAY2"+"\n"),new KeyValuePair<string,object>("device","other"),new KeyValuePair<string,object>("container",Guid.Empty.ToString("D")),new KeyValuePair<string,object>("instance",new string('x',513)),new KeyValuePair<string,object>("monitor",false),new KeyValuePair<string,object>("extra",true)}){
            var bad=new Dictionary<string,object>(good);bad[pair.Key]=pair.Value;bool rejected=false;try{ParseReady(json.Serialize(bad));}catch{rejected=true;}if(!rejected)throw new InvalidOperationException("Invalid virtual ready accepted: "+pair.Key);
        }
        bool typed=false;try{ParseReady("{\"type\":\"virtual_error\",\"code\":\"driver_missing\"}");}catch(SodaDesktopVirtualFailure failure){typed=failure.Code=="driver_missing";}if(!typed)throw new InvalidOperationException("Virtual failure code lost");
        Console.WriteLine("virtual_ready_parser_checks_passed: actual bounded parser, exact device syntax/type/keys/container, no child process or OS APIs");
    }
    static string ReadLine(TextReader input,int limit){var value=new System.Text.StringBuilder();for(;;){int c=input.Read();if(c<0)return null;if(c==10)return value.ToString().TrimEnd('\r');if(value.Length>=limit)throw new InvalidOperationException("Virtual display response limit");value.Append((char)c);}}
    public static SodaDesktopVirtualClient Open(string installedExecutable){
        if(String.IsNullOrEmpty(installedExecutable)||!Path.IsPathRooted(installedExecutable)||!File.Exists(installedExecutable))throw new SodaDesktopVirtualFailure("broker_missing");
        return new SodaDesktopVirtualClient(installedExecutable);
    }
    public void Dispose(){
        live=false;if(heartbeat!=null){heartbeat.Dispose();heartbeat=null;}
        try{child.StandardInput.Close();}catch{}
        try{if(!child.WaitForExit(1000))child.Kill();}catch{}
        child.Dispose();
    }
}
