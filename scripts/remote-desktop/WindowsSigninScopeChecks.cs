using System;
public static class SodaDesktopSigninScopeChecks {
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static SodaDesktopSigninScope.Facts Facts(){return new SodaDesktopSigninScope.Facts{Candidate=true,BrokerAlive=true,WorkerAlive=true,Session=1,BrokerPid=100,BrokerStarted=123,WorkerPid=101,WorkerStarted=456};}
    static SodaDesktopSigninScope Scope(bool input){return new SodaDesktopSigninScope(1,100,123,101,456,input);}
    public static void Run(){
        var facts=Facts();var scope=Scope(true);Func<SodaDesktopSigninScope.Facts> read=()=>facts;
        Check(scope.Current(read),"Valid signin scope rejected");Check(!scope.Input(1,read),"Input before explicit control accepted");
        Check(scope.Control(true,read)&&scope.Input(1,read),"Explicit signin input rejected");
        Check(!scope.Input(1,read)&&scope.Input(2,read),"Input sequence replay accepted");
        scope.Control(false,read);Check(!scope.Input(3,read),"Released control accepted input");scope.Close();Check(!scope.Current(read),"Closed scope revived");
        var view=Scope(false);Check(!view.Control(true,read)&&!view.Input(1,read),"Readonly scope enabled input");
        foreach(string kind in new[]{"candidate","broker","worker","session","broker-pid","broker-time","worker-pid","worker-time"}){
            var value=Facts();var current=Scope(true);Func<SodaDesktopSigninScope.Facts> get=()=>value;Check(current.Current(get)&&current.Control(true,get),"Initial scope failed");
            switch(kind){case "candidate":value.Candidate=false;break;case "broker":value.BrokerAlive=false;break;case "worker":value.WorkerAlive=false;break;case "session":value.Session=2;break;case "broker-pid":value.BrokerPid++;break;case "broker-time":value.BrokerStarted++;break;case "worker-pid":value.WorkerPid++;break;case "worker-time":value.WorkerStarted++;break;}
            Check(!current.Input(1,get),"Changed signin facts accepted input: "+kind);value=Facts();Check(!current.Current(get),"Invalid signin scope revived: "+kind);
        }
        var live=Scope(true);Check(live.Control(true,Facts),"Control fixture failed");for(int i=1;i<=5000;i++)Check(live.Input(i,Facts),"Healthy scope stopped after an operation count");
        var throwing=Scope(true);Check(!throwing.Current(()=>{throw new Exception("private-generated");}),"Throwing facts accepted");Check(!throwing.Current(Facts),"Throwing scope revived");
        Console.WriteLine("signin_scope_direct_process_session_consent_and_replay_passed");
    }
}
