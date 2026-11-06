// Ordinary Windows pipe only. No service, desktop, capture or input.
using System;using System.IO.Pipes;using System.Diagnostics;using System.Threading;using System.Threading.Tasks;using System.Runtime.InteropServices;
public static class SodaDesktopSigninDuplexChecks {
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 static void Need(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static bool Waiting(uint id){using(var self=Process.GetCurrentProcess())foreach(ProcessThread thread in self.Threads)using(thread){if(thread.Id==(int)id)return thread.ThreadState==System.Diagnostics.ThreadState.Wait;}return false;}
 public static void Run(){
  string name="SodaSigninDuplex-"+Guid.NewGuid().ToString("N");uint readerId=0;int received=-1;Exception readError=null;Thread reader=null;Task writer=null;Task<int> output=null;
  using(var server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))
  using(var client=SodaDesktopSigninWorker.OpenPipe(name))using(var started=new ManualResetEvent(false)){
   try{
    var pending=server.BeginWaitForConnection(null,null);client.Connect(2000);server.EndWaitForConnection(pending);
    reader=new Thread(()=>{readerId=GetCurrentThreadId();started.Set();try{received=client.ReadByte();}catch(Exception error){readError=error;}}){IsBackground=true};reader.Start();Need(started.WaitOne(2000),"Signin pipe reader did not start");
    var timer=Stopwatch.StartNew();while(!Waiting(readerId)&&timer.ElapsedMilliseconds<2000)Thread.Sleep(5);Need(Waiting(readerId),"Signin pipe reader was not pending");
    output=Task.Factory.StartNew(()=>server.ReadByte());writer=Task.Factory.StartNew(()=>{client.WriteByte(87);client.Flush();});bool independent=writer.Wait(2000);
    // Supply input only after recording whether output was independently sent.
    // This also releases the old synchronous handle's blocked ReadFile.
    server.WriteByte(83);server.Flush();Need(reader.Join(2000),"Signin pipe reader did not finish");Need(writer.Wait(2000),"Signin pipe writer did not finish");
    Need(readError==null&&received==83&&output.Wait(2000)&&output.Result==87,"Signin pipe bytes changed");
    Need(independent,"Signin pipe writes waited for incoming data");
   }finally{
    server.Dispose();client.Dispose();if(reader!=null&&!reader.Join(2000))Environment.FailFast("Generated pipe reader did not stop");if(writer!=null){try{if(!writer.Wait(2000))Environment.FailFast("Generated pipe writer did not stop");}catch(AggregateException){}}if(output!=null){try{if(!output.Wait(2000))Environment.FailFast("Generated pipe output did not stop");}catch(AggregateException){}}
   }
  }
  Console.WriteLine("signin_pipe_pending_read_did_not_block_write_passed");
 }
}
