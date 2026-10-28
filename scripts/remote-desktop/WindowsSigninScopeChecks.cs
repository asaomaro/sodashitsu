using System;
public static class SodaDesktopSigninScopeChecks {
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static readonly Guid Nonce=new Guid("11111111-1111-4111-8111-111111111111");
    static SodaDesktopSigninScope.Facts Facts(){return new SodaDesktopSigninScope.Facts{Candidate=true,Observer=true,BrokerAlive=true,WorkerAlive=true,Session=1,BrokerPid=100,BrokerStarted=123,WorkerPid=101,WorkerStarted=456,Nonce=Nonce,Epoch=0};}
    static SodaDesktopSigninScope Scope(bool input,Func<long> now){return new SodaDesktopSigninScope(1,100,123,101,456,Nonce,input,now);}
    public static void Run(){
        long now=0;var facts=Facts();var scope=Scope(true,()=>now);Func<SodaDesktopSigninScope.Facts> read=()=>facts;
        Check(scope.Current(read),"Valid signin scope rejected");Check(!scope.Input(1,1,read),"Input before explicit control accepted");
        Check(scope.Control(true,read),"Explicit signin control rejected");Check(!scope.Drawn(1,read),"Acknowledgement before publication accepted");
        var frame=scope.Capture(read);Check(frame!=null&&scope.Publish(frame,read),"Valid signin frame rejected");Check(!scope.Publish(frame,read),"Repeated frame publication accepted");
        Check(!scope.Drawn(2,read)&&scope.Drawn(1,read),"Future frame acknowledgement accepted");Check(scope.Input(1,1,read),"Valid signin input rejected");
        Check(!scope.Input(1,1,read)&&!scope.Input(2,2,read),"Replayed input or wrong frame accepted");now=1500;Check(!scope.Input(2,1,read),"Stale signin input accepted");
        scope.Control(false,read);Check(!scope.Input(2,1,read),"Released control accepted input");scope.Close();Check(!scope.Current(read),"Closed scope revived");
        now=0;var late=Scope(true,()=>now);var lateFrame=late.Capture(read);Check(late.Publish(lateFrame,read),"Late ACK fixture failed");now=1000;Check(late.Drawn(1,read)&&late.Control(true,read),"Delayed ACK fixture failed");now=2000;Check(!late.Input(1,1,read),"Delayed ACK refreshed capture age");
        var view=Scope(false,()=>0);Check(!view.Control(true,read),"Readonly scope enabled control");
        foreach(string kind in new[]{"candidate","observer","broker","worker","session","broker-pid","broker-time","worker-pid","worker-time","nonce","epoch"}){
            var value=Facts();var current=Scope(true,()=>0);Func<SodaDesktopSigninScope.Facts> get=()=>value;Check(current.Current(get),"Initial scope failed");var ticket=current.Capture(get);
            switch(kind){case "candidate":value.Candidate=false;break;case "observer":value.Observer=false;break;case "broker":value.BrokerAlive=false;break;case "worker":value.WorkerAlive=false;break;case "session":value.Session=2;break;case "broker-pid":value.BrokerPid++;break;case "broker-time":value.BrokerStarted++;break;case "worker-pid":value.WorkerPid++;break;case "worker-time":value.WorkerStarted++;break;case "nonce":value.Nonce=Guid.NewGuid();break;case "epoch":value.Epoch++;break;}
            Check(!current.Publish(ticket,get),"Changed signin facts published: "+kind);value=Facts();Check(!current.Current(get),"Invalid signin scope revived: "+kind);
        }
        now=0;facts=Facts();scope=Scope(true,()=>now);var pending=scope.Capture(read);now=1500;Check(!scope.Publish(pending,read),"Stale frame published");
        now=0;scope=Scope(true,()=>now);Check(scope.Current(read),"Fresh scope failed");now=120000;Check(!scope.Current(read),"Expired signin scope accepted");now=0;Check(!scope.Current(read),"Expired signin scope revived");
        now=1;scope=Scope(true,()=>now);Check(scope.Current(read),"Clock fixture failed");now=0;Check(!scope.Current(read),"Backwards clock accepted");
        var reentrant=Scope(true,()=>0);Check(!reentrant.Current(()=>{reentrant.Close();return Facts();}),"Synchronous revocation accepted");
        var throwing=Scope(true,()=>0);Check(!throwing.Current(()=>{throw new Exception("private-generated");}),"Throwing facts accepted");Check(!throwing.Current(Facts),"Throwing scope revived");
        var first=Scope(true,()=>0);var second=Scope(true,()=>0);var owned=first.Capture(Facts);Check(!second.Publish(owned,Facts),"Foreign frame ticket accepted");
        now=0;var release=Scope(true,()=>now);Check(!release.Control(true,()=>{release.Control(false,Facts);return Facts();}),"Reentrant release was overwritten");
        var pendingInput=Scope(true,()=>0);var inputFrame=pendingInput.Capture(Facts);Check(pendingInput.Publish(inputFrame,Facts)&&pendingInput.Drawn(1,Facts)&&pendingInput.Control(true,Facts),"Reentrant input fixture failed");
        Check(!pendingInput.Input(1,1,()=>{pendingInput.Control(false,Facts);return Facts();}),"Input committed after reentrant release");
        var replaced=Scope(true,()=>0);var oldFrame=replaced.Capture(Facts);Check(!replaced.Publish(oldFrame,()=>{replaced.Capture(Facts);return Facts();}),"Replaced frame ticket published");
        foreach(string operation in new[]{"publish","drawn","input"}){
            now=0;var delayed=Scope(true,()=>now);var ticket=delayed.Capture(Facts);
            if(operation!="publish")Check(delayed.Publish(ticket,Facts),"Delayed facts fixture failed");
            if(operation=="input")Check(delayed.Drawn(1,Facts)&&delayed.Control(true,Facts),"Delayed input fixture failed");
            int calls=0;Func<SodaDesktopSigninScope.Facts> slow=()=>{if(++calls>=2)now+=1600;return Facts();};
            bool accepted=operation=="publish"?delayed.Publish(ticket,slow):operation=="drawn"?delayed.Drawn(1,slow):delayed.Input(1,1,slow);
            Check(!accepted||now<1500,"Slow facts refreshed capture: "+operation);
        }
        Console.WriteLine("signin_scope_generated_epoch_expiry_frame_and_input_passed");
    }
}
