// One Host run: durable claim, actual self identity, controller ACK before any
// child resumes, and a receipt only after native child/Job cleanup is proved.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
internal sealed class SodaDesktopSigninRunSession:IDisposable {
    readonly object gate=new object();readonly SodaDesktopSigninRunJournal journal;readonly SodaDesktopSigninRunAdmission admission;readonly SodaDesktopSigninRunObservation observation;
    readonly SodaDesktopSigninRunRecord started;readonly Func<long> wall;readonly Func<bool> current,immediate;bool ended,resumed,finalized,completed,completing;
    static Exception Failure(){return new InvalidOperationException("Signin run session is unavailable");}
    SodaDesktopSigninRunSession(SodaDesktopSigninRunJournal journal,SodaDesktopSigninRunAdmission admission,SodaDesktopSigninRunObservation observation,SodaDesktopSigninRunRecord started,Func<long> wall,Func<bool> current,Func<bool> immediate){this.immediate=immediate;this.journal=journal;this.admission=admission;this.observation=observation;this.started=started;this.wall=wall;this.current=current;}
    static IDictionary<string,object> Fields(SodaDesktopSigninRunRecord intent,string kind){return new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind",kind},{"ownerSid",intent.Owner},{"runId",intent.RunId},{"packageSha256",intent.Field("packageSha256")},{"barrierSha256",intent.Field("barrierSha256")}};}
    internal static SodaDesktopSigninRunSession Open(SodaDesktopSigninRunJournal journal,string owner,Func<bool> current,WaitHandle stop){
        try{var clock=Stopwatch.StartNew();return OpenCore(journal,SodaDesktopSigninProcessEvidence.Self(),current,()=>stop.WaitOne(0),ms=>stop.WaitOne(ms),()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),()=>clock.ElapsedMilliseconds,intent=>SodaDesktopSigninRunStorage.Mode(owner,intent,current),null);}catch{if(journal!=null)journal.Dispose();throw;}
    }
    // Ordinary-file/fake-clock seam; actual Open always supplies native Self and
    // fixed installed admin storage, and never supplies an observation callback.
    internal static SodaDesktopSigninRunSession OpenCore(SodaDesktopSigninRunJournal journal,SodaDesktopSigninProcessEvidence.Identity self,Func<bool> current,Func<bool> stopped,Func<int,bool> wait,Func<long> wall,Func<long> mono,Func<SodaDesktopSigninRunRecord,bool> mode,Action<SodaDesktopSigninRunRecord> onStarted){
        SodaDesktopSigninRunAdmission admission=null;SodaDesktopSigninRunObservation observation=null;bool transferred=false;
        try{if(journal==null||self==null||current==null||stopped==null||wait==null||wall==null||mono==null||mode==null||stopped()||!current())throw Failure();
            var intent=journal.Claim(mode);admission=new SodaDesktopSigninRunAdmission(intent,wall,mono);if(!admission.Current(()=>!stopped()&&current()))throw Failure();
            var fields=Fields(intent,"started");fields.Add("pid",(long)self.Pid);fields.Add("createdFiletime",self.Created);fields.Add("startedAt",wall());fields.Add("intentSha256",intent.Digest());var started=SodaDesktopSigninRunRecord.Build(fields,intent.Owner);
            observation=new SodaDesktopSigninRunObservation(admission,started,mono);journal.Started(started);if(onStarted!=null)onStarted(started);
            long began=mono();if(began<0||began>Int64.MaxValue-10000)throw Failure();long last=began;
            while(journal.State()=="started"){
                long at=mono();if(at<last||at-began>=10000||!admission.Current(()=>!stopped()&&current())||wait(25))throw Failure();last=at;
            }
            if(!observation.Accept(journal.Observation(),()=>!stopped()&&current()))throw Failure();
            var result=new SodaDesktopSigninRunSession(journal,admission,observation,started,wall,()=>!stopped()&&current(),()=>!stopped());transferred=true;return result;
        }finally{if(!transferred){if(observation!=null)observation.Close();if(admission!=null)admission.Close();if(journal!=null)journal.Dispose();}}
    }
    internal bool Ready(){lock(gate){return !ended&&!resumed&&observation.CanResume(current);}}
    internal bool Resume(){lock(gate){if(ended||resumed||!observation.TakeResume(current)){ended=true;return false;}resumed=true;return true;}}
    internal bool ConfirmResume(){lock(gate){if(ended||!resumed||finalized||!observation.ConfirmResume(immediate)){ended=true;return false;}finalized=true;return true;}}
    internal void Complete(SodaDesktopSigninProcess.Child child,Func<bool> retained){CompleteCore(()=>child!=null&&child.TryGraceful(),retained);}
    internal void CompleteCore(Func<bool> childClean,Func<bool> retained){lock(gate){
        if(ended||!resumed||!finalized||completed||completing){ended=true;throw Failure();}completing=true;try{if(childClean==null||retained==null||!retained()||!childClean()||!retained()||ended)throw Failure();
        var fields=Fields(started,"stopped");fields.Add("pid",started.Field("pid"));fields.Add("createdFiletime",started.Field("createdFiletime"));fields.Add("stoppedAt",wall());fields.Add("startedSha256",started.Digest());fields.Add("nodeExitCode",0);fields.Add("jobEmpty",true);
        if(ended||!retained()||ended)throw Failure();journal.Stopped(SodaDesktopSigninRunRecord.Build(fields,started.Owner));completed=true;}catch{ended=true;throw;}finally{completing=false;}
    }}
    public void Dispose(){lock(gate){ended=true;observation.Close();admission.Close();journal.Dispose();}}
}
