using System;
using System.Threading;
using System.Collections.Generic;
public static class SodaDesktopSigninRunAdmissionChecks {
    const string Owner="S-1-5-21-1-2-3-1001",RunId="11111111-1111-4111-8111-111111111111";
    sealed class Fixture {
        internal long Wall=10000,Mono;internal bool Scope=true;
        internal readonly SodaDesktopSigninRunRecord Intent,Started,Ack;internal readonly SodaDesktopSigninRunAdmission Admission;internal readonly SodaDesktopSigninRunObservation Observation;
        internal Fixture(){Intent=Make("intent",null);Admission=new SodaDesktopSigninRunAdmission(Intent,()=>Wall,()=>Mono);Started=Make("started",Intent.Digest());Ack=Make("observation",Started.Digest());Observation=new SodaDesktopSigninRunObservation(Admission,Started,()=>Mono);}
    }
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static SodaDesktopSigninRunRecord Make(string kind,string digest){var fields=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind",kind},{"ownerSid",Owner},{"runId",RunId},{"packageSha256",new string('a',64)},{"barrierSha256",new string('b',64)}};if(kind=="intent"){fields.Add("issuedAt",10000);fields.Add("expiresAt",310000);fields.Add("mode","normal");}else{fields.Add("pid",1234);fields.Add("createdFiletime","134000000000000000");if(kind=="started"){fields.Add("startedAt",10000);fields.Add("intentSha256",digest);}else fields.Add("startedSha256",digest);}return SodaDesktopSigninRunRecord.Build(fields,Owner);}
    static SodaDesktopSigninRunRecord Changed(SodaDesktopSigninRunRecord record,string key,object value){var fields=record.Fields();fields[key]=value;return SodaDesktopSigninRunRecord.Build(fields,Owner);}
    static void Concurrent(){
        var f=new Fixture();using(var firstReady=new ManualResetEvent(false))using(var release=new ManualResetEvent(false))using(var secondReady=new ManualResetEvent(false))using(var secondHook=new ManualResetEvent(false))using(var secondDone=new ManualResetEvent(false)){
            int successes=0;var first=new Thread(()=>{if(f.Admission.TakeCore(()=>true,()=>{firstReady.Set();release.WaitOne(3000);}))Interlocked.Increment(ref successes);});var second=new Thread(()=>{secondReady.Set();if(f.Admission.TakeCore(()=>true,()=>secondHook.Set()))Interlocked.Increment(ref successes);secondDone.Set();});first.IsBackground=second.IsBackground=true;bool serialized=false;
            try{first.Start();Check(firstReady.WaitOne(3000),"Concurrent fixture first entry stalled");second.Start();Check(secondReady.WaitOne(3000),"Concurrent fixture second entry stalled");var timer=System.Diagnostics.Stopwatch.StartNew();while(timer.ElapsedMilliseconds<2000&&!secondHook.WaitOne(0)&&!secondDone.WaitOne(0)&&(second.ThreadState&ThreadState.WaitSleepJoin)==0)Thread.Sleep(1);serialized=!secondHook.WaitOne(0)&&!secondDone.WaitOne(0)&&(second.ThreadState&ThreadState.WaitSleepJoin)!=0;}
            finally{release.Set();Check(first.Join(3000)&&second.Join(3000),"Concurrent fixture threads did not settle");}
            Check(serialized&&successes==1,"Concurrent admission entered an uncompleted consume");Check(!f.Admission.Current(()=>true),"Concurrent consumed admission revived");
        }
        f=new Fixture();Check(f.Observation.Accept(f.Ack,()=>true),"Concurrent observation setup failed");using(var go=new ManualResetEvent(false)){int successes=0;var a=new Thread(()=>{go.WaitOne();if(f.Observation.TakeResume(()=>true))Interlocked.Increment(ref successes);});var b=new Thread(()=>{go.WaitOne();if(f.Observation.TakeResume(()=>true))Interlocked.Increment(ref successes);});a.IsBackground=b.IsBackground=true;a.Start();b.Start();go.Set();Check(a.Join(3000)&&b.Join(3000)&&successes==1,"Concurrent observation admitted two resumes");f.Observation.Close();Check(!f.Observation.CanResume(()=>true),"Closed concurrent observation revived");}
    }
    public static void Run(){
        Concurrent();var f=new Fixture();Check(!f.Observation.CanResume(()=>true),"Run resumed before process observation ACK");Check(f.Observation.Accept(f.Ack,()=>f.Scope),"Matching process observation was rejected");Check(f.Observation.CanResume(()=>true)&&f.Observation.TakeResume(()=>true),"Observed run did not admit exactly one resume");Check(!f.Observation.TakeResume(()=>true)&&!f.Observation.CanResume(()=>true),"Run admission was replayed");
        foreach(string field in new[]{"pid","createdFiletime","packageSha256","barrierSha256","runId","startedSha256"}){f=new Fixture();object changed=field=="pid"?(object)1235:field=="createdFiletime"?(object)"134000000000000001":field=="runId"?(object)"22222222-2222-4222-8222-222222222222":(object)new string('f',64);Check(!f.Observation.Accept(Changed(f.Ack,field,changed),()=>true),"Observation binding mismatch accepted: "+field);Check(!f.Observation.Accept(f.Ack,()=>true),"Invalid observation could be retried");}
        f=new Fixture();f.Mono=10000;Check(!f.Observation.Accept(f.Ack,()=>true),"Late observation ACK accepted");
        f=new Fixture();Check(f.Observation.Accept(f.Ack,()=>true),"Fresh observation rejected");f.Mono=10000;Check(!f.Observation.TakeResume(()=>true),"Late child resume accepted");
        f=new Fixture();Check(f.Observation.Accept(f.Ack,()=>true),"Fresh scope rejected");f.Scope=false;Check(!f.Observation.TakeResume(()=>f.Scope),"Revoked child scope resumed");
        f=new Fixture();f.Mono=300000;Check(!f.Admission.Current(()=>true),"Expired monotonic admission accepted");
        f=new Fixture();f.Wall=310000;Check(!f.Admission.Current(()=>true),"Expired wall admission accepted");
        f=new Fixture();f.Wall=9999;Check(!f.Admission.Current(()=>true),"Backward wall clock retained admission");
        f=new Fixture();f.Mono=10;Check(f.Admission.Current(()=>true),"Fresh monotonic check rejected");f.Mono=9;Check(!f.Admission.Current(()=>true),"Backward monotonic clock retained admission");
        f=new Fixture();var captured=f;Check(!f.Admission.Current(()=>{captured.Admission.Close();return true;}),"Reentrant admission close restored authority");
        f=new Fixture();captured=f;bool once=false;Check(!f.Admission.Current(()=>{if(!once){once=true;captured.Admission.Current(()=>true);}return true;}),"Reentrant admission check restored authority");
        f=new Fixture();captured=f;Check(!f.Observation.Accept(f.Ack,()=>{captured.Observation.Close();return true;}),"Reentrant observation close restored authority");
        f=new Fixture();Check(f.Observation.Accept(f.Ack,()=>true),"First observation failed");Check(!f.Observation.Accept(f.Ack,()=>true)&&!f.Observation.CanResume(()=>true),"Repeated observation ACK retained authority");
        Console.WriteLine("signin_run_admission_generated_expiry_observation_and_single_resume_passed");
    }
}
