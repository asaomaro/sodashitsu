using System;
using System.IO;
using System.Threading;
using System.IO.Pipes;
using System.Text;
using System.Threading.Tasks;
public static class SodaDesktopProtectedHandshakeChecks {
    static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
    static SodaDesktopProtectedScope Scope(){return new SodaDesktopProtectedScope(SodaDesktopProtectedScope.Mode.ElevatedDefault,4,"S-1-5-21-1-2-3-1001","S-1-5-5-1-2",1,1,Guid.NewGuid(),11,638000000000000001L,12,638000000000000002L);}
    sealed class WaitingReader:TextReader {
        readonly ManualResetEventSlim closed=new ManualResetEventSlim(false);
        public override int Read(){if(!closed.Wait(2000))throw new Exception("Generated blocked read was not closed by deadline");return -1;}
        protected override void Dispose(bool disposing){closed.Set();}
    }
    static void RealPipe(bool respond){
        string name="SodaDesktopProtectedHandshakeTest-"+Guid.NewGuid().ToString("N");var scope=Scope();int closes=0;
        using(var server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))
        using(var client=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)){
            var accepting=server.WaitForConnectionAsync();client.Connect(2000);Need(accepting.Wait(2000),"Generated pipe connection deadline");
            var fromWorker=new StreamReader(server,new UTF8Encoding(false,true),false,4096,true);
            var toWorker=new StreamWriter(server,new UTF8Encoding(false),4096,true){AutoFlush=true};
            var fromBroker=new StreamReader(client,new UTF8Encoding(false,true),false,4096,true);
            var toBroker=new StreamWriter(client,new UTF8Encoding(false),4096,true){AutoFlush=true};
            {
                var broker=Task.Run(()=>{
                    SodaDesktopProtectedHandshake.Broker(scope,fromWorker,toWorker,()=>true,()=>{Interlocked.Increment(ref closes);server.Dispose();},respond?2000:250);
                    toWorker.WriteLine("generated-configure");
                });
                try{
                    Need(fromBroker.ReadLine()==scope.Encode(),"Kernel pipe scope prefix");
                    Need(!broker.IsCompleted,"Configure admitted before worker scope ready");
                    if(respond){
                        toBroker.WriteLine(scope.Ready());
                        var config=Task.Run(()=>fromBroker.ReadLine());
                        Need(config.Wait(2000)&&config.Result=="generated-configure"&&closes==0,"Configure did not follow same-tuple acknowledgement");
                        Need(broker.Wait(2000),"Kernel pipe acknowledgement deadline");
                    }
                    else{
                        bool failed=false;try{Need(broker.Wait(2000),"Pipe close did not interrupt blocked acknowledgement read");}catch(AggregateException){failed=broker.IsFaulted;}
                        Need(failed&&closes==1,"Silent worker did not fail/close exactly once");
                    }
                }finally{
                    server.Dispose();client.Dispose();try{broker.Wait(2000);}catch(AggregateException){}
                    // Flush-on-dispose must not mask a deliberate pipe-close test.
                    foreach(IDisposable resource in new IDisposable[]{toWorker,fromWorker,toBroker,fromBroker})try{resource.Dispose();}catch{}
                }
            }
        }
    }
    public static void Run(){
        RealPipe(true);RealPipe(false);
        var scope=Scope();var sent=new StringWriter();bool closed=false;
        using(var incoming=new StringReader(scope.Ready()+"\nsynthetic-public-ready\n")){
            SodaDesktopProtectedHandshake.Broker(scope,incoming,sent,()=>true,()=>closed=true);
            Need(!closed&&sent.ToString()==scope.Encode()+Environment.NewLine,"Broker prefix order or successful stream lifetime");
            Need(incoming.ReadLine()=="synthetic-public-ready","Handshake consumed a public helper message");
        }
        foreach(var invalid in new[]{scope.Encode(),"{\"type\":\"ready\"}",new string('x',4097),scope.Ready().Replace("elevated-default","elevated-uac")}){
            closed=false;bool rejected=false;try{SodaDesktopProtectedHandshake.Broker(scope,new StringReader(invalid+"\n"),new StringWriter(),()=>true,()=>closed=true);}catch{rejected=true;}
            Need(rejected&&closed,"Invalid worker acknowledgement forwarded configure");
        }
        sent=new StringWriter();closed=false;bool denied=false;
        try{SodaDesktopProtectedHandshake.Broker(scope,new StringReader(scope.Ready()+"\n"),sent,()=>false,()=>closed=true);}catch{denied=true;}
        Need(denied&&closed&&sent.ToString().Length==0,"Expired broker emitted prefix");
        int checks=0;closed=false;denied=false;
        try{SodaDesktopProtectedHandshake.Broker(scope,new StringReader(scope.Ready()+"\n"),new StringWriter(),()=>++checks==1,()=>closed=true);}catch{denied=true;}
        Need(denied&&closed,"Broker lifetime lost during acknowledgement was ignored");
        using(var blocked=new WaitingReader()){
            closed=false;denied=false;try{SodaDesktopProtectedHandshake.Broker(scope,blocked,new StringWriter(),()=>true,()=>{closed=true;blocked.Dispose();},10);}catch{denied=true;}
            Need(denied&&closed,"Silent worker did not close at handshake deadline");
        }
        var received=SodaDesktopProtectedHandshake.Receive(new StringReader(scope.Encode()+"\n"),peer=>peer.Same(scope));Need(received.Same(scope),"Authenticated scope rejected");
        denied=false;try{SodaDesktopProtectedHandshake.Receive(new StringReader(scope.Encode()+"\n"),peer=>false);}catch{denied=true;}Need(denied,"Unauthenticated scope accepted");
        sent=new StringWriter();denied=false;try{SodaDesktopProtectedHandshake.Confirm(sent,scope,()=>false);}catch{denied=true;}Need(denied&&sent.ToString().Length==0,"Invalid worker emitted scope ready");
        sent=new StringWriter();SodaDesktopProtectedHandshake.Confirm(sent,scope,()=>true);Need(scope.AcceptsReady(sent.ToString().TrimEnd('\r','\n')),"Wrong scope ready tuple");
        Console.WriteLine("protected_handshake_checks_passed: same-tuple prefix before configure, legacy/wrong mode/bounds rejected, owner lifetime and silent worker deadline; generated identities + fake streams + actual private duplex pipes; no worker/service/capture/input");
    }
}
