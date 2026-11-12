// Test compilation only; excluded from the closed runtime asset inventory.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static partial class SodaDesktopUnlock {
    public static void VerifyLeasePurposes(){
        int unlock=ParseBrokerPurpose(new[]{"pid","ticks"}),virtualOnly=ParseBrokerPurpose(new[]{"pid","ticks","virtual"}),both=ParseBrokerPurpose(new[]{"pid","ticks","both"});
        Require(AllowsBrokerRequest(unlock,"share")&&!AllowsBrokerRequest(unlock,"virtual"));
        Require(AllowsBrokerRequest(virtualOnly,"virtual")&&!AllowsBrokerRequest(virtualOnly,"share"));
        Require(AllowsBrokerRequest(both,"virtual")&&AllowsBrokerRequest(both,"share")&&!AllowsBrokerRequest(both,"unknown"));
        Require(VirtualShareAllowed(()=>1,()=>true)&&!VirtualShareAllowed(()=>1,()=>false)&&!VirtualShareAllowed(()=>0,()=>true));
        Console.WriteLine("desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes");
    }
    public static void VerifyProtectedPurposes(){
        foreach(int purpose in new[]{1,2,3,4,5,6,7}){
            var args=purpose==1?new[]{"pid","ticks"}:new[]{"pid","ticks",PurposeName(purpose)};
            Require(ParseBrokerPurpose(args)==purpose);
            Require(AllowsBrokerRequest(purpose,"share")==((purpose&1)!=0));
            Require(AllowsBrokerRequest(purpose,"virtual")==((purpose&2)!=0));
            foreach(string role in new[]{"elevated-default","elevated-uac"})Require(AllowsBrokerRequest(purpose,role)==((purpose&4)!=0));
            Require(!AllowsBrokerRequest(purpose,"unknown")&&!AllowsBrokerRequest(purpose,"--worker-v2"));
        }
        Require(LeaseArgument(false,false,false)=="--lease"&&LeaseArgument(false,true,false)=="--lease");
        Require(LeaseArgument(false,false,true)=="--lease-elevated"&&LeaseArgument(false,true,true)=="--lease-unlock-elevated"&&LeaseArgument(true,false,true)=="--lease-virtual-elevated"&&LeaseArgument(true,true,true)=="--lease-all");
        bool invalid=false;try{ParseBrokerPurpose(new[]{"pid","ticks","share"});}catch{invalid=true;}Require(invalid);
        Console.WriteLine("protected_broker_purpose_checks_passed: all fixed purpose bits/routes and legacy lease compatibility; no service/token/worker/input operations");
    }
    sealed class CleanupProcess:Process {public int DisposeCalls;protected override void Dispose(bool disposing){DisposeCalls++;base.Dispose(disposing);}}
    public static void VerifyWorkerCleanup(){
        Require(Job==IntPtr.Zero&&Worker==null&&WorkerPipe==null);long previous=Generation;var process=new CleanupProcess();
        try{
            var order=new List<string>();WorkerNonce=Guid.Empty;ReapCurrentWorker(()=>order.Add("pipe"),()=>order.Add("wait"),()=>order.Add("job"));
            if(String.Join(",",order)!="job,pipe")throw new InvalidOperationException("Legacy teardown must remain job-first without grace");
            order.Clear();WorkerNonce=Guid.NewGuid();ReapCurrentWorker(()=>order.Add("pipe"),()=>order.Add("wait"),()=>order.Add("job"));
            if(String.Join(",",order)!="pipe,wait,job")throw new InvalidOperationException("V2 teardown did not allow scoped release before job close");
            order.Clear();ReapCurrentWorker(()=>order.Add("pipe"),()=>{order.Add("wait");throw new Exception("generated wait failure");},()=>order.Add("job"));
            if(String.Join(",",order)!="pipe,wait,job")throw new InvalidOperationException("V2 wait failure skipped job cleanup");
            Generation=17;Worker=process;WorkerNonce=Guid.NewGuid();EndWorker(16);if(process.DisposeCalls!=0||Worker!=process||WorkerNonce==Guid.Empty)throw new InvalidOperationException("Stale generation disposed current worker");
            EndWorker(17);if(process.DisposeCalls!=1||Worker!=null||WorkerPipe!=null||WorkerNonce!=Guid.Empty)throw new InvalidOperationException("Current worker handle or scope was not released");
            EndWorker(17);if(process.DisposeCalls!=1)throw new InvalidOperationException("Worker handle disposed repeatedly");
        }finally{Worker=null;WorkerNonce=Guid.Empty;Generation=previous;if(process.DisposeCalls==0)process.Dispose();}
        Console.WriteLine("protected_worker_cleanup_passed: legacy job-first / v2 pipe-wait-job; stale generation cannot close current handles; matching teardown disposes once and clears scope; fake Process only");
    }
    public static void CheckPipeCancellation() {
        var clock=Stopwatch.StartNew();bool cancelled=false;
        using(var identity=WindowsIdentity.GetCurrent())
        using(var pipe=ServerPipe("-check-"+Guid.NewGuid().ToString("N"),true,LogonSid(identity),identity.User.Value))
            try{Accept(pipe,150);}catch(OperationCanceledException){cancelled=true;}
        Require(cancelled&&clock.ElapsedMilliseconds<3000);
        Console.WriteLine("desktop_unlock_pipe_cancelled");
    }
    public static void CheckPipeText() {
        string suffix="-check-"+Guid.NewGuid().ToString("N");
        using(var identity=WindowsIdentity.GetCurrent())
        using(var pipe=ServerPipe(suffix,true,LogonSid(identity),identity.User.Value)) {
            var accepted=System.Threading.Tasks.Task.Run(()=>Accept(pipe));
            using(var client=OpenClientPipe(PipeName+suffix)) {
                accepted.GetAwaiter().GetResult();uint pid;
                Require(GetNamedPipeClientProcessId(pipe.SafePipeHandle,out pid)&&pid==Process.GetCurrentProcess().Id);
                using(var writer=Writer(client))using(var reader=Reader(pipe)) {
                    writer.WriteLine("日本語\U0001f600");Require(Line(reader,64)=="日本語\U0001f600");
                }
            }
        }
        Console.WriteLine("desktop_unlock_utf8_pipe_passed");
    }
    public static void CheckPipeDuplex() {
        // Exercise the production client factory with a pending read before a
        // configure write. No desktop, service, capture, input or credentials.
        string suffix="-duplex-"+Guid.NewGuid().ToString("N"),expected="configure 日本語\U0001f600";
        using(var identity=WindowsIdentity.GetCurrent())
        using(var server=ServerPipe(suffix,true,LogonSid(identity),identity.User.Value)) {
            var accepted=System.Threading.Tasks.Task.Run(()=>Accept(server));
            using(var client=OpenClientPipe(PipeName+suffix)) {
                accepted.GetAwaiter().GetResult();
                var serverReader=Reader(server);var serverWriter=Writer(server);
                var clientReader=Reader(client);var clientWriter=Writer(client);
                try {
                    var peer=System.Threading.Tasks.Task.Run(()=>{string line=Line(serverReader,128);serverWriter.WriteLine(line);return line;});
                    var response=System.Threading.Tasks.Task.Run(()=>Line(clientReader,128));
                    Thread.Sleep(150);
                    var request=System.Threading.Tasks.Task.Run(()=>clientWriter.WriteLine(expected));
                    var tasks=new System.Threading.Tasks.Task[]{peer,response,request};bool complete=false;
                    try{complete=System.Threading.Tasks.Task.WaitAll(tasks,2000);}
                    finally{if(!complete){server.Dispose();try{System.Threading.Tasks.Task.WaitAll(tasks,2000);}catch{}}}
                    if(!complete)throw new InvalidOperationException("Pending pipe read blocked the configure write");
                    Require(peer.Result==expected&&response.Result==expected);
                } finally {
                    // Failed duplex tests close the server to release blocked
                    // reads. A cleanup flush must not mask that test failure.
                    foreach(IDisposable resource in new IDisposable[]{clientWriter,clientReader,serverWriter,serverReader})try{resource.Dispose();}catch{}
                }
            }
        }
        Console.WriteLine("desktop_unlock_duplex_pipe_passed");
    }
}
