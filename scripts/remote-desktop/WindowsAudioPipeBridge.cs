using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

// Fixed, local binary transport only. It never enumerates or opens audio devices.
public static class SodaDesktopAudioPipeBridge {
    static readonly Stopwatch Clock = Stopwatch.StartNew();
    static long heartbeat, pendingInput, pendingOutput;
    static Stream input, output;
    static NamedPipeClientStream pipe;
    static bool microphone;
    static int closing;
    static readonly object outputLock = new object();
    static void Exit(int code) { if (Interlocked.Exchange(ref closing, 1) == 0) Environment.Exit(code); }
    static void Exact(Stream stream, byte[] bytes, int count) {
        int at = 0; while (at < count) { int n = stream.Read(bytes, at, count-at); if(n <= 0) throw new EndOfStreamException(); at += n; }
    }
    static Dictionary<string,object> Record() {
        var bytes = new List<byte>();
        while(true) { int b=input.ReadByte(); if(b<0 || b==0 || bytes.Count>=512) throw new IOException(); if(b==10) break; bytes.Add((byte)b); }
        return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes.ToArray()));
    }
    static void Watch() {
        while(true) {
            Thread.Sleep(50); long now=Clock.ElapsedMilliseconds;
            long a=Interlocked.Read(ref pendingInput), b=Interlocked.Read(ref pendingOutput);
            if(now-Interlocked.Read(ref heartbeat)>3000 || (a!=0 && now-a>2000) || (b!=0 && now-b>2000)) Exit(2);
        }
    }
    static void WriteOutput(byte[] bytes, int count) {
        lock(outputLock) { Interlocked.Exchange(ref pendingOutput,Clock.ElapsedMilliseconds+1); try { output.Write(bytes,0,count); output.Flush(); } finally { Interlocked.Exchange(ref pendingOutput,0); } }
    }
    static void Pump() {
        byte[] bytes=new byte[8192];
        try { while(true) { int n=pipe.Read(bytes,0,bytes.Length); if(n<=0) break; WriteOutput(bytes,n); Array.Clear(bytes,0,bytes.Length); } }
        catch { } finally { Array.Clear(bytes,0,bytes.Length); Exit(1); }
    }
    public static int Main(string[] args) {
        if(args.Length==1 && args[0]=="--preflight") { Console.WriteLine("soda-audio-pipe-preflight-v1"); return 0; }
        if(args.Length!=0) return 2;
        input=Console.OpenStandardInput(); output=Console.OpenStandardOutput();
        Interlocked.Exchange(ref heartbeat,Clock.ElapsedMilliseconds);
        var watch=new Thread(Watch); watch.IsBackground=true; watch.Start();
        try {
            var hello=Record();
            if(hello.Count!=1 || !hello.ContainsKey("nonce") || !(hello["nonce"] is string) || !Regex.IsMatch((string)hello["nonce"],"\\A[a-f0-9]{64}\\z")) return 2;
            byte[] descriptor=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new {type="audio_pipe",version=1,pid=Process.GetCurrentProcess().Id,nonce=(string)hello["nonce"]})+"\n");
            WriteOutput(descriptor,descriptor.Length);
            var command=Record();
            if(command.Count!=2 || !command.ContainsKey("kind") || !command.ContainsKey("name") || !(command["kind"] is string) || !(command["name"] is string)) return 2;
            string kind=(string)command["kind"], name=(string)command["name"];
            microphone=kind=="microphone"; if(!microphone && kind!="audio") return 2;
            if(!Regex.IsMatch(name,"\\ASodaDesktop"+(microphone?"Microphone":"Audio")+"-[a-f0-9]{32}\\z")) return 2;
            pipe=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous,TokenImpersonationLevel.Identification);
            pipe.Connect(2000);
            var pump=new Thread(Pump); pump.IsBackground=true; pump.Start();
            byte[] header=new byte[5], packet=new byte[1932];
            try {
                while(true) {
                    Exact(input,header,5); uint length=BitConverter.ToUInt32(header,1);
                    if(header[0]==1 && length==0) { Interlocked.Exchange(ref heartbeat,Clock.ElapsedMilliseconds); continue; }
                    if(header[0]==3 && length==0) return 0;
                    if(header[0]!=2 || !microphone || length!=packet.Length) return 2;
                    Exact(input,packet,packet.Length);
                    // Bound the write even when the authenticated native endpoint stops reading.
                    Interlocked.Exchange(ref pendingInput,Clock.ElapsedMilliseconds+1);
                    try { pipe.Write(packet,0,packet.Length); pipe.Flush(); } finally { Interlocked.Exchange(ref pendingInput,0); Array.Clear(packet,0,packet.Length); }
                }
            } finally { Array.Clear(packet,0,packet.Length); }
        } catch { return 2; } finally { if(pipe!=null)pipe.Dispose(); }
    }
}
