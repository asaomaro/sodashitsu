// Bounded metadata relationships/leases only, NOT process/file/admin authority.
// Native adapters must separately verify the protected files and actual handles.
using System;
public sealed class SodaDesktopSigninRunAdmission {
    internal readonly object Gate=new object();public readonly SodaDesktopSigninRunRecord Intent;readonly Func<long> wall,mono;readonly long until;long lastWall,lastMono;bool ended,checking,taken,shutdown,confirmed;
    static Exception Failure(){return new InvalidOperationException("Signin run admission is unavailable");}
    public SodaDesktopSigninRunAdmission(SodaDesktopSigninRunRecord intent,Func<long> wall,Func<long> monotonic){
        try{if(intent==null||intent.Kind!="intent"||wall==null||monotonic==null)throw Failure();Intent=intent;this.wall=wall;mono=monotonic;lastWall=wall();lastMono=mono();long issued=(long)intent.Field("issuedAt"),expires=(long)intent.Field("expiresAt");if(lastWall<issued||lastWall>=expires||lastWall>9007199254740991||lastMono<0||lastMono>Int64.MaxValue-300000)throw Failure();until=lastMono+expires-lastWall;}catch{throw Failure();}
    }
    public bool Current(Func<bool> scope){lock(Gate){
        if(ended||taken||checking){shutdown=true;ended=true;return false;}checking=true;
        try{bool permitted=scope!=null&&scope();long now=wall(),at=mono();if(!permitted||ended||taken||now<lastWall||now>9007199254740991||now>=(long)Intent.Field("expiresAt")||at<lastMono||at>=until){ended=true;return false;}lastWall=now;lastMono=at;return true;}catch{ended=true;return false;}finally{checking=false;}
    }}
    public bool Take(Func<bool> scope){return TakeCore(scope,null);}
    internal bool TakeCore(Func<bool> scope,Action afterCurrent){lock(Gate){if(taken||!Current(scope))return false;if(afterCurrent!=null)afterCurrent();if(ended||taken)return false;taken=true;ended=true;return true;}}
    public bool ConfirmTaken(Func<bool> immediate){lock(Gate){
        if(!taken||shutdown||confirmed||checking){Close();return false;}checking=true;
        try{bool permitted=immediate!=null&&immediate();long now=wall(),at=mono();if(!permitted||shutdown||lastWall>now||now>9007199254740991||(long)Intent.Field("expiresAt")<=now||lastMono>at||until<=at){Close();return false;}lastWall=now;lastMono=at;confirmed=true;return true;}catch{Close();return false;}finally{checking=false;}
    }}
    public void Close(){lock(Gate){shutdown=true;ended=true;}}
}
public sealed class SodaDesktopSigninRunObservation {
    readonly SodaDesktopSigninRunAdmission admission;readonly SodaDesktopSigninRunRecord started;readonly Func<long> mono;readonly long until;long last;bool closed,checking,accepted,used,confirmed;
    static Exception Failure(){return new InvalidOperationException("Signin run observation is unavailable");}
    public SodaDesktopSigninRunObservation(SodaDesktopSigninRunAdmission admission,SodaDesktopSigninRunRecord started,Func<long> monotonic){
        try{if(admission==null||started==null||monotonic==null||started.Kind!="started"||!admission.Intent.SameRun(started)||(string)started.Field("intentSha256")!=admission.Intent.Digest()||(long)started.Field("startedAt")<(long)admission.Intent.Field("issuedAt")||(long)started.Field("startedAt")>=(long)admission.Intent.Field("expiresAt")||!admission.Current(()=>true))throw Failure();this.admission=admission;this.started=started;mono=monotonic;last=mono();if(last<0||last>Int64.MaxValue-10000)throw Failure();until=last+10000;}catch{throw Failure();}
    }
    bool Valid(Func<bool> scope){
        if(closed||used||checking){Close();return false;}checking=true;
        try{bool permitted=admission.Current(scope);long at=mono();if(!permitted||closed||used||at<last||at>=until){Close();return false;}last=at;return true;}catch{Close();return false;}finally{checking=false;}
    }
    public bool Accept(SodaDesktopSigninRunRecord ack,Func<bool> scope){lock(admission.Gate){
        if(accepted){Close();return false;}if(!Valid(scope))return false;
        try{if(ack==null||ack.Kind!="observation"||!started.SameProcess(ack)||(string)ack.Field("startedSha256")!=started.Digest()){Close();return false;}if(!Valid(scope))return false;accepted=true;return true;}catch{Close();return false;}
    }}
    public bool CanResume(Func<bool> scope){lock(admission.Gate){return accepted&&Valid(scope);}}
    public bool TakeResume(Func<bool> scope){lock(admission.Gate){
        if(!accepted||!Valid(scope))return false;
        try{if(!admission.Take(scope)){Close();return false;}long at=mono();if(closed||used||at<last||at>=until){Close();return false;}last=at;used=true;return true;}catch{Close();return false;}
    }}
    public bool ConfirmResume(Func<bool> immediate){lock(admission.Gate){
        if(closed||!used||confirmed||checking){Close();return false;}checking=true;
        try{if(!admission.ConfirmTaken(immediate)){Close();return false;}long at=mono();if(closed||last>at||until<=at){Close();return false;}last=at;confirmed=true;return true;}catch{Close();return false;}finally{checking=false;}
    }}
    public void Close(){lock(admission.Gate){closed=true;admission.Close();}}
}
