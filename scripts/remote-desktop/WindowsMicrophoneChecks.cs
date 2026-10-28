using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
public static class SodaMicrophoneChecks {
    sealed class Pending:IAsyncResult,IDisposable {
        readonly ManualResetEvent wait=new ManualResetEvent(false);public AsyncCallback Callback;public int Ends,Borrowed;public bool HandleFault;
        public object AsyncState{get{return null;}}public WaitHandle AsyncWaitHandle{get{Borrowed++;return wait;}}public bool CompletedSynchronously{get{return false;}}public bool IsCompleted{get;private set;}
        public IAsyncResult Begin(AsyncCallback callback){Callback=callback;return this;}
        public int End(IAsyncResult value){Ends++;return 1;}
        public void Finish(){IsCompleted=true;try{wait.Set();}catch(ObjectDisposedException){HandleFault=true;}if(Callback!=null)Callback(this);}
        public void Dispose(){wait.Dispose();}
    }
    static void PendingCancellation(){
        using(var pending=new Pending()){
            int checks=0;bool cancelled=false;try{SodaDesktopPipeOperation.Wait(pending.Begin,pending.End,100,()=>++checks==1);}catch(OperationCanceledException){cancelled=true;}
            Require(cancelled,"Pending pipe was not cancelled");pending.Finish();if(pending.Ends!=1||pending.Borrowed!=0||pending.HandleFault)throw new InvalidOperationException("Pending pipe wait handle closed or End omitted");
        }
    }
    static void LateBufferCleanup(){
        using(var pending=new Pending()){
            var buffer=new byte[16];bool retired=false,cancelled=false;
            try{SodaDesktopPipeOperation.Wait(pending.Begin,value=>{pending.End(value);for(int i=0;i<buffer.Length;i++)buffer[i]=127;return 1;},100,()=>{if(retired)return false;retired=true;return true;},()=>{if(retired)Array.Clear(buffer,0,buffer.Length);});}catch(OperationCanceledException){cancelled=true;}
            Array.Clear(buffer,0,buffer.Length);pending.Finish();Require(cancelled&&pending.Ends==1,"Late pipe read did not finish");foreach(byte value in buffer)if(value!=0)throw new InvalidOperationException("Late cancelled pipe bytes retained");
        }
    }
    sealed class Sink:SodaDesktopMicrophone.ISink {
        public int Frames,Attempts,Completed,DelayMs;public bool Disposed;public long Energy;
        public void Write(byte[] pcm,Func<bool> allowed){Interlocked.Increment(ref Attempts);if(DelayMs>0)Thread.Sleep(DelayMs);if(!allowed()){Interlocked.Increment(ref Completed);return;}long energy=0;for(int i=0;i<pcm.Length;i+=2){int value=BitConverter.ToInt16(pcm,i);energy+=(long)value*value;}Energy=energy;Interlocked.Increment(ref Frames);Interlocked.Increment(ref Completed);}
        public void Dispose(){Disposed=true;}
    }
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    static void Until(Func<bool> condition){var clock=Stopwatch.StartNew();while(!condition()){if(clock.ElapsedMilliseconds>3000)throw new Exception("Check timeout");Thread.Sleep(5);}}
    static byte[] Frame(uint seq,bool stale){var packet=new byte[1932];Buffer.BlockCopy(BitConverter.GetBytes(seq),0,packet,0,4);double now=(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;Buffer.BlockCopy(BitConverter.GetBytes(now+(stale?-1000:100)),0,packet,4,8);for(int i=0;i<960;i++)Buffer.BlockCopy(BitConverter.GetBytes((short)(Math.Sin(i*Math.PI*2*440/48000)*12000)),0,packet,12+i*2,2);return packet;}
    public static string Run(){
        PendingCancellation();LateBufferCleanup();
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
            var fresh=Frame(1,false);client.Write(fresh,0,fresh.Length);Until(()=>delayed.Completed==1);Require(delayed.Frames==0,"PCM expired during sink wait was played");
        }
        bool activated=false;name="SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N");
        using(var worker=new SodaDesktopMicrophone(name,Process.GetCurrentProcess().Id+100000,()=>true,(Func<SodaDesktopMicrophone.ISink>)(()=>{activated=true;return new Sink();})))
        using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){client.Connect(2000);var bytes=new byte[16];int count=SodaDesktopPipeOperation.Wait(callback=>client.BeginRead(bytes,0,bytes.Length,callback,null),value=>client.EndRead(value),2000,()=>true);worker.Dispose();Require(!activated&&count==0,"Wrong PID activated endpoint");}
        activated=false;using(var worker=new SodaDesktopMicrophone("SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N"),Process.GetCurrentProcess().Id,()=>false,(Func<SodaDesktopMicrophone.ISink>)(()=>{activated=true;return new Sink();}))){}Require(!activated,"Denied owner activated endpoint");
        return "microphone_generated_pcm_checks_passed";
    }
}
