using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
public static class SodaMicrophoneChecks {
    sealed class Sink:SodaDesktopMicrophone.ISink {
        public int Frames,Attempts,DelayMs;public bool Disposed;public long Energy;
        public void Write(byte[] pcm,Func<bool> allowed){Interlocked.Increment(ref Attempts);if(DelayMs>0)Thread.Sleep(DelayMs);if(!allowed())return;long energy=0;for(int i=0;i<pcm.Length;i+=2){int value=BitConverter.ToInt16(pcm,i);energy+=(long)value*value;}Energy=energy;Interlocked.Increment(ref Frames);}
        public void Dispose(){Disposed=true;}
    }
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    static void Until(Func<bool> condition){var clock=Stopwatch.StartNew();while(!condition()){if(clock.ElapsedMilliseconds>3000)throw new Exception("Check timeout");Thread.Sleep(5);}}
    static byte[] Frame(uint seq,bool stale){var packet=new byte[1932];Buffer.BlockCopy(BitConverter.GetBytes(seq),0,packet,0,4);double now=(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;Buffer.BlockCopy(BitConverter.GetBytes(now+(stale?-1000:100)),0,packet,4,8);for(int i=0;i<960;i++)Buffer.BlockCopy(BitConverter.GetBytes((short)(Math.Sin(i*Math.PI*2*440/48000)*12000)),0,packet,12+i*2,2);return packet;}
    public static string Run(){
        var sink=new Sink();bool allowed=true;string name="SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N");
        using(var worker=new SodaDesktopMicrophone(name,Process.GetCurrentProcess().Id,()=>allowed,(Func<SodaDesktopMicrophone.ISink>)(()=>sink)))
        using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)) {
            client.Connect(2000);var hello=new byte[16];int offset=0;while(offset<16){int n=client.Read(hello,offset,16-offset);if(n==0)throw new Exception("Missing hello");offset+=n;}Require(Convert.ToBase64String(hello)==Convert.ToBase64String(SodaDesktopMicrophone.Hello),"Hello mismatch");
            var fresh=Frame(1,false);client.Write(fresh,0,fresh.Length);Until(()=>sink.Frames==1);Require(sink.Energy>1000000000,"Generated PCM missing");
            var stale=Frame(2,true);client.Write(stale,0,stale.Length);Thread.Sleep(100);Require(sink.Frames==1,"Stale PCM played");
            allowed=false;worker.Dispose();Require(sink.Disposed,"Sink retained after stop");Require(sink.Frames==1,"PCM played after stop");
        }
        var delayed=new Sink{DelayMs=150};name="SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N");
        using(var worker=new SodaDesktopMicrophone(name,Process.GetCurrentProcess().Id,()=>true,(Func<SodaDesktopMicrophone.ISink>)(()=>delayed)))
        using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)) {
            client.Connect(2000);var hello=new byte[16];int offset=0;while(offset<16){int n=client.Read(hello,offset,16-offset);if(n==0)throw new Exception("Missing delayed hello");offset+=n;}
            var fresh=Frame(1,false);client.Write(fresh,0,fresh.Length);Until(()=>delayed.Attempts==1);Thread.Sleep(200);Require(delayed.Frames==0,"PCM expired during sink wait was played");
        }
        bool activated=false;name="SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N");
        using(var worker=new SodaDesktopMicrophone(name,Process.GetCurrentProcess().Id+100000,()=>true,(Func<SodaDesktopMicrophone.ISink>)(()=>{activated=true;return new Sink();})))
        using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){client.Connect(2000);Thread.Sleep(100);worker.Dispose();Require(!activated,"Wrong PID activated endpoint");}
        activated=false;using(var worker=new SodaDesktopMicrophone("SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N"),Process.GetCurrentProcess().Id,()=>false,(Func<SodaDesktopMicrophone.ISink>)(()=>{activated=true;return new Sink();}))){Thread.Sleep(50);}Require(!activated,"Denied owner activated endpoint");
        return "microphone_generated_pcm_checks_passed";
    }
}
