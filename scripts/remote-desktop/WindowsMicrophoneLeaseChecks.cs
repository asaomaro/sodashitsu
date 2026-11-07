// Generated sink/process checks only. No WASAPI device, desktop or input APIs.
using System;
using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.Threading;
public static class SodaMicrophoneLeaseChecks {
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,out int value,int size,out int needed);
    const string FixturePrefix=@"Local\SODA_MICROPHONE_MUTEX_PREFIX";
    sealed class Sink:SodaDesktopMicrophone.ISink {
        internal bool Block,Fail;
        internal readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(false);
        public void Write(byte[] pcm,Func<bool> allowed){}
        public void Dispose(){Entered.Set();if(Block&&!Release.WaitOne(15000))throw new Exception("Fixture disposal release missing");if(Fail)throw new Exception("Generated sink retirement failed");}
    }
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    static void Output(string value){Console.WriteLine(value);Console.Out.Flush();}
    static SodaDesktopMicrophone Start(string name,Func<bool> allowed,Func<SodaDesktopMicrophone.ISink> sink,bool guarded){
        return guarded?new SodaDesktopMicrophone(name,Process.GetCurrentProcess().Id,allowed,sink,pid=>pid==Process.GetCurrentProcess().Id):new SodaDesktopMicrophone(name,Process.GetCurrentProcess().Id,allowed,sink);
    }
    static int Hello(NamedPipeClientStream pipe){var bytes=new byte[16];int read=0;try{while(read<bytes.Length){int n=pipe.Read(bytes,read,bytes.Length-read);if(n==0)break;read+=n;}}catch(System.IO.IOException){}return read;}
    static bool Try(bool guarded){
        int opened=0;string name="SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N");SodaDesktopMicrophone worker=null;
        try{
            worker=Start(name,()=>true,()=>{Interlocked.Increment(ref opened);return new Sink();},guarded);
            using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
                client.Connect(2000);int bytes=Hello(client);
                Require((bytes==16&&Thread.VolatileRead(ref opened)==1)||(bytes==0&&Thread.VolatileRead(ref opened)==0),"Lease result before sink proof");
                return bytes==16;
            }
        }finally{if(worker!=null)worker.Dispose();}
    }
    static int Owner(bool guarded,bool failure){
        var sink=new Sink{Block=!failure,Fail=failure};bool allowed=true;string name="SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N");SodaDesktopMicrophone worker=null;
        try{
            worker=Start(name,()=>allowed,()=>sink,guarded);
            using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
                client.Connect(2000);Require(Hello(client)==16,"Old owner failed to acquire");if(failure)Output("sink_activated");
                var retiring=new Thread(()=>{allowed=false;try{worker.Dispose();}catch(TimeoutException){}});retiring.IsBackground=true;retiring.Start();
                Require(sink.Entered.WaitOne(3000),"Old sink did not enter disposal");
                // New device threads in the same process must also fail without opening a sink.
                if(!failure){Require(!Try(false),"Same-process normal contender acquired before old sink retirement");Require(!Try(true),"Same-process protected contender acquired before old sink retirement");}
                Output(failure?"failing_dispose":"dispose_pending");
                if(failure){Thread.Sleep(10000);throw new Exception("Unknown sink close did not end its owner process");}
                string command=Console.ReadLine();if(command=="kill"){using(var self=Process.GetCurrentProcess())self.Kill();Thread.Sleep(10000);return 2;}
                Require(command=="release","Expected fixture release");sink.Release.Set();retiring.Join(3000);worker.Dispose();Output("disposed");Require(Console.ReadLine()=="exit","Expected fixture owner exit");return 0;
            }
        }finally{sink.Release.Set();if(worker!=null)try{worker.Dispose();}catch(TimeoutException){}}
    }
    public static int Main(string[] args){
        var deadline=new Thread(()=>{Thread.Sleep(20000);using(var self=Process.GetCurrentProcess())self.Kill();});deadline.IsBackground=true;deadline.Start();
        try{
            using(var identity=WindowsIdentity.GetCurrent()){int elevated,needed;Require(!identity.IsSystem&&GetTokenInformation(identity.Token,20,out elevated,4,out needed)&&needed==4&&elevated==0,"Fixture requires a non-elevated ordinary-user token");}
            Require(args.Length==1,"One fixture mode required");
            if(args[0]=="keeper"){
                string sid;using(var identity=WindowsIdentity.GetCurrent())sid=identity.User.Value;
                using(var mutex=new Mutex(false,FixturePrefix+sid)){Output("keeper_ready");Require(Console.ReadLine()=="release","Expected keeper release");}return 0;
            }
            if(args[0]=="owner-normal"||args[0]=="owner-protected")return Owner(args[0]=="owner-protected",false);
            if(args[0]=="failure-normal"||args[0]=="failure-protected")return Owner(args[0]=="failure-protected",true);
            if(args[0]=="try-normal"||args[0]=="try-protected"){Output(Try(args[0]=="try-protected")?"acquired":"contended");return 0;}
            throw new Exception("Unknown fixture mode");
        }catch(Exception error){Output(error.ToString());return 1;}
    }
}
