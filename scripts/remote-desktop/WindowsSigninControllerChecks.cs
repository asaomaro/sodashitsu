// Full orchestration on ordinary generated files/processes. Never real SCM,
// privileged Host Main, installed paths, user trust/keys or protected desktop.
using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Globalization;
public static class SodaDesktopSigninControllerChecks {
    const string Owner="S-1-5-21-1-2-3-1001",Package="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
    static void Wait(Func<bool> ready,string message){var timer=Stopwatch.StartNew();while(timer.ElapsedMilliseconds<10000){if(ready())return;Thread.Sleep(10);}throw new InvalidOperationException(message);}
    static SodaDesktopSigninRunJournal Journal(string root,string barrier,SodaDesktopSigninRunJournal.Role role,Func<bool> scope){return new SodaDesktopSigninRunJournal(Path.Combine(root,"runs"),Owner,Package,barrier,role,scope,bytes=>true,new[]{root},null,()=>EnterJournal(root));}
    sealed class GeneratedLease:IDisposable {Mutex mutex;internal GeneratedLease(Mutex mutex){this.mutex=mutex;}public void Dispose(){if(mutex!=null){mutex.ReleaseMutex();mutex.Dispose();mutex=null;}}}
    static IDisposable EnterJournal(string root){string hash;using(var sha=System.Security.Cryptography.SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(root))).Replace("-","");var mutex=new Mutex(false,"Local\\soda-generated-journal-"+hash);try{if(!mutex.WaitOne(5000))throw new InvalidOperationException("Generated journal lock timeout");return new GeneratedLease(mutex);}catch{mutex.Dispose();throw;}}
    sealed class FakeCalls:SodaDesktopSigninScm.Calls {
        internal Action Inspecting,Querying,Starting,Stopping;internal Func<SodaDesktopSigninScm.Status> Status;
        internal int Starts,Stops;internal bool Closed;
        public void Inspect(){if(Inspecting!=null)Inspecting();}
        public SodaDesktopSigninScm.Status Query(){if(Querying!=null)Querying();return Status==null?new SodaDesktopSigninScm.Status(1,0,0,0):Status();}
        public void Start(){Starts++;if(Starting!=null)Starting();}
        public void Stop(){Stops++;if(Stopping!=null)Stopping();}
        public void Dispose(){Closed=true;}
    }
    sealed class Fixture:IDisposable {
        internal readonly string Root=Path.Combine(Path.GetTempPath(),"soda-controller-"+Guid.NewGuid().ToString("N"));
        readonly string executable;readonly int exitCode;readonly EventWaitHandle stop;readonly string eventName;readonly EventWaitHandle exitGate;readonly bool premature;internal bool AwaitedExit;internal readonly FakeCalls Calls=new FakeCalls();
        internal readonly SodaDesktopSigninScm Service;internal readonly SodaDesktopSigninController.Context Context;internal Process Host;internal bool Current=true,ForgeClean;readonly bool natural;
        internal Fixture(string executable,int exitCode,bool natural=false,bool premature=false){this.natural=natural;this.premature=premature;
            this.executable=executable;this.exitCode=exitCode;Directory.CreateDirectory(Root);foreach(string name in new[]{"runs","runtime","admin"})Directory.CreateDirectory(Path.Combine(Root,name));File.WriteAllBytes(Path.Combine(Root,"quiescence.lock"),new byte[]{83});
            string barrier;using(var pin=Barrier())barrier=pin.Fingerprint;
            var fields=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",Owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",Package},{"barrierSha256",barrier},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}};
            using(var installer=Journal(Root,barrier,SodaDesktopSigninRunJournal.Role.Installer,()=>true))installer.Initialize(SodaDesktopSigninRunRecord.Build(fields,Owner));
            eventName="Local\\soda-controller-fixture-"+Guid.NewGuid().ToString("N");stop=new EventWaitHandle(false,EventResetMode.ManualReset,eventName);exitGate=new EventWaitHandle(!premature,EventResetMode.ManualReset,eventName+"-exit");
            Calls.Starting=()=>{stop.Reset();Host=Process.Start(new ProcessStartInfo(executable,"--generated-host \""+Root+"\" "+eventName+" "+exitCode+" "+(natural?"natural":"stop")+" "+eventName+"-exit"){UseShellExecute=false,CreateNoWindow=true});};Calls.Stopping=()=>stop.Set();
            Calls.Status=()=>premature&&Calls.Stops>0?new SodaDesktopSigninScm.Status(1,0,0,0):Host==null?new SodaDesktopSigninScm.Status(1,0,1077,0):Host.HasExited?new SodaDesktopSigninScm.Status(1,0,ForgeClean?0u:(uint)Host.ExitCode,0):new SodaDesktopSigninScm.Status(4,(uint)Host.Id,0,0);
            Service=new SodaDesktopSigninScm(Calls,()=>Current);
            Context=new SodaDesktopSigninController.Context(Owner,Package,Service,()=>Current,Barrier,(role,hash,scope)=>Journal(Root,hash,role,scope),(started,scope)=>SodaDesktopSigninProcessEvidence.OpenCore((uint)(long)started.Field("pid"),(string)started.Field("createdFiletime"),executable,false,scope),(intent,scope)=>SodaDesktopSigninRunStorage.ModeCore(Path.Combine(Root,"admin"),Owner,intent,scope,bytes=>true),ms=>{if(premature&&Calls.Stops>0&&!Host.HasExited){AwaitedExit=true;exitGate.Set();}Thread.Sleep(ms);});
        }
        SodaDesktopSigninQuiescence.Pin Barrier(){return SodaDesktopSigninQuiescence.OpenCore(Path.Combine(Root,"quiescence.lock"),new[]{Root},(path,bytes)=>true);}
        internal IDictionary<string,object> Run(string action,string mode="normal",string nonce=null,string digest=null){try{return SodaDesktopSigninController.RunCore(action,mode,nonce,digest,Context);}catch{Console.WriteLine("generated_controller_failure action="+action+" host="+(Host==null?"none":Host.HasExited?"exit:"+Host.ExitCode:"live")+" starts="+Calls.Starts+" stops="+Calls.Stops+" files="+String.Join(",",Directory.GetFiles(Path.Combine(Root,"runs"))));string error=Path.Combine(Root,"generated-error.txt");if(File.Exists(error))Console.WriteLine(File.ReadAllText(error));throw;}}
        internal void Ready(){Wait(()=>File.Exists(Path.Combine(Root,"child-ready")),"Generated host did not resume child");}
        public void Dispose(){stop.Set();exitGate.Set();if(Host!=null){if(!Host.WaitForExit(10000)){Host.Kill();Host.WaitForExit(5000);}Host.Dispose();}Service.Dispose();stop.Dispose();exitGate.Dispose();Directory.Delete(Root,true);}
    }
    public static void Run(string executable){
        ScmGuards();Serialization(executable);
        using(var f=new Fixture(executable,0,false,true)){
            f.Run("start");f.Ready();IDictionary<string,object> result;try{result=f.Run("stop");}catch(InvalidOperationException error){throw new InvalidOperationException("Stopped SCM status was mistaken for process exit",error);}Check(f.AwaitedExit&&(string)result["journal"]=="complete","Stopped SCM status was mistaken for process exit");
        }
        using(var f=new Fixture(executable,0)){
            Check((string)f.Run("status")["journal"]=="initial"&&f.Calls.Starts==0&&f.Calls.Stops==0,"Status changed generated service");
            Check((string)f.Run("start")["state"]=="observation-acknowledged","Generated controller start was not acknowledged");f.Ready();Check(f.Calls.Starts==1,"Controller repeated service start");
            Check((string)f.Run("stop")["journal"]=="complete","Exact observed clean stop was not persisted");Check(f.Calls.Stops==1&&f.Host.HasExited,"Generated controller stop did not settle");
            f.Host.Dispose();f.Host=null;File.Delete(Path.Combine(f.Root,"child-ready"));
            Check((string)f.Run("start")["state"]=="observation-acknowledged","Clean run did not allow new generation");f.Ready();Check((string)f.Run("stop")["journal"]=="complete"&&f.Calls.Starts==2&&f.Calls.Stops==2,"Second generated run was not independent");
        }
        using(var f=new Fixture(executable,0,true)){
            f.Run("start");f.Ready();Wait(()=>File.Exists(Path.Combine(f.Root,"runs","stopped")),"Natural normal completion receipt unavailable");Wait(()=>File.Exists(Path.Combine(f.Root,"wait-entering")),"Normal host did not reach idle ownership");Check(!f.Host.WaitForExit(500)&&!File.Exists(Path.Combine(f.Root,"wait-returned")),"Clean normal Host exited before stop observer could pin it");Check((string)f.Run("stop")["journal"]=="complete","Natural normal completion could not be stopped cleanly");
        }
        using(var f=new Fixture(executable,0)){
            string nonce=Guid.NewGuid().ToString("D"),digest;byte[] plain=System.Text.Encoding.UTF8.GetBytes("generated admin request");byte[] cipher=null;
            try{using(var envelope=SodaDesktopSigninAdminEnvelope.Protect(plain,Owner,nonce))cipher=envelope.Encode();File.WriteAllBytes(Path.Combine(f.Root,"admin","admin.pending"),cipher);using(var sha=System.Security.Cryptography.SHA256.Create())digest=BitConverter.ToString(sha.ComputeHash(cipher)).Replace("-","").ToLowerInvariant();}finally{Array.Clear(plain,0,plain.Length);if(cipher!=null)Array.Clear(cipher,0,cipher.Length);}
            var result=f.Run("start","admin",nonce,digest);Check((string)result["journal"]=="complete"&&f.Host.HasExited&&f.Calls.Stops==0,"Short admin completion was not independently observed");Check((string)result["adminResult"]=="inspect-required","Admin resource stop became operation success");Refused(()=>f.Run("start"),"Unacknowledged admin request fell back to normal run");
            // Simulated explicit request/result acknowledgment on generated data;
            // this is not a product admin operation or automatic journal cleanup.
            File.Delete(Path.Combine(f.Root,"admin","admin.pending"));File.Delete(Path.Combine(f.Root,"child-ready"));f.Host.Dispose();f.Host=null;f.Run("start");f.Ready();Check((string)f.Run("stop")["journal"]=="complete","Observed admin run did not permit a fresh explicit normal start");
        }
        using(var f=new Fixture(executable,7)){
            f.ForgeClean=true;f.Run("start");f.Ready();Refused(()=>f.Run("stop"),"Nonzero host exit was accepted");Check(File.Exists(Path.Combine(f.Root,"runs","stopped"))&&!File.Exists(Path.Combine(f.Root,"runs","stop-observed")),"Nonzero host exit became observed stop");Refused(()=>f.Run("start"),"Host receipt alone restarted after bad exit");
        }
        using(var f=new Fixture(executable,0)){f.Current=false;Refused(()=>f.Run("start"),"Revoked controller started service");Check(f.Calls.Starts==0,"Revoked controller touched service");}
        Console.WriteLine("signin_controller_actual_ordinary_host_child_job_ack_stop_observation_and_recovery_passed");
    }
    static void Serialization(string executable){
        using(var f=new Fixture(executable,0))using(var pin=f.Context.Barrier())using(var writer=f.Context.Journal(SodaDesktopSigninRunJournal.Role.Controller,pin.Fingerprint,()=>true))using(var reader=f.Context.Journal(SodaDesktopSigninRunJournal.Role.Reader,pin.Fingerprint,()=>true))
        using(var staged=new ManualResetEvent(false))using(var release=new ManualResetEvent(false))using(var reading=new ManualResetEvent(false))using(var readDone=new ManualResetEvent(false)){
            long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();var fields=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",Owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",Package},{"barrierSha256",pin.Fingerprint},{"issuedAt",now},{"expiresAt",now+60000},{"mode","normal"}};var intent=SodaDesktopSigninRunRecord.Build(fields,Owner);
            Exception writeError=null,readError=null;string state=null;writer.AfterStageClosed=()=>{staged.Set();if(!release.WaitOne(5000))throw new InvalidOperationException("Generated staged writer timeout");};
            var writeThread=new Thread(()=>{try{writer.Prepare(intent);}catch(Exception error){writeError=error;}});var readThread=new Thread(()=>{reading.Set();try{state=reader.State();}catch(Exception error){readError=error;}finally{readDone.Set();}});bool started=false,blocked=false;
            writeThread.Start();try{Check(staged.WaitOne(5000),"Generated writer did not reach staged boundary");readThread.Start();started=true;Check(reading.WaitOne(5000),"Generated reader did not begin");var timer=Stopwatch.StartNew();while(timer.ElapsedMilliseconds<2000&&!readDone.WaitOne(0)&&(readThread.ThreadState&System.Threading.ThreadState.WaitSleepJoin)==0)Thread.Sleep(1);blocked=!readDone.WaitOne(100)&&(readThread.ThreadState&System.Threading.ThreadState.WaitSleepJoin)!=0;}
            finally{release.Set();Check(writeThread.Join(5000)&&(!started||readThread.Join(5000)),"Generated journal threads did not settle");}
            Check(blocked&&writeError==null&&readError==null&&state=="pending","Reader observed incomplete run publication");
        }
    }
    static void ScmGuards(){
        var calls=new FakeCalls();bool live=true;calls.Inspecting=()=>live=false;using(var scm=new SodaDesktopSigninScm(calls,()=>live)){Refused(()=>scm.Start(()=>true),"Revoked SCM scope started service");Check(calls.Starts==0,"Revoked SCM scope reached start call");}
        calls=new FakeCalls();int checks=0;using(var scm=new SodaDesktopSigninScm(calls,()=>true)){Refused(()=>scm.Start(()=>++checks>1),"Unready start intent reached SCM");Check(calls.Starts==0,"Unready start intent was consumed");}
        calls=new FakeCalls();using(var scm=new SodaDesktopSigninScm(calls,()=>true)){bool once=true;calls.Querying=()=>{if(once){once=false;try{scm.Query();}catch(InvalidOperationException){}}};Refused(()=>scm.Query(),"SCM query reentry retained authority");}
        calls=new FakeCalls();using(var self=Process.GetCurrentProcess())using(var pin=SodaDesktopSigninProcessEvidence.OpenCore((uint)self.Id,self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(CultureInfo.InvariantCulture),self.MainModule.FileName,false,()=>true)){
            calls.Status=()=>new SodaDesktopSigninScm.Status(4,(uint)self.Id+1,0,0);using(var scm=new SodaDesktopSigninScm(calls,()=>true)){Refused(()=>scm.Stop(pin),"Wrong SCM process was stopped");Check(calls.Stops==0,"Wrong process reached SCM stop");}
        }
        Check(System.Runtime.InteropServices.Marshal.SizeOf(typeof(SodaDesktopSigninScm.ProcessStatus))==36,"SCM process ABI changed");
        Refused(()=>SodaDesktopSigninScm.Decode(new SodaDesktopSigninScm.ProcessStatus{Type=0x20,State=1}),"Shared SCM process accepted");Refused(()=>SodaDesktopSigninScm.Decode(new SodaDesktopSigninScm.ProcessStatus{Type=0x10,State=4,Pid=0}),"Running SCM status accepted missing PID");
    }
    public static void Main(string[] args){
        if(args.Length>0&&args[0]=="--generated-stop-success"){SodaDesktopSigninHostChecks.Main(args);return;}
        if(args.Length!=6||args[0]!="--generated-host")throw new InvalidOperationException("Generated host mode required");string root=args[1];int code=Int32.Parse(args[3],CultureInfo.InvariantCulture);
        try{using(var stop=EventWaitHandle.OpenExisting(args[2]))using(var held=SodaDesktopSigninHost.Barrier(Path.Combine(root,"runtime"),bytes=>true)){
            var clock=Stopwatch.StartNew();using(var self=Process.GetCurrentProcess()){
                var identity=new SodaDesktopSigninProcessEvidence.Identity((uint)self.Id,self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(CultureInfo.InvariantCulture));string barrier=held.Before.Fingerprint();
                using(var run=SodaDesktopSigninRunSession.OpenCore(Journal(root,barrier,SodaDesktopSigninRunJournal.Role.Host,()=>true),identity,()=>true,()=>stop.WaitOne(0),ms=>stop.WaitOne(ms),()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),()=>clock.ElapsedMilliseconds,intent=>SodaDesktopSigninRunStorage.ModeCore(Path.Combine(root,"admin"),Owner,intent,()=>true,bytes=>true),null))
                using(var child=SodaDesktopSigninProcess.Start(SodaDesktopSigninHostChecks.Fixture(self.MainModule.FileName,Path.Combine(root,"runtime"),"--generated-stop-success"),()=>!stop.WaitOne(0),()=>run.Resume(),()=>run.ConfirmResume())){
                    File.WriteAllText(Path.Combine(root,"child-ready"),"generated");if(!run.Admin&&args[4]!="natural"&&!stop.WaitOne(10000))throw new InvalidOperationException("Generated stop was not requested");if(!child.TryGraceful())throw new InvalidOperationException("Generated child was not clean");run.Complete(child,()=>true);File.WriteAllText(Path.Combine(root,"wait-entering"),"generated");SodaDesktopSigninHost.WaitAfterCompletion(run,stop,()=>true);File.WriteAllText(Path.Combine(root,"wait-returned"),"generated");
                }
            }
        }
        }catch(Exception error){File.WriteAllText(Path.Combine(root,"generated-error.txt"),error.ToString());Environment.Exit(9);}
        using(var exitGate=EventWaitHandle.OpenExisting(args[5]))if(!exitGate.WaitOne(10000))throw new InvalidOperationException("Generated exit gate was not released");
        Environment.Exit(code);
    }
}
